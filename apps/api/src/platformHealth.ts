import { requiredPhotoAngles, roleActionLabels, rolePermissions, type UserRole } from "@inspectiq/shared";
import { sampleImages, samplePhotoSets } from "./sampleImages.js";
import type { Actor, AuditEvent, ImageAnalysisJob, Inspection, PhotoAnalysisResult } from "./domain.js";
import type { MemoryStore } from "./store.js";

export type PlatformHealthProvider = {
  visionProviderName: string;
  visionPromptVersion: string;
  actor?: Actor;
  apiBaseUrl?: string;
  authMode?: string;
  roleSource?: string;
};

function latestBy<T>(items: T[], readDate: (item: T) => string | null | undefined): T | null {
  return items
    .filter((item) => Boolean(readDate(item)))
    .sort((a, b) => String(readDate(b)).localeCompare(String(readDate(a))))[0] ?? null;
}

function inspectionLabel(inspection: Inspection | undefined): string {
  if (!inspection) return "Unknown inspection";
  return `${inspection.year} ${inspection.make} ${inspection.model}`;
}

function latestAnalysisSummary(store: MemoryStore): Record<string, unknown> | null {
  const analysis = latestBy([...store.analyses.values()].filter((item) => item.status === "completed"), (item) => item.createdAt);
  if (!analysis) return null;
  const photo = store.photos.get(analysis.photoId);
  const inspection = photo ? store.inspections.get(photo.inspectionId) : undefined;
  return {
    inspectionId: inspection?.id ?? null,
    inspection: inspectionLabel(inspection),
    photoId: analysis.photoId,
    provider: analysis.provider,
    promptVersion: analysis.promptVersion,
    confidence: `${Math.round(analysis.confidence * 100)}%`,
    completedAt: analysis.createdAt
  };
}

function latestJobOrRecoverySummary(store: MemoryStore): Record<string, unknown> | null {
  const failedJob = latestBy(
    [...store.imageAnalysisJobs.values()].filter((job) => job.status === "failed" || job.status === "dead_letter"),
    (job) => job.updatedAt
  );
  const recoveredEvent = latestBy(
    [...store.auditEvents.values()].filter((event) => event.eventType === "image_analysis.requeued"),
    (event) => event.createdAt
  );
  if (!failedJob && !recoveredEvent) return null;

  if (failedJob && (!recoveredEvent || failedJob.updatedAt >= recoveredEvent.createdAt)) {
    const inspection = store.inspections.get(failedJob.inspectionId);
    return {
      type: "failed_job",
      inspectionId: failedJob.inspectionId,
      inspection: inspectionLabel(inspection),
      jobId: failedJob.id,
      photoId: failedJob.photoId,
      status: failedJob.status,
      attempts: failedJob.attempts,
      message: failedJob.errorMessage ?? "No provider error recorded.",
      updatedAt: failedJob.updatedAt
    };
  }

  return {
    type: "recovered_job",
    inspectionId: recoveredEvent?.inspectionId ?? null,
    inspection: inspectionLabel(recoveredEvent ? store.inspections.get(recoveredEvent.inspectionId) : undefined),
    eventType: recoveredEvent?.eventType,
    actor: recoveredEvent?.actor,
    recoveredAt: recoveredEvent?.createdAt
  };
}

function latestAuditForRole(events: AuditEvent[], eventTypes: string[]): AuditEvent | null {
  return latestBy(events.filter((event) => eventTypes.includes(event.eventType)), (event) => event.createdAt);
}

function roleProof(store: MemoryStore) {
  const events = [...store.auditEvents.values()];
  const roleSpecs: Array<{
    role: UserRole;
    title: string;
    proof: string;
    eventTypes: string[];
  }> = [
    {
      role: "inspector",
      title: "Inspector capture",
      proof: "Creates inspections, uploads required-angle evidence, and queues image analysis.",
      eventTypes: ["inspection.created", "photo.uploaded", "image_analysis.queued", "photo.analyzed"]
    },
    {
      role: "reviewer",
      title: "Reviewer decisioning",
      proof: "Accepts/rejects AI suggestions, confirms damage, grades CR readiness, drafts, and finalizes reports.",
      eventTypes: ["suggestion.accepted", "suggestion.rejected", "damage.added", "condition.grade_generated", "ai_report.generated", "report.finalized"]
    },
    {
      role: "admin",
      title: "Admin operations",
      proof: "Views platform health, recovers failed image jobs, and owns exception paths.",
      eventTypes: ["image_analysis.requeued", "image_analysis.failure_simulated", "inspection.updated"]
    }
  ];

  return roleSpecs.map((spec) => {
    const latestEvent = latestAuditForRole(events, spec.eventTypes);
    return {
      role: spec.role,
      title: spec.title,
      proof: spec.proof,
      permissions: rolePermissions[spec.role].map((action) => roleActionLabels[action]),
      latestEvent: latestEvent ? {
        eventType: latestEvent.eventType,
        actor: latestEvent.actor,
        inspectionId: latestEvent.inspectionId,
        occurredAt: latestEvent.createdAt
      } : null
    };
  });
}

