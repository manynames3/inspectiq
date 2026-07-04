import {
  CreateDamageItemSchema,
  CreateInspectionSchema,
  GradeRequestSchema,
  PatchDamageItemSchema,
  PatchInspectionSchema,
  PatchReportSchema,
  SamplePhotoSchema,
  UpdateSuggestionSchema,
  UploadIntentSchema,
  UploadPhotoSchema
} from "@inspectiq/shared";
import { ZodError } from "zod";
import { ApiError, conflict, validation } from "../../apps/api/src/errors.js";
import { gradeCondition } from "../../apps/api/src/gradingClient.js";
import { localVisionProvider } from "../../apps/api/src/visionProvider.js";
import { platformHealthPayload } from "../../apps/api/src/platformHealth.js";
import { localReportProvider } from "../../apps/api/src/reportProvider.js";
import { requireAction } from "../../apps/api/src/rbac.js";
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
  "imageAnalysisJobs",
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
    role: role === "inspector" || role === "reviewer" || role === "admin" ? role : fallback.role
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

function objectKeyForUpload(inspectionId: string, filename: string): string {
  const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return `inspections/${inspectionId}/photos/${crypto.randomUUID()}-${cleanName}`;
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
        vision: "local",
        report: "local"
      }
    }, requestId);
  }

  if (method === "GET" && path === "platform-health") {
    return json(platformHealthPayload(store, {
      visionProviderName: localVisionProvider.name,
      visionPromptVersion: localVisionProvider.promptVersion
    }), requestId);
  }

  if (segments[0] === "inspections" && segments.length === 1 && method === "GET") {
    return json(store.listInspections().map((inspection) => ({
      ...inspection,
      conditionGrade: store.latestGrade(inspection.id),
      humanReviewFlag: inspection.status === "HUMAN_REVIEW_REQUIRED",
      buyerVisibleReady: store.buyerVisibleReady(inspection.id),
      readinessIssueCount: store.readinessIssues(inspection.id).length
    })), requestId);
  }

  if (segments[0] === "inspections" && segments.length === 1 && method === "POST") {
    requireAction(actor, "inspection:create");
    return json(store.createInspection(CreateInspectionSchema.parse(body), actor), requestId, 201);
  }

  if (segments[0] === "inspections" && segments[1] && segments.length === 2 && method === "GET") {
    return json(store.bundle(segments[1]), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments.length === 2 && method === "PATCH") {
    requireAction(actor, "inspection:update");
    return json(store.patchInspection(segments[1], PatchInspectionSchema.parse(body), actor), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "photos" && segments[3] === "sample" && method === "POST") {
    requireAction(actor, "photo:capture");
    const input = SamplePhotoSchema.parse(body);
    const keys = sampleBundles[input.sampleKey] ?? [input.sampleKey];
    const photos = keys.map((key) => {
      const sample = findSampleImage(key);
      if (!sample) throw validation(`Unknown sample image: ${key}`);
      return store.addPhoto({
        inspectionId: segments[1],
        storageKey: `/sample-images/${sample.filename}`,
        objectBucket: "inspectiq-sample-images",
        objectKey: `sample-images/${sample.filename}`,
        thumbnailStorageKey: `/sample-images/${sample.filename}`,
        byteSize: null,
        checksumSha256: null,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        uploadedBy: actor.id,
        declaredAngle: null
      }, actor);
    });
    return json(photos, requestId, 201);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "photos" && segments[3] === "upload" && method === "POST") {
    requireAction(actor, "photo:capture");
    const input = UploadPhotoSchema.parse(body);
    const objectKey = input.objectKey ?? objectKeyForUpload(segments[1], input.originalFilename);
    return json(store.addPhoto({
      inspectionId: segments[1],
      storageKey: input.storageKey ?? `/uploads/${objectKey}`,
      objectBucket: input.objectBucket ?? "inspectiq-pages-uploads",
      objectKey,
      thumbnailStorageKey: input.thumbnailStorageKey ?? null,
      byteSize: input.byteSize ?? null,
      checksumSha256: input.checksumSha256 ?? null,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      uploadedBy: actor.id,
      declaredAngle: input.declaredAngle ?? null
    }, actor), requestId, 201);
  }

  if (segments[0] === "uploads" && segments[1] === "intent" && method === "POST") {
    requireAction(actor, "photo:capture");
    const input = UploadIntentSchema.parse(body);
    store.assertMutableInspection(input.inspectionId, "create upload intent");
    const objectKey = objectKeyForUpload(input.inspectionId, input.originalFilename);
    return json({
      objectBucket: "inspectiq-pages-uploads",
      objectKey,
      uploadUrl: null,
      requiredHeaders: {
        "content-type": input.mimeType,
        ...(input.checksumSha256 ? { "x-amz-checksum-sha256": input.checksumSha256 } : {})
      },
      expiresInSeconds: 900
    }, requestId, 201);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "photos" && method === "GET") {
    return json(store.listPhotos(segments[1]), requestId);
  }

  if (segments[0] === "photos" && segments[1] && segments[2] === "analyze" && method === "POST") {
    requireAction(actor, "photo:analyze");
    const photo = store.getPhoto(segments[1]);
    if (photo.analysisStatus === "completed" && !(body as { force?: boolean })?.force) {
      return json({
        analysis: store.getPhotoAnalysis(photo.id),
        job: store.imageAnalysisJobsForInspection(photo.inspectionId).find((job) => job.photoId === photo.id) ?? null,
        suggestions: store.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
      }, requestId);
    }
    const job = store.enqueueImageAnalysis(photo, actor, request.headers.get("idempotency-key") ?? (body as { idempotencyKey?: string })?.idempotencyKey ?? null);
    store.startImageAnalysisJob(job.id, actor);
    const result = await localVisionProvider.analyze({ filename: photo.originalFilename, storageKey: photo.storageKey });
    const analysis = store.saveAnalysis(photo, {
      provider: localVisionProvider.name,
      promptVersion: localVisionProvider.promptVersion,
      raw: result.raw,
      validated: result.validated,
      jobId: job.id
    }, actor);
    return json({
      job: store.imageAnalysisJobs.get(job.id),
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
    requireAction(actor, "suggestion:review");
    return json(store.acceptSuggestion(segments[1], actor), requestId);
  }

  if (segments[0] === "vision-suggestions" && segments[1] && segments[2] === "reject" && method === "POST") {
    requireAction(actor, "suggestion:review");
    return json(store.rejectSuggestion(segments[1], actor), requestId);
  }

  if (segments[0] === "vision-suggestions" && segments[1] && segments.length === 2 && method === "PATCH") {
    requireAction(actor, "suggestion:review");
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
    requireAction(actor, "damage:create");
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
    requireAction(actor, "damage:update");
    return json(store.patchDamage(segments[1], PatchDamageItemSchema.parse(body), actor), requestId);
  }

  if (segments[0] === "damage" && segments[1] && method === "DELETE") {
    requireAction(actor, "damage:delete");
    store.deleteDamage(segments[1], actor);
    return json({ deleted: true }, requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "grade" && method === "POST") {
    requireAction(actor, "grade:calculate");
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
    requireAction(actor, "report:draft");
    const inspection = store.getInspection(segments[1]);
    const grade = store.latestGrade(inspection.id);
    if (!grade) throw conflict("Calculate the condition grade before requesting a report draft.");
    if (inspection.status !== "GRADED" && inspection.status !== "REPORT_FAILED" && inspection.status !== "HUMAN_REVIEW_REQUIRED") {
      throw conflict(`Cannot request AI report from status ${inspection.status}.`);
    }
    const job = store.createReportJob(inspection.id, request.headers.get("idempotency-key") ?? (body as { idempotencyKey?: string })?.idempotencyKey ?? null, actor);
    store.markJobRunning(job.id);
    const result = await localReportProvider.generate({
      inspection,
      grade,
      missingEvidence: store.missingRequiredEvidence(inspection.id),
      damageItems: store.listDamage(inspection.id)
    });
    const draft = store.completeReportJob(job.id, {
      inspectionId: inspection.id,
      jobId: job.id,
      provider: localReportProvider.name,
      promptVersion: localReportProvider.promptVersion,
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
    requireAction(actor, "report:retry");
    const job = store.reportJobs.get(segments[1]);
    if (!job) throw validation("Unknown AI report job.");
    store.getInspection(job.inspectionId);
    return json({ retryWith: `/api/inspections/${job.inspectionId}/ai-report` }, requestId);
  }

  if (segments[0] === "reports" && segments[1] && segments[2] === "export" && method === "GET") {
    const exported = store.buyerReportExport(segments[1]);
    return new Response(exported.body, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${exported.filename}"`
      }
    });
  }

  if (segments[0] === "reports" && segments[1] && method === "PATCH") {
    requireAction(actor, "report:edit");
    const input = PatchReportSchema.parse(body);
    return json(store.patchReport(segments[1], input.reportBody, actor), requestId);
  }

  if (segments[0] === "reports" && segments[1] && segments.length === 2 && method === "GET") {
    return json(store.getFinalReport(segments[1]), requestId);
  }

  if (segments[0] === "reports" && segments[1] && segments[2] === "finalize" && method === "POST") {
    requireAction(actor, "report:finalize");
    return json(store.finalizeReport(segments[1], actor), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "audit-events" && method === "GET") {
    return json(store.auditForInspection(segments[1]), requestId);
  }

  if (segments[0] === "inspections" && segments[1] && segments[2] === "readiness" && method === "GET") {
    return json({
      issues: store.readinessIssues(segments[1]),
      buyerVisibleReady: store.buyerVisibleReady(segments[1])
    }, requestId);
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
