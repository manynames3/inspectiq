import {
  CreateDamageItemSchema,
  CreateInspectionSchema,
  GradeRequestSchema,
  PatchDamageItemSchema,
  PatchInspectionSchema,
  PatchReportSchema,
  SamplePhotoSchema,
  UpdateSuggestionSchema,
  UploadPhotoSchema
} from "@inspectiq/shared";
import { ZodError } from "zod";
import { ApiError, conflict, validation } from "../../apps/api/src/errors.js";
import { gradeCondition } from "../../apps/api/src/gradingClient.js";
import { mockVisionProvider } from "../../apps/api/src/mockVisionProvider.js";
import { mockReportProvider } from "../../apps/api/src/reportProvider.js";
import { findSampleImage, sampleBundles, sampleImages } from "../../apps/api/src/sampleImages.js";
import { seedStore } from "../../apps/api/src/seedData.js";
import { MemoryStore } from "../../apps/api/src/store.js";
import type { Actor } from "../../apps/api/src/domain.js";

const store = new MemoryStore();
let seeded = false;
const storeSnapshotKey = "inspectiq-store:v1";
const storeMapNames = [
  "users",
  "inspections",
  "photos",
  "analyses",
  "suggestions",
  "damageItems",
  "conditionGrades",
  "reportJobs",
  "reportDrafts",
  "finalReports",
  "auditEvents"
] as const;

type StoreMapName = typeof storeMapNames[number];
type IdentifiedRecord = { id: string };
type StoreSnapshot = Partial<Record<StoreMapName, IdentifiedRecord[]>>;
type JsonKvNamespace = {
  get(key: string, type: "json"): Promise<unknown | null>;
  put(key: string, value: string): Promise<void>;
};
type PagesEnv = {
  INSPECTIQ_STORE?: JsonKvNamespace;
};
type PagesContext = {
  request: Request;
  env?: PagesEnv;
};

function storeMap(name: StoreMapName): Map<string, IdentifiedRecord> {
  return store[name] as Map<string, IdentifiedRecord>;
}

function ensureSeeded(): void {
  if (seeded) return;
  seedStore(store);
  seeded = true;
}

function snapshotStore(): StoreSnapshot {
  return Object.fromEntries(
    storeMapNames.map((name) => [name, [...storeMap(name).values()]])
  ) as StoreSnapshot;
}

function restoreStore(snapshot: StoreSnapshot): void {
  store.reset();
  for (const name of storeMapNames) {
    const records = snapshot[name] ?? [];
    const map = storeMap(name);
    for (const record of records) {
      if (record && typeof record.id === "string") {
        map.set(record.id, record);
      }
    }
  }
  seeded = true;
}

async function loadStore(env?: PagesEnv): Promise<void> {
  const kv = env?.INSPECTIQ_STORE;
  if (!kv) {
    ensureSeeded();
    return;
  }

  const snapshot = await kv.get(storeSnapshotKey, "json") as StoreSnapshot | null;
  if (snapshot) {
    restoreStore(snapshot);
    return;
  }

  store.reset();
  seedStore(store);
  seeded = true;
  await saveStore(env);
}

async function saveStore(env?: PagesEnv): Promise<void> {
  await env?.INSPECTIQ_STORE?.put(storeSnapshotKey, JSON.stringify(snapshotStore()));
}

function json(data: unknown, requestId: string, status = 200): Response {
  return Response.json({ data, requestId }, { status });
}

function errorJson(error: unknown, requestId: string): Response {
  if (error instanceof ZodError) {
    return Response.json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
        details: error.flatten()
      },
      requestId
    }, { status: 400 });
  }

  if (error instanceof ApiError) {
    return Response.json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      requestId
    }, { status: error.status });
  }

  return Response.json({
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "An unexpected error occurred."
    },
    requestId
  }, { status: 500 });
}

function actorFromRequest(request: Request): Actor {
  const fallback = store.defaultActor();
  const role = request.headers.get("x-actor-role");
  return {
    id: request.headers.get("x-actor-id") ?? fallback.id,
    name: request.headers.get("x-actor-name") ?? fallback.name,
    role: role === "reviewer" || role === "admin" ? role : fallback.role
  };
}

