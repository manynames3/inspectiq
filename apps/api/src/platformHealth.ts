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
      "image_quality_retake_rate",
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
        "imageQuality",
        "imageQuality.blurScore",
        "imageQuality.exposureScore",
        "imageQuality.framingScore",
        "imageQuality.retakeRequired",
        "qualityWarnings",
        "detectedDamageCandidates",
        "repairEstimateUsd",
        "extractedText",
        "humanReviewRequired"
      ],
      confidencePolicy: "Suggestions below reviewer confidence thresholds remain held for human review; no AI result finalizes a condition report.",
      productionTarget: "S3/R2 image object storage -> queue worker -> Bedrock/Rekognition/custom model -> validated suggestion records -> audit trail.",
      imageQualityPolicy: "Image quality is scored separately from damage confidence. Retake-required photos block buyer-visible release until a reviewer resolves the quality warning."
    },
    implementationBoundary: {
      local: [
        "Deterministic vision and report providers keep walkthroughs repeatable without model credentials.",
        "Express uses a file snapshot locally; Cloudflare Pages can use KV for hosted walkthrough state.",
        "Browser uploads store small preview data URLs instead of production object-storage writes.",
        "Role headers simulate authenticated role claims for local inspection/reviewer/admin flows."
      ],
      production: [
        "Postgres repository with migrations, transaction boundaries, and retention policy.",
        "S3 presigned uploads with checksum, MIME validation, metadata, lifecycle, and KMS encryption.",
        "SQS/EventBridge image-analysis jobs with idempotency keys, DLQ, retries, and worker observability.",
        "Bedrock/Rekognition/custom model adapter storing raw output, validated output, prompt version, provider metadata, and rejected-output audit records.",
        "Cognito or enterprise OIDC with object-level authorization and least-privilege IAM."
      ],
      javaBoundary: "The Java grading service is intentionally small: keep it separate only when condition rules need independent ownership, versioning, testing, or reuse outside the Node API; collapse it into the API for a smaller early-stage team."
    }
  };
}
