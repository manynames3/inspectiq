import { estimateDamageRepairCost, VisionOutputSchema, type DamageSeverity, type DamageType, type VisionOutput } from "@inspectiq/shared";

export type VisionProvider = {
  name: string;
  promptVersion: string;
  analyze(input: { filename: string; storageKey: string }): Promise<{ raw: unknown; validated: VisionOutput }>;
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

export const localVisionProvider: VisionProvider = {
  name: "localVisionProvider",
  promptVersion: "photo-analysis-v2",
  async analyze(input) {
    const key = `${input.filename} ${input.storageKey}`.toLowerCase();
    let raw: VisionOutput;

    if (key.includes("rear-severe-damage")) {
      raw = {
        ...cleanOutput("rear", 0.96, imageQuality({
          grade: "review",
          framingScore: 0.89,
          notes: ["Rear angle is usable, but confirmed damage requires reviewer close inspection."]
        })),
        detectedDamageCandidates: [damageCandidate({
          location: "rear bumper",
          damageType: "dent",
          severityEstimate: "severe",
          confidence: 0.9,
          explanation: "Inspection photo indicates a rear bumper deformation."
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
    } else if (key.includes("interior-wear")) {
      raw = {
        ...cleanOutput("interior", 0.91, imageQuality({
          grade: "review",
          exposureScore: 0.86,
          occlusionRisk: 0.12,
          notes: ["Interior lighting is acceptable, but seat-bolster wear requires human confirmation."]
        })),
        detectedDamageCandidates: [damageCandidate({
          location: "driver seat bolster",
          damageType: "interior_wear",
          severityEstimate: "moderate",
          confidence: 0.8,
          explanation: "Inspection photo indicates moderate wear on the driver seat bolster."
        })],
        humanReviewRequired: true
      };
    } else if (key.includes("odometer")) {
      raw = {
        ...cleanOutput("odometer", 0.98, imageQuality({
          blurScore: 0.98,
          exposureScore: 0.96,
          framingScore: 0.97,
          notes: ["Odometer digits are centered and readable."]
        })),
        extractedText: { odometer: "64231" }
      };
    } else if (key.includes("vin-plate")) {
      raw = {
        ...cleanOutput("vin_plate", 0.97, imageQuality({
          blurScore: 0.96,
          framingScore: 0.96,
          notes: ["VIN plate is framed tightly enough for OCR review."]
        })),
        extractedText: { vin: "4T1G11AK8MU123456" }
      };
    } else if (key.includes("passenger-side")) {
      raw = cleanOutput("passenger_side", 0.94);
    } else if (key.includes("engine-bay")) {
      raw = cleanOutput("engine_bay", 0.92);
    } else if (key.includes("front-clean")) {
      raw = cleanOutput("front", 0.95);
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
      validated: VisionOutputSchema.parse(raw)
    };
  }
};

export const bedrockVisionProvider: VisionProvider = {
  name: "bedrockVisionProvider",
  promptVersion: "photo-analysis-v2",
  async analyze() {
    throw new Error("Bedrock vision provider is configured but not implemented for local credentials.");
  }
};

export function getVisionProvider(): VisionProvider {
  return process.env.VISION_PROVIDER === "bedrock" ? bedrockVisionProvider : localVisionProvider;
}
