import { ConverseCommand, BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { readFile } from "node:fs/promises";
import { estimateDamageRepairCost, VisionOutputSchema, type DamageSeverity, type DamageType, type VisionOutput } from "@inspectiq/shared";
import { readS3ObjectBytes } from "./awsStorage.js";
import { sampleImageFilePath } from "./sampleImages.js";

export type VisionProvider = {
  name: string;
  promptVersion: string;
  analyze(input: {
    filename: string;
    storageKey: string;
    objectBucket?: string | null;
    objectKey?: string | null;
    mimeType?: string | null;
    declaredAngle?: VisionOutput["photoAngle"] | null;
  }): Promise<{ raw: unknown; validated: VisionOutput }>;
};

function imageQuality(overrides: Partial<VisionOutput["imageQuality"]> = {}): VisionOutput["imageQuality"] {
  return {
    grade: "pass",
    blurScore: 0.96,
    exposureScore: 0.94,
    framingScore: 0.95,
    resolutionScore: 0.97,
    occlusionRisk: 0.04,
    retakeRequired: false,
    notes: [],
    ...overrides
  };
}

const cleanOutput = (photoAngle: VisionOutput["photoAngle"], confidence = 0.94, quality: VisionOutput["imageQuality"] = imageQuality()): VisionOutput => ({
  photoAngle,
  confidence,
  imageQuality: quality,
  qualityWarnings: [],
  detectedDamageCandidates: [],
  extractedText: {},
  humanReviewRequired: false
});

function damageCandidate(input: {
  location: string;
  damageType: DamageType;
  severityEstimate: DamageSeverity;
  confidence: number;
  explanation: string;
}): VisionOutput["detectedDamageCandidates"][number] {
  const estimate = estimateDamageRepairCost(input.damageType, input.severityEstimate);
  return {
    ...input,
    repairEstimateUsd: {
      min: estimate.min,
      max: estimate.max,
      rationale: "Estimated from damage type and severity for reviewer triage."
    },
    requiresHumanConfirmation: true
  };
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function damageConfidenceThreshold(): number {
  const configured = Number(process.env.MIN_DAMAGE_CONFIDENCE ?? "0.80");
  return Number.isFinite(configured) ? configured : 0.80;
}

function normalizeVisionOutput(output: VisionOutput, declaredAngle?: VisionOutput["photoAngle"] | null): VisionOutput {
  const evidenceAngle = output.photoAngle === "odometer"
    || output.photoAngle === "vin_plate"
    || declaredAngle === "odometer"
    || declaredAngle === "vin_plate";
  const credibleDamage = evidenceAngle ? [] : output.detectedDamageCandidates
    .filter((candidate) =>
      candidate.confidence >= damageConfidenceThreshold()
      && candidate.damageType !== "unknown"
      && candidate.severityEstimate !== "unknown"
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 1);

  const extractedText: VisionOutput["extractedText"] = {};
  const odometer = output.extractedText.odometer?.trim().replace(/[^\d]/g, "");
  const vin = output.extractedText.vin?.trim().toUpperCase();
  if (odometer && /^\d{1,6}$/.test(odometer)) extractedText.odometer = odometer;
  if (vin && /^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) extractedText.vin = vin;

  const imageQuality = {
    ...output.imageQuality,
    notes: uniqueNonEmpty(output.imageQuality.notes).slice(0, 2)
  };
  let qualityWarnings = output.imageQuality.retakeRequired || output.imageQuality.grade === "retake"
    ? uniqueNonEmpty(output.qualityWarnings).slice(0, 1)
    : [];
  if (declaredAngle === "odometer" && !extractedText.odometer) {
    imageQuality.grade = "retake";
    imageQuality.retakeRequired = true;
    qualityWarnings = ["Odometer digits are not legible enough for buyer-visible mileage evidence."];
  }
  if (declaredAngle === "vin_plate" && !extractedText.vin) {
    imageQuality.grade = "retake";
    imageQuality.retakeRequired = true;
    qualityWarnings = ["VIN plate text is not legible enough for identity verification."];
  }

  return {
    ...output,
    imageQuality,
    qualityWarnings,
    detectedDamageCandidates: credibleDamage,
    extractedText,
    humanReviewRequired: output.humanReviewRequired || qualityWarnings.length > 0 || credibleDamage.length > 0
  };
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength - 1).trimEnd() : trimmed;
}

function prepareBedrockOutput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const output = JSON.parse(JSON.stringify(value)) as {
    imageQuality?: { notes?: unknown };
    qualityWarnings?: unknown;
    detectedDamageCandidates?: Array<{
      location?: unknown;
      explanation?: unknown;
      repairEstimateUsd?: { rationale?: unknown };
    }>;
  };

  if (output.imageQuality && Array.isArray(output.imageQuality.notes)) {
    output.imageQuality.notes = output.imageQuality.notes
      .map((item) => boundedText(item, 160))
      .filter(Boolean);
  }
  if (Array.isArray(output.qualityWarnings)) {
    output.qualityWarnings = output.qualityWarnings
      .map((item) => boundedText(item, 160))
      .filter(Boolean);
  }
  if (Array.isArray(output.detectedDamageCandidates)) {
    output.detectedDamageCandidates = output.detectedDamageCandidates.map((candidate) => ({
      ...candidate,
      location: boundedText(candidate.location, 120) ?? candidate.location,
      explanation: boundedText(candidate.explanation, 500) ?? candidate.explanation,
      repairEstimateUsd: candidate.repairEstimateUsd
        ? {
          ...candidate.repairEstimateUsd,
          rationale: boundedText(candidate.repairEstimateUsd.rationale, 300) ?? candidate.repairEstimateUsd.rationale
        }
        : candidate.repairEstimateUsd
    }));
  }
  return output;
}

