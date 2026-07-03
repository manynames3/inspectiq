import { sampleImages } from "./sampleImages.js";
import type { MemoryStore } from "./store.js";

export type PlatformHealthProvider = {
  visionProviderName: string;
  visionPromptVersion: string;
};

export function platformHealthPayload(store: MemoryStore, provider: PlatformHealthProvider) {
  return {
    scorecard: [
      { pillar: "Operational excellence", status: "implemented", evidence: "Request IDs, structured logs, runbook, retryable report jobs, audit events." },
      { pillar: "Security", status: "implemented", evidence: "Role-aware UI controls and API RBAC for inspector, reviewer, and admin workflows; production plan covers Cognito/OIDC, presigned S3, encryption, Secrets Manager." },
      { pillar: "Reliability", status: "implemented", evidence: "Provider failures captured, invalid schemas rejected, state machine guards finalization." },
      { pillar: "Performance efficiency", status: "designed", evidence: "CRUD stays in request path; image/report analysis is shaped for async queue workers." },
      { pillar: "Cost optimization", status: "documented", evidence: "Cost model separates image storage, model calls, relational storage, and logs." },
      { pillar: "AI governance", status: "implemented", evidence: "AI output is schema-validated, prompt-versioned, and advisory until human acceptance." }
    ],
    sampleImages,
    operationalMetrics: store.operationalMetrics(),
    metricsTracked: [
      "image_analysis_success_rate",
      "missing_required_angle_rate",
      "human_review_rate",
      "grade_generation_latency",
      "report_finalization_rate",
      "suggestion_acceptance_rate"
    ],
    aiContract: {
      provider: provider.visionProviderName,
      promptVersion: provider.visionPromptVersion,
      schema: "VisionOutputSchema",
      validatedFields: [
        "photoAngle",
        "confidence",
        "qualityWarnings",
        "detectedDamageCandidates",
        "repairEstimateUsd",
        "extractedText",
        "humanReviewRequired"
      ],
      confidencePolicy: "Suggestions below reviewer confidence thresholds remain held for human review; no AI result finalizes a condition report.",
      productionTarget: "S3/R2 image object storage -> queue worker -> Bedrock/Rekognition/custom model -> validated suggestion records -> audit trail."
    }
  };
}
