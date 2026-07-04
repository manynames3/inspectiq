import { sampleImages } from "./sampleImages.js";
import type { MemoryStore } from "./store.js";

export type PlatformHealthProvider = {
  visionProviderName: string;
  visionPromptVersion: string;
};

export function platformHealthPayload(store: MemoryStore, provider: PlatformHealthProvider) {
  const env = typeof process !== "undefined" ? process.env : {};
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
      "image_analysis_queue_latency",
      "missing_required_angle_rate",
      "human_review_rate",
      "grade_generation_latency",
      "report_finalization_rate",
      "suggestion_acceptance_rate",
      "buyer_visible_ready_rate"
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
      productionTarget: "S3 image object storage -> queue worker -> Bedrock multimodal model -> validated suggestion records -> audit trail.",
      imageQualityPolicy: "Image quality is scored separately from damage confidence. Retake-required photos block buyer-visible release until a reviewer resolves the quality warning."
    },
    persistence: {
      activeMode: env.PERSISTENCE_MODE ?? "file",
      postgresReady: Boolean(env.DATABASE_URL || env.DATABASE_SECRET_ARN),
      localMode: "File snapshot is retained for repeatable local walkthroughs and tests.",
      productionMode: "Set PERSISTENCE_MODE=postgres and DATABASE_URL or DATABASE_SECRET_ARN to persist normalized inspection, photo, suggestion, report, and audit records in Postgres."
    },
    storageContract: {
      uploadIntentEndpoint: "/api/uploads/intent",
      localBehavior: "Browser previews can still post small data URLs for local inspection workflows.",
      productionBehavior: "Upload intent returns object bucket/key metadata and the production path is presigned S3 PUT with checksum and MIME validation."
    },
    asyncWorkerContract: {
      queueEvent: "image_analysis.queued",
      statusValues: ["queued", "running", "completed", "failed", "dead_letter"],
      idempotency: "Image-analysis jobs support idempotency keys per photo/provider/prompt version.",
      deadLetterPolicy: "After repeated failures, jobs move to dead_letter and block buyer-visible release until retry or retake."
    },
    implementationBoundary: {
      local: [
        "Deterministic vision and report providers keep walkthroughs repeatable without model credentials.",
        "Express uses file snapshots locally by default; PERSISTENCE_MODE=postgres switches to normalized Postgres persistence.",
        "Cloudflare Pages can host the web client while API state lives in Postgres.",
        "Browser uploads store small preview data URLs instead of production object-storage writes.",
        "Role headers simulate authenticated role claims for local inspection/reviewer/admin flows."
      ],
      production: [
        "Postgres repository with schema migrations, indexed foreign keys, transaction boundaries, and retention policy.",
        "S3 presigned uploads with checksum, MIME validation, metadata, lifecycle, and KMS encryption.",
        "SQS image-analysis jobs with idempotency keys, DLQ, retries, and worker observability.",
        "Bedrock multimodal adapter storing raw output, validated output, prompt version, provider metadata, and rejected-output audit records.",
        "Cognito or enterprise OIDC with object-level authorization and least-privilege IAM."
      ],
      javaBoundary: "The Java grading service is intentionally small: keep it separate only when condition rules need independent ownership, versioning, testing, or reuse outside the Node API; collapse it into the API for a smaller early-stage team."
    }
  };
}