function evidencePackSummary() {
  const sampleByKey = new Map(sampleImages.map((sample) => [sample.key, sample]));
  const externalSources = sampleImages.filter((sample) => Boolean(sample.sourceUrl));
  const edgeCaseKeys = ["blurry-front", "glare-front", "dark-interior", "partial-vin-plate", "dirty-odometer", "auction-lane-front", "bad-angle-side"];
  return {
    requiredAngles: requiredPhotoAngles,
    vehicleSets: samplePhotoSets.map((set) => {
      const samples = set.sampleKeys.map((key) => sampleByKey.get(key)).filter((sample): sample is NonNullable<typeof sample> => Boolean(sample));
      const angles = new Set(samples.map((sample) => sample.angle));
      return {
        key: set.key,
        label: set.label,
        vehicle: `${set.vehicle.year} ${set.vehicle.make} ${set.vehicle.model} ${set.vehicle.trim}`.trim(),
        documentedPhotoCount: samples.filter((sample) => Boolean(sample.sourceUrl)).length,
        requiredAngleCoverage: `${[...requiredPhotoAngles].filter((angle) => angles.has(angle)).length}/${requiredPhotoAngles.length}`,
        sources: [...new Set(samples.map((sample) => sample.sourceName).filter(Boolean))]
      };
    }),
    sourceDocumentedImages: externalSources.length,
    edgeCases: edgeCaseKeys
      .map((key) => sampleByKey.get(key))
      .filter((sample): sample is NonNullable<typeof sample> => Boolean(sample))
      .map((sample) => ({
        key: sample.key,
        label: sample.label,
        angle: sample.angle,
        sourceName: sample.sourceName ?? "InspectIQ fixture"
      }))
  };
}

function hotPathRepositoryProof() {
  return [
    { domain: "Inspection repository", table: "inspections", operation: "Targeted row upsert/delete for changed inspection records." },
    { domain: "Photo repository", table: "vehicle_photos + image_analysis_jobs + photo_analysis_results", operation: "Photo, job, and analysis rows persist independently for capture and analysis hot paths." },
    { domain: "Suggestion repository", table: "vision_suggestions", operation: "Reviewer accept/reject/edit decisions persist as row-level changes." },
    { domain: "Audit repository", table: "audit_events", operation: "Append-only audit events are inserted without rewriting unrelated workflow rows." },
    { domain: "Report repository", table: "ai_report_jobs + ai_report_drafts + final_reports", operation: "Report job, draft, and final report rows persist as separate state transitions." }
  ];
}