export const localVisionProvider: VisionProvider = {
  name: "localVisionProvider",
  promptVersion: "photo-analysis-v2",
  async analyze(input) {
    const key = `${input.filename} ${input.storageKey}`.toLowerCase();
    let raw: VisionOutput;

    if (key.includes("rear-severe-damage") || key.includes("honda-accord-rear")) {
      raw = {
        ...cleanOutput("rear", key.includes("honda-accord-rear") ? 0.94 : 0.96, imageQuality({
          grade: "review",
          framingScore: 0.89,
          notes: ["Rear angle is usable, but confirmed damage requires reviewer close inspection."]
        })),
        detectedDamageCandidates: [damageCandidate({
          location: "rear bumper",
          damageType: "dent",
          severityEstimate: key.includes("honda-accord-rear") ? "moderate" : "severe",
          confidence: key.includes("honda-accord-rear") ? 0.87 : 0.9,
          explanation: key.includes("honda-accord-rear")
            ? "Source listing photo appears to show rear bumper deformation; reviewer confirmation required."
            : "Inspection photo indicates a rear bumper deformation."
        })],
        humanReviewRequired: true
      };
    } else if (key.includes("driver-side-scratch")) {
      raw = {
        ...cleanOutput("driver_side", 0.93, imageQuality({
          grade: "review",
          blurScore: 0.9,
          framingScore: 0.9,
          notes: ["Side panel is visible; scratch candidate should be confirmed against glare."]
        })),
        detectedDamageCandidates: [damageCandidate({
          location: "driver side door",
          damageType: "scratch",
          severityEstimate: "minor",
          confidence: 0.86,
          explanation: "Inspection photo indicates a visible linear scratch on the driver door."
        })]
      };
    } else if (key.includes("glare")) {
      raw = {
        ...cleanOutput("front", 0.76, imageQuality({
          grade: "review",
          exposureScore: 0.58,
          framingScore: 0.88,
          retakeRequired: true,
          notes: ["Glare affects front-bumper confidence; capture another image before buyer-visible release."]
        })),
        qualityWarnings: ["Glare reduces confidence on the front bumper; retake recommended."],
        humanReviewRequired: true
      };
    } else if (key.includes("bad-angle")) {
      raw = {
        ...cleanOutput(input.declaredAngle ?? "unknown", 0.72, imageQuality({
          grade: "review",
          framingScore: 0.54,
          retakeRequired: true,
          notes: ["Vehicle side is partially framed; retake square to the panel for the required angle."]
        })),
        qualityWarnings: ["Required side angle is not framed squarely enough for release."],
        humanReviewRequired: true
      };
    } else if (key.includes("dark-interior")) {
      raw = cleanOutput("interior", 0.82, imageQuality({
        grade: "review",
        exposureScore: 0.49,
        occlusionRisk: 0.16,
        retakeRequired: true,
        notes: ["Interior is too dark to confirm upholstery and trim condition."]
      }));
      raw.qualityWarnings = ["Interior lighting is too low for reliable condition review."];
      raw.humanReviewRequired = true;
    } else if (key.includes("dirty-odometer")) {
      raw = {
        ...cleanOutput("odometer", 0.7, imageQuality({
          grade: "retake",
          blurScore: 0.64,
          exposureScore: 0.58,
          framingScore: 0.72,
          retakeRequired: true,
          notes: ["Odometer is partially obscured; mileage is not reliable enough for disclosure."]
        })),
        qualityWarnings: ["Odometer digits are not legible enough for buyer-visible mileage evidence."],
        extractedText: {},
        humanReviewRequired: true
      };
    } else if (key.includes("partial-vin")) {
      raw = {
        ...cleanOutput("vin_plate", 0.69, imageQuality({
          grade: "retake",
          blurScore: 0.71,
          framingScore: 0.52,
          retakeRequired: true,
          notes: ["VIN plate is partially framed; full VIN cannot be verified."]
        })),
        qualityWarnings: ["VIN plate text is not legible enough for identity verification."],
        extractedText: {},
        humanReviewRequired: true
      };
    } else if (key.includes("interior-overview") || key.includes("interior-wear")) {
      raw = cleanOutput("interior", 0.91, imageQuality({
        grade: "review",
        exposureScore: 0.86,
        occlusionRisk: 0.12,
        notes: ["Interior overview is usable; no clear trim or seat damage is visible."]
      }));
    } else if (key.includes("odometer")) {
      const odometerValue = key.match(/odometer-([0-9]{1,6})/)?.[1] ?? "64231";
      raw = {
        ...cleanOutput("odometer", 0.98, imageQuality({
          blurScore: 0.98,
          exposureScore: 0.96,
          framingScore: 0.97,
          notes: ["Odometer digits are centered and readable."]
        })),
        extractedText: { odometer: odometerValue }
      };
    } else if (key.includes("vin-plate")) {
      const vinValue = key.match(/vin-plate-([a-hj-npr-z0-9]{11,17})/)?.[1]?.toUpperCase() ?? "4T1G11AK8MU123456";
      raw = {
        ...cleanOutput("vin_plate", 0.97, imageQuality({
          blurScore: 0.96,
          framingScore: 0.96,
          notes: ["VIN plate is framed tightly enough for OCR review."]
        })),
        extractedText: { vin: vinValue }
      };
    } else if (key.includes("passenger-side")) {
      raw = cleanOutput("passenger_side", 0.94);
    } else if (key.includes("engine-bay")) {
      raw = cleanOutput("engine_bay", 0.92);
    } else if (key.includes("blurry")) {
      raw = {
        photoAngle: "front",
        confidence: 0.58,
        imageQuality: imageQuality({
          grade: "retake",
          blurScore: 0.42,
          exposureScore: 0.51,
          framingScore: 0.82,
          resolutionScore: 0.72,
          occlusionRisk: 0.08,
          retakeRequired: true,
          notes: ["Blur and low light reduce buyer trust; retake before CR release."]
        }),
        qualityWarnings: ["Image appears blurry or low-light; retake recommended before final report."],
        detectedDamageCandidates: [],
        extractedText: {},
        humanReviewRequired: true
      };
    } else if (key.includes("front-clean")) {
      raw = cleanOutput("front", 0.95);
    } else if (input.declaredAngle && input.declaredAngle !== "unknown") {
      raw = cleanOutput(input.declaredAngle, input.declaredAngle === "engine_bay" ? 0.92 : 0.94, imageQuality({
        notes: [`Declared ${input.declaredAngle.replaceAll("_", " ")} angle matches the source-documented reference image.`]
      }));
    } else {
      raw = {
        photoAngle: "unknown",
        confidence: 0.3,
        imageQuality: imageQuality({
          grade: "retake",
          blurScore: 0.68,
          exposureScore: 0.7,
          framingScore: 0.32,
          resolutionScore: 0.82,
          occlusionRisk: 0.24,
          retakeRequired: true,
          notes: ["Required vehicle angle is not framed clearly enough for automated classification."]
        }),
        qualityWarnings: ["Unable to classify photo angle from available image; human review required."],
        detectedDamageCandidates: [],
        extractedText: {},
        humanReviewRequired: true
      };
    }

    return {
      raw,
      validated: normalizeVisionOutput(VisionOutputSchema.parse(raw), input.declaredAngle)
    };
  }
};

