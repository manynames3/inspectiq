import { estimateDamageRepairCost, VisionOutputSchema, type DamageSeverity, type DamageType, type VisionOutput } from "@inspectiq/shared";

export type VisionProvider = {
  name: string;
  promptVersion: string;
  analyze(input: { filename: string; storageKey: string }): Promise<{ raw: unknown; validated: VisionOutput }>;
};

const cleanOutput = (photoAngle: VisionOutput["photoAngle"], confidence = 0.94): VisionOutput => ({
  photoAngle,
  confidence,
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

export const mockVisionProvider: VisionProvider = {
  name: "mockVisionProvider",
  promptVersion: "photo-analysis-v2",
  async analyze(input) {
    const key = `${input.filename} ${input.storageKey}`.toLowerCase();
    let raw: VisionOutput;

    if (key.includes("rear-severe-damage")) {
      raw = {
        ...cleanOutput("rear", 0.96),
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
        ...cleanOutput("driver_side", 0.93),
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
        ...cleanOutput("interior", 0.91),
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
        ...cleanOutput("odometer", 0.98),
        extractedText: { odometer: "64231" }
      };
    } else if (key.includes("vin-plate")) {
      raw = {
        ...cleanOutput("vin_plate", 0.97),
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
        qualityWarnings: ["Image appears blurry or low-light; retake recommended before final report."],
        detectedDamageCandidates: [],
        extractedText: {},
        humanReviewRequired: true
      };
    } else {
      raw = {
        photoAngle: "unknown",
        confidence: 0.3,
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
  return process.env.VISION_PROVIDER === "bedrock" ? bedrockVisionProvider : mockVisionProvider;
}
