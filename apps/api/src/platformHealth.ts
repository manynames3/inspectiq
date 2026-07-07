import { sampleImages } from "./sampleImages.js";
import type { MemoryStore } from "./store.js";

export type PlatformHealthProvider = {
  visionProviderName: string;
  visionPromptVersion: string;
};

export function platformHealthPayload(store: MemoryStore, provider: PlatformHealthProvider) {
  const env = typeof process !== "undefined" ? process.env : {};
  const operationalMetrics = store.operationalMetrics();
  const metricValue = (metric: string) => operationalMetrics.find((item) => item.metric === metric)?.value ?? "No data";
  return {
    scorecard: [
      { pillar: "Operational excellence", status: "implemented", evidence: "Request IDs, structured logs, runbook, retryable report jobs, audit events." },
      { pillar: "Security", status: "implemented", evidence: "Role-aware UI/API RBAC, JWT/JWKS verification path, object-level inspection authorization tests, presigned S3, encryption, and Secrets Manager." },
      { pillar: "Reliability", status: "implemented", evidence: "Provider failures captured, invalid schemas rejected, state machine guards finalization." },
      { pillar: "Performance efficiency", status: "designed", evidence: "CRUD stays in request path; image/report analysis is shaped for async queue workers." },
      { pillar: "Cost optimization", status: "documented", evidence: "Cost model separates image storage, model calls, relational storage, and logs." },
      { pillar: "AI governance", status: "implemented", evidence: "AI output is schema-validated, prompt-versioned, and advisory until human acceptance." }
    ],
    sampleImages,
    operationalMetrics,
    serviceLevelObjectives: [
      {
        name: "Image analysis success",
        target: ">= 99% completed without provider/schema failure",
        current: metricValue("image_analysis_success_rate"),
        risk: "Failed analysis jobs delay CR readiness and buyer-visible photos.",
        evidence: "Computed from persisted photo_analysis_results rows."
      },
      {
        name: "Retake precision",
        target: ">= 80% on the evaluation set before model/prompt promotion",
        current: "Measured by npm run eval:vision",
        risk: "Poor retake precision wastes inspector time and slows offsite/mobile capture.",
        evidence: "evals/vision-eval-set.json covers blurry, clean, damage, OCR, and required-angle cases."
      },
      {
        name: "Human review queue freshness",
        target: "Pending AI suggestions reviewed during the same inspection workflow",
        current: metricValue("human_review_rate"),
        risk: "Unreviewed suggestions block trusted disclosure and final report release.",
        evidence: "Computed from pending/edited suggestion rows."
      },
      {
        name: "Final report release",
        target: ">= 95% of generated reports finalized after reviewer approval",
        current: metricValue("report_finalization_rate"),
        risk: "Reports that stop before finalization never become buyer-visible CR artifacts.",
        evidence: "Computed from final_reports rows."
      }
    ],
    alerts: [
      {
        name: "inspectiq-api-errors",
        signal: "Lambda Errors >= 1 in 1 minute",
        response: "Check request logs by requestId, identify failed endpoint, replay only idempotent operations."
      },
      {
        name: "inspectiq-worker-errors",
        signal: "Image worker Lambda Errors >= 1 in 1 minute",
        response: "Inspect SQS message payload, provider error, schema rejection, and photo object metadata."
      },
      {
        name: "inspectiq-image-dlq-visible",
        signal: "DLQ visible messages >= 1",
        response: "Run failed-job recovery: inspect dead-letter payload, fix root cause, retry job or require retake."
      },
      {
        name: "inspectiq-image-queue-age",
        signal: "Oldest image-analysis message age >= 5 minutes",
        response: "Scale worker concurrency or pause new captures until backlog returns below threshold."
      },
      {
        name: "inspectiq-api-p95-latency",
        signal: "API Gateway p95 latency >= 2 seconds",
        response: "Check Neon connection latency, Lambda cold starts, and oversized payload paths."
      }
    ],
    failedJobRecovery: {
      detection: "Image jobs move through queued -> running -> completed/failed/dead_letter and emit audit events.",
      operatorWorkflow: [
        "Open Platform Health and confirm the queue/DLQ alert.",
        "Open the affected inspection audit trail and identify the photo/job/provider failure.",
        "If the image is usable, retry the job; if quality is poor or object metadata is bad, request retake.",
        "Verify the readiness blockers clear before report generation/finalization."
      ],
      safeguards: [
        "Idempotency keys prevent duplicate image-analysis work per photo.",
        "Schema validation stores failed provider output as a failure instead of materializing unsafe suggestions.",
        "Buyer-visible readiness remains blocked while failed/dead-letter jobs or retake warnings exist."
      ]
    },
    operationsDashboard: {
      name: "inspectiq-ops",
      region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1",
      widgets: [
        "API Gateway p95 latency and 5xx rate",
        "API and image-worker Lambda errors, duration, and throttles",
        "SQS visible backlog, oldest-message age, and DLQ depth",
        "Image analysis success/retake/human-review metrics from the application payload"
      ]
    },
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
    productionReadinessProof: [
      {
        area: "Image AI and ML",
        status: "partially proven",
        current: "Bedrock multimodal analysis is wired through SQS/Lambda and stores schema-validated advisory suggestions.",
        productionGate: "Launch requires a larger labeled inspection-photo corpus, calibrated angle/OCR/damage metrics, and a dedicated damage-detection model for buyer-dispute-grade claims."
      },
      {
        area: "Image intake",
        status: env.IMAGE_UPLOAD_MODE === "presigned" ? "implemented" : "local fallback",
        current: "JPEG, PNG, and WebP upload schemas enforce MIME and size limits; presigned mode requires private object metadata, byte size, and SHA-256 checksum.",
        productionGate: "Add image normalization, EXIF stripping, thumbnail generation, malware/content checks, lifecycle rules, and KMS key policy review."
      },
      {
        area: "Auth and authorization",
        status: env.AUTH_MODE === "jwt" ? "implemented" : "local fallback",
        current: "JWT/JWKS validation, role claims, RBAC, object-level inspection access, and read-only evaluation mode are enforced in the API.",
        productionGate: "Use enterprise OIDC groups/custom claims, remove role switching from production users, add session timeout policy, and audit sensitive reads."
      },
      {
        area: "Persistence",
        status: env.PERSISTENCE_MODE === "postgres" ? "partially proven" : "local fallback",
        current: "Neon Postgres mode persists normalized tables; tests still use in-memory/file paths for deterministic speed.",
        productionGate: "Move the highest-concurrency mutation paths to DB-first repositories with targeted transactions, migrations, backups, retention, and restore drills."
      },
      {
        area: "Operations",
        status: "partially proven",
        current: "Platform Health exposes SLOs, CloudWatch alert names, queue/DLQ recovery steps, and workflow blockers.",
        productionGate: "Run a staged failure-recovery drill, wire alert notifications, add trace correlation, and document rollback for frontend, Lambda, Terraform, and DB migrations."
      }
    ],
    persistence: {
      activeMode: env.PERSISTENCE_MODE ?? "file",
      postgresReady: Boolean(env.DATABASE_URL || env.DATABASE_SECRET_ARN),
      localMode: "File snapshot is retained for repeatable local walkthroughs and tests.",
      productionMode: "Set PERSISTENCE_MODE=postgres and DATABASE_URL or DATABASE_SECRET_ARN to persist normalized inspection, photo, suggestion, report, and audit records through row-level Postgres upsert/delete transactions."
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
        "Express uses file snapshots locally by default; PERSISTENCE_MODE=postgres switches to normalized row-level Postgres persistence.",
        "Cloudflare Pages can host the web client while API state lives in Postgres.",
        "Browser uploads store small preview data URLs instead of production object-storage writes.",
        "Role headers simulate authenticated role claims for local inspection/reviewer/admin flows."
      ],
      production: [
        "DB-first repositories for high-concurrency mutation paths, schema migrations, indexed foreign keys, transaction boundaries, and retention policy.",
        "S3 presigned uploads with checksum, MIME validation, metadata, lifecycle, and KMS encryption.",
        "SQS image-analysis jobs with idempotency keys, DLQ, retries, and worker observability.",
        "Bedrock multimodal adapter storing raw output, validated output, prompt version, provider metadata, and rejected-output audit records.",
        "Cognito or enterprise OIDC with object-level authorization and least-privilege IAM."
      ],
      javaBoundary: "The Java grading service is intentionally small: keep it separate only when condition rules need independent ownership, versioning, testing, or reuse outside the Node API; collapse it into the API for a smaller early-stage team."
    }
  };
}