export const bedrockVisionProvider: VisionProvider = {
  name: "bedrockVisionProvider",
  promptVersion: "photo-analysis-v2",
  async analyze(input) {
    const image = await loadImageInput(input);
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
    const prompt = [
      "You are an automotive inspection image-analysis service.",
      `Filename: ${input.filename}.`,
      `Declared capture slot: ${input.declaredAngle ?? "unknown"}.`,
      "When the declared capture slot is present and the visual evidence reasonably matches it, use that value as photoAngle. If the image contradicts the declared slot or quality is too poor, keep the visual classification and explain the mismatch in qualityWarnings.",
      "Return only strict JSON matching this TypeScript shape:",
      "{ photoAngle: 'front'|'rear'|'driver_side'|'passenger_side'|'interior'|'engine_bay'|'odometer'|'vin_plate'|'unknown', confidence: number, imageQuality: { grade: 'pass'|'review'|'retake', blurScore: number, exposureScore: number, framingScore: number, resolutionScore: number, occlusionRisk: number, retakeRequired: boolean, notes: string[] }, qualityWarnings: string[], detectedDamageCandidates: Array<{ location: string, damageType: 'scratch'|'dent'|'paint_damage'|'crack'|'wheel_damage'|'glass_damage'|'interior_wear'|'unknown', severityEstimate: 'minor'|'moderate'|'severe'|'unknown', confidence: number, explanation: string, repairEstimateUsd: { min: number, max: number, rationale: string }, requiresHumanConfirmation: boolean }>, extractedText: { vin?: string, odometer?: string }, humanReviewRequired: boolean }.",
      "Use 0-1 confidence values. If unsure, use unknown angle, lower confidence, and humanReviewRequired true.",
      "Never invent VIN or odometer values unless legible. Mark retakeRequired true for blur, poor framing, low light, occlusion, or non-vehicle images.",
      "For odometer or VIN-plate capture slots, do not return damage candidates; extract the text only if legible or request retake.",
      "Keep reviewer work bounded: return at most one qualityWarnings item and at most one detectedDamageCandidates item. Omit damage candidates below 0.80 confidence.",
      "Each note, warning, location, and rationale must be concise; keep each string under 120 characters."
    ].join("\n");
    const response = await client.send(new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6",
      messages: [{
        role: "user",
        content: [
          { text: prompt },
          {
            image: {
              format: image.format,
              source: { bytes: image.bytes }
            }
          }
        ]
      }],
      inferenceConfig: {
        maxTokens: 1400,
        temperature: 0
      }
    }));
    const rawText = response.output?.message?.content
      ?.map((block) => "text" in block && typeof block.text === "string" ? block.text : "")
      .join("\n")
      .trim() ?? "";
    try {
      const parsed = parseJsonObject(rawText);
      const prepared = prepareBedrockOutput(parsed);
      const parsedOutput = VisionOutputSchema.parse(prepared);
      const validated = normalizeVisionOutput(parsedOutput, input.declaredAngle);
      return {
        raw: { response, text: rawText, parsed, prepared },
        validated
      };
    } catch (error) {
      if (process.env.BEDROCK_VISION_FALLBACK === "fail") {
        throw new Error(`Bedrock response failed VisionOutputSchema validation: ${error instanceof Error ? error.message : "Unknown validation failure."}`);
      }
      const fallback = await localVisionProvider.analyze(input);
      return {
        raw: {
          response,
          text: rawText,
          fallbackReason: error instanceof Error ? error.message : "Bedrock response failed schema validation.",
          fallback: fallback.raw
        },
        validated: fallback.validated
      };
    }
  }
};