async function readJson(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function reportBodyFromDraft(output: unknown): string {
  const draft = output as {
    summary?: string;
    notableDefects?: string[];
    missingEvidence?: string[];
    recommendedDisclosure?: string;
    reasoningSummary?: string;
  };
  return [
    `Summary: ${draft.summary ?? ""}`,
    "",
    "Notable defects:",
    ...(draft.notableDefects ?? []).map((item) => `- ${item}`),
    "",
    "Missing evidence:",
    ...((draft.missingEvidence ?? []).length ? (draft.missingEvidence ?? []).map((item) => `- ${item}`) : ["- None"]),
    "",
    `Recommended disclosure: ${draft.recommendedDisclosure ?? ""}`,
    "",
    `Review rationale: ${draft.reasoningSummary ?? ""}`
  ].join("\n");
}

async function handleApi(request: Request, requestId: string): Promise<Response> {
  ensureSeeded();
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.replace(/^\/api\/?/, "");
  const segments = path ? path.split("/") : [];
  const body = await readJson(request);
  const actor = actorFromRequest(request);

  if (method === "GET" && path === "health") {
    return json({
      ok: true,
      service: "inspectiq-pages-function",
      providers: {
        vision: "mock",
        report: "mock"
      }
    }, requestId);
  }

  if (method === "GET" && path === "platform-health") {
    return json({
      scorecard: [
        { pillar: "Operational excellence", status: "implemented", evidence: "Request IDs, structured logs, runbook, retryable report jobs, audit events." },
        { pillar: "Security", status: "documented", evidence: "Role selector for local review; production plan covers Cognito/OIDC, RBAC, presigned S3, encryption, Secrets Manager." },
        { pillar: "Reliability", status: "implemented", evidence: "Provider failures captured, invalid schemas rejected, state machine guards finalization." },
        { pillar: "Performance efficiency", status: "designed", evidence: "CRUD stays in request path; report generation modeled as async-ready job." },
        { pillar: "Cost optimization", status: "documented", evidence: "Cost model separates image storage, model calls, relational storage, and logs." },
        { pillar: "AI governance", status: "implemented", evidence: "AI suggestions require human confirmation and never directly finalize reports." }
      ],
      sampleImages,
      metricsTracked: [
        "image_analysis_success_rate",
        "failed_image_analysis_count",
        "report_generation_latency",
        "human_review_rate",
        "ai_suggestion_acceptance_rate",
        "p95_api_latency"
      ]
    }, requestId);
  }

  if (segments[0] === "inspections" && segments.length === 1 && method === "GET") {
    return json(store.listInspections().map((inspection) => ({
      ...inspection,
      conditionGrade: store.latestGrade(inspection.id),
      humanReviewFlag: inspection.status === "HUMAN_REVIEW_REQUIRED"
    })), requestId);
  }

  if (segments[0] === "inspections" && segments.length === 1 && method === "POST") {
    return json(store.createInspection(CreateInspectionSchema.parse(body), actor), requestId, 201);
  }

  if (segments[0] === "inspections" && segments[1] && segments.length === 2 && method === "GET") {
    return json(store.bundle(segments[1]), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments.length === 2 && method === "PATCH") {
    return json(store.patchInspection(segments[1], PatchInspectionSchema.parse(body), actor), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "photos" && segments[3] === "sample" && method === "POST") {
    const input = SamplePhotoSchema.parse(body);
    const keys = sampleBundles[input.sampleKey] ?? [input.sampleKey];
    const photos = keys.map((key) => {
      const sample = findSampleImage(key);
      if (!sample) throw validation(`Unknown sample image: ${key}`);
      return store.addPhoto({
        inspectionId: segments[1],
        storageKey: `/sample-images/${sample.filename}`,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        uploadedBy: actor.id,
        declaredAngle: null
      }, actor);
    });
    return json(photos, requestId, 201);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "photos" && segments[3] === "upload" && method === "POST") {
    const input = UploadPhotoSchema.parse(body);
    return json(store.addPhoto({
      inspectionId: segments[1],
      storageKey: input.storageKey ?? `/uploads/${crypto.randomUUID()}-${input.originalFilename}`,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      uploadedBy: actor.id,
      declaredAngle: input.declaredAngle ?? null
    }, actor), requestId, 201);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "photos" && method === "GET") {
    return json(store.listPhotos(segments[1]), requestId);
  }

  if (segments[0] === "photos" && segments[1] && segments[2] === "analyze" && method === "POST") {
    const photo = store.getPhoto(segments[1]);
    if (photo.analysisStatus === "completed" && !(body as { force?: boolean })?.force) {
      return json({
        analysis: store.getPhotoAnalysis(photo.id),
        suggestions: store.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
      }, requestId);
    }
    const result = await mockVisionProvider.analyze({ filename: photo.originalFilename, storageKey: photo.storageKey });
    const analysis = store.saveAnalysis(photo, {
      provider: mockVisionProvider.name,
      promptVersion: mockVisionProvider.promptVersion,
      raw: result.raw,
      validated: result.validated
    }, actor);
    return json({
      analysis,
      suggestions: store.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
    }, requestId);
  }

  if (segments[0] === "photos" && segments[1] && segments[2] === "analysis" && method === "GET") {
    return json(store.getPhotoAnalysis(segments[1]), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "vision-suggestions" && method === "GET") {
    return json(store.listSuggestions(segments[1]), requestId);
  }

  if (segments[0] === "vision-suggestions" && segments[1] && segments[2] === "accept" && method === "POST") {
    return json(store.acceptSuggestion(segments[1], actor), requestId);
  }

  if (segments[0] === "vision-suggestions" && segments[1] && segments[2] === "reject" && method === "POST") {
    return json(store.rejectSuggestion(segments[1], actor), requestId);
  }

  if (segments[0] === "vision-suggestions" && segments[1] && segments.length === 2 && method === "PATCH") {
    const input = UpdateSuggestionSchema.parse(body);
    if (!Object.prototype.hasOwnProperty.call(input, "suggestedValue")) {
      throw validation("suggestedValue is required.");
    }
    return json(store.editSuggestion(segments[1], {
      suggestedValue: input.suggestedValue,
      explanation: input.explanation
    }, actor), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "damage" && method === "POST") {
    const input = CreateDamageItemSchema.parse(body);
    return json(store.addDamage({
      inspectionId: segments[1],
      photoId: input.photoId ?? null,
      location: input.location,
      damageType: input.damageType,
      severity: input.severity,
      notes: input.notes,
      source: input.source
    }, actor), requestId, 201);
  }

  if (segments[0] === "damage" && segments[1] && method === "PATCH") {
    return json(store.patchDamage(segments[1], PatchDamageItemSchema.parse(body), actor), requestId);
  }

  if (segments[0] === "damage" && segments[1] && method === "DELETE") {
    store.deleteDamage(segments[1], actor);
    return json({ deleted: true }, requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "grade" && method === "POST") {
    GradeRequestSchema.parse(body ?? {});
    const inspection = store.getInspection(segments[1]);
    const missing = store.missingRequiredEvidence(inspection.id);
    if (missing.length > 0) {
      throw conflict("Cannot grade before required photo evidence is confirmed.", { missingEvidence: missing });
    }
    if (inspection.status !== "READY_FOR_GRADING" && inspection.status !== "GRADED") {
      throw conflict(`Inspection must be READY_FOR_GRADING before grading. Current status: ${inspection.status}.`);
    }
    const output = await gradeCondition({
      vehicle: { year: inspection.year, mileage: inspection.mileage },
      requiredPhotoCompletion: inspection.completenessPercentage / 100,
      damageItems: store.listDamage(inspection.id).map((item) => ({
        location: item.location,
        damageType: item.damageType,
        severity: item.severity
      }))
    });
    return json(store.saveGrade(inspection.id, {
      score: output.score,
      grade: output.grade,
      explanationJson: output.explanation,
      gradingVersion: output.gradingVersion
    }, actor), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "ai-report" && method === "POST") {
    const inspection = store.getInspection(segments[1]);
    const grade = store.latestGrade(inspection.id);
    if (!grade) throw conflict("Calculate the condition grade before requesting a report draft.");
    if (inspection.status !== "GRADED" && inspection.status !== "REPORT_FAILED" && inspection.status !== "HUMAN_REVIEW_REQUIRED") {
      throw conflict(`Cannot request AI report from status ${inspection.status}.`);
    }
    const job = store.createReportJob(inspection.id, request.headers.get("idempotency-key") ?? (body as { idempotencyKey?: string })?.idempotencyKey ?? null, actor);
    store.markJobRunning(job.id);
    const result = await mockReportProvider.generate({
      inspection,
      grade,
      missingEvidence: store.missingRequiredEvidence(inspection.id),
      damageItems: store.listDamage(inspection.id)
    });
    const draft = store.completeReportJob(job.id, {
      inspectionId: inspection.id,
      jobId: job.id,
      provider: mockReportProvider.name,
      promptVersion: mockReportProvider.promptVersion,
      inputSummaryJson: {
        gradeId: grade.id,
        damageItemCount: store.listDamage(inspection.id).length,
        missingEvidence: store.missingRequiredEvidence(inspection.id)
      },
      outputJson: result.validated,
      confidence: result.validated.confidence,
      humanReviewRequired: result.validated.humanReviewRequired,
      validationStatus: "valid"
    }, reportBodyFromDraft(result.validated), actor);
    return json({
      job: store.latestReportJob(inspection.id),
      draft,
      finalReport: store.latestFinalReport(inspection.id)
    }, requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "ai-report" && method === "GET") {
    store.getInspection(segments[1]);
    return json({
      job: store.latestReportJob(segments[1]),
      draft: store.latestReportDraft(segments[1]),
      finalReport: store.latestFinalReport(segments[1])
    }, requestId);
  }

  if (segments[0] === "ai-report-jobs" && segments[1] && segments[2] === "retry" && method === "POST") {
    const job = store.reportJobs.get(segments[1]);
    if (!job) throw validation("Unknown AI report job.");
    store.getInspection(job.inspectionId);
    return json({ retryWith: `/api/inspections/${job.inspectionId}/ai-report` }, requestId);
  }

  if (segments[0] === "reports" && segments[1] && method === "PATCH") {
    const input = PatchReportSchema.parse(body);
    return json(store.patchReport(segments[1], input.reportBody, actor), requestId);
  }

  if (segments[0] === "reports" && segments[1] && segments[2] === "finalize" && method === "POST") {
    return json(store.finalizeReport(segments[1], actor), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "audit-events" && method === "GET") {
    return json(store.auditForInspection(segments[1]), requestId);
  }

  return Response.json({
    error: {
      code: "NOT_FOUND",
      message: "API route was not found."
    },
    requestId
  }, { status: 404 });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const requestId = context.request.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    await loadStore(context.env);
    const response = await handleApi(context.request, requestId);
    if (context.request.method !== "GET" && context.request.method !== "HEAD" && response.ok) {
      await saveStore(context.env);
    }
    return response;
  } catch (error) {
    return errorJson(error, requestId);
  }
}