export function platformHealthPayload(store: MemoryStore, provider: PlatformHealthProvider) {
  const env = typeof process !== "undefined" ? process.env : {};
  const operationalMetrics = store.operationalMetrics();
  const imageJobs = [...store.imageAnalysisJobs.values()];
  const failedImageJobs = imageJobs.filter((job) => job.status === "failed" || job.status === "dead_letter");
  const queuedImageJobs = imageJobs.filter((job) => job.status === "queued" || job.status === "running");
  const metricValue = (metric: string) => operationalMetrics.find((item) => item.metric === metric)?.value ?? "No data";
  const hasQueue = Boolean(env.IMAGE_ANALYSIS_QUEUE_URL || env.IMAGE_ANALYSIS_QUEUE_ARN || env.IMAGE_ANALYSIS_MODE === "queue");
  const hasS3 = Boolean(env.IMAGE_BUCKET || env.IMAGE_UPLOAD_MODE === "presigned");
  const authDescription = provider.authMode ?? (env.AUTH_MODE === "jwt" ? "Cognito/OIDC JWT" : "local role header");
  const opsSimulationEnabled = env.ENABLE_OPS_SIMULATION
    ? env.ENABLE_OPS_SIMULATION.toLowerCase() === "true"
    : env.NODE_ENV !== "production";
  return {
    runtimeProof: {
      environment: env.APP_ENV ?? env.NODE_ENV ?? "local",
      apiBaseUrl: provider.apiBaseUrl ?? env.PUBLIC_API_BASE_URL ?? "not reported",
      authenticatedRole: provider.actor?.role ?? "unknown",
      actorName: provider.actor?.name ?? "Unknown actor",
      authMode: authDescription,
      roleSource: provider.roleSource ?? (env.AUTH_MODE === "jwt" ? "verified JWT claims" : "local role header"),
      persistenceMode: env.PERSISTENCE_MODE ?? "file",
      postgres: Boolean(env.DATABASE_URL || env.DATABASE_SECRET_ARN) ? "configured" : "not configured",
      imageStorage: hasS3 ? "S3 presigned upload path configured" : "local browser preview mode",
      imageBucket: env.IMAGE_BUCKET ?? "not configured",
      imageAnalysisMode: hasQueue ? "SQS/Lambda worker path configured" : "inline local analysis path",
      visionProvider: provider.visionProviderName,
      promptVersion: provider.visionPromptVersion,
      queueHealth: {
        failedImageJobs: failedImageJobs.length,
        deadLetterImageJobs: imageJobs.filter((job) => job.status === "dead_letter").length,
        activeImageJobs: queuedImageJobs.length
      },
      latestSuccessfulImageAnalysis: latestAnalysisSummary(store),
      latestFailedOrRecoveredJob: latestJobOrRecoverySummary(store),
      opsSimulation: {
        enabled: opsSimulationEnabled,
        endpoint: "/api/platform-health/simulate-failed-image-job",
        localOnly: "Enabled outside production unless ENABLE_OPS_SIMULATION=false."
      }
    },
    roleProof: roleProof(store),
    evidencePack: evidencePackSummary(),
    scorecard: [
      { pillar: "Operational excellence", status: "implemented", evidence: "Request IDs, structured logs, runbook, retryable report jobs, audit events." },
      { pillar: "Security", status: "implemented", evidence: "Role-aware UI/API RBAC, JWT/JWKS verification path, object-level inspection authorization tests, presigned S3, encryption, and Secrets Manager." },
      { pillar: "Reliability", status: "implemented", evidence: "Provider failures captured, invalid schemas rejected, state machine guards finalization." },
      { pillar: "Performance efficiency", status: "designed", evidence: "CRUD stays in request path; image/report analysis is shaped for async queue workers." },
      { pillar: "Cost optimization", status: "documented", evidence: "Cost model separates image storage, model calls, relational storage, and logs." },
      { pillar: "AI governance", status: "implemented", evidence: "AI output is schema-validated, prompt-versioned, and advisory until human acceptance." }
    ],
    sampleImages: sampleImages.filter((sample) => Boolean(sample.sourceUrl)),
    samplePhotoSets,
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
        evidence: "evals/vision-eval-set.json covers required angles, damage, clean negatives, OCR, glare, blur, low-light interiors, partial VIN, dirty odometer, and bad-angle retakes."
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
      liveStatus: {
        failedImageJobs: failedImageJobs.length,
        deadLetterImageJobs: imageJobs.filter((job) => job.status === "dead_letter").length,
        activeImageJobs: queuedImageJobs.length,
        recoveryEndpoint: "/api/platform-health/recover-failed-jobs"
      },
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
      localMode: "File snapshot mode is retained for controlled test runs.",
      productionMode: "Set PERSISTENCE_MODE=postgres and DATABASE_URL or DATABASE_SECRET_ARN to persist normalized inspection, photo, suggestion, report, and audit records through row-level Postgres upsert/delete transactions.",
      hotPathRepositories: hotPathRepositoryProof()
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
        "Role headers simulate authenticated role claims for local inspection/reviewer/admin flows.",
        "Local reference records use VIN-specific listing photos for Hyundai, Toyota, Honda, Ford, Nissan, and Subaru where public listings expose the required angle."
      ],
      production: [
        "DB-first repositories for high-concurrency mutation paths, schema migrations, indexed foreign keys, transaction boundaries, and retention policy.",
        "S3 presigned uploads with checksum, MIME validation, metadata, lifecycle, and KMS encryption.",
        "SQS image-analysis jobs with idempotency keys, DLQ, retries, and worker observability.",
        "Bedrock multimodal adapter storing raw output, validated output, prompt version, provider metadata, and rejected-output audit records.",
        "Cognito or enterprise OIDC with object-level authorization and least-privilege IAM."
      ],
      gradingBoundary: "The Python grading service is intentionally small: keep it separate only when condition rules need independent ownership, versioning, testing, or reuse outside the Node API; collapse it into the API for a smaller early-stage team."
    }
  };
}