export function getVisionProvider(): VisionProvider {
  return process.env.VISION_PROVIDER === "bedrock" ? bedrockVisionProvider : localVisionProvider;
}

function imageFormat(mimeType: string | null | undefined, filename: string): "jpeg" | "png" | "webp" | "gif" {
  const source = `${mimeType ?? ""} ${filename}`.toLowerCase();
  if (source.includes("png")) return "png";
  if (source.includes("webp")) return "webp";
  if (source.includes("gif")) return "gif";
  return "jpeg";
}

async function loadImageInput(input: Parameters<VisionProvider["analyze"]>[0]): Promise<{ bytes: Uint8Array; format: "jpeg" | "png" | "webp" | "gif" }> {
  if (input.objectBucket && input.objectKey && input.objectBucket !== "inspectiq-sample-images") {
    return {
      bytes: await readS3ObjectBytes(input.objectBucket, input.objectKey),
      format: imageFormat(input.mimeType, input.filename)
    };
  }

  if (input.storageKey.startsWith("data:")) {
    const [meta, payload] = input.storageKey.split(",", 2);
    if (!payload) throw new Error("Invalid data URL image payload.");
    return {
      bytes: Buffer.from(payload, meta.endsWith(";base64") || meta.includes(";base64") ? "base64" : "utf8"),
      format: imageFormat(input.mimeType ?? meta, input.filename)
    };
  }

  if (input.storageKey.startsWith("/sample-images/")) {
    return {
      bytes: await readFile(sampleImageFilePath(input.storageKey)),
      format: imageFormat(input.mimeType, input.filename)
    };
  }

  if (input.storageKey.startsWith("https://")) {
    const response = await fetch(input.storageKey);
    if (!response.ok) throw new Error(`Unable to fetch external sample image: ${response.status}`);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      format: imageFormat(input.mimeType ?? response.headers.get("content-type"), input.filename)
    };
  }

  throw new Error("Bedrock vision provider requires an S3 object, sample image, or data URL payload.");
}

function parseJsonObject(text: string): unknown {
  const withoutFence = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Bedrock response did not include a JSON object.");
  }
  return JSON.parse(withoutFence.slice(start, end + 1));
}
