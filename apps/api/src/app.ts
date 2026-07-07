import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
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
  UploadPhotoSchema,
  type ApiEnvelope
} from "@inspectiq/shared";
import { errorHandler, validation, conflict, forbidden } from "./errors.js";
import { gradeCondition } from "./gradingClient.js";
import { getReportProvider } from "./reportProvider.js";
import { getVisionProvider } from "./visionProvider.js";
import { createPresignedDownload, createPresignedUpload, s3ObjectUrl } from "./awsStorage.js";
import { sendImageAnalysisMessage } from "./awsQueue.js";
import { runImageAnalysisJob } from "./imageAnalysisRunner.js";
import { platformHealthPayload } from "./platformHealth.js";
import { authenticateRequest, isEvaluationRequest } from "./auth.js";
import { canAccessInspection, requireAction, requireInspectionAccess } from "./rbac.js";
import { findSampleImage, sampleBundles, sampleImageDirectory } from "./sampleImages.js";
import { seedStore } from "./seedData.js";
import { MemoryStore, store as defaultStore } from "./store.js";
import type { Actor, DamageItem, FinalReport, Inspection, VehiclePhoto, VisionSuggestion } from "./domain.js";

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
type AppOptions = {
  beforeRequest?: () => void | Promise<void>;
  afterMutation?: () => void | Promise<void>;
};
type AuthenticatedRequest = Request & { actor?: Actor };

function asyncRoute(handler: AsyncRoute): AsyncRoute {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function sendData<T>(res: Response, data: T, status = 200): void {
  const body: ApiEnvelope<T> = {
    data,
    requestId: res.locals.requestId
  };
  res.status(status).json(body);
}

async function persistMutation(options: AppOptions): Promise<void> {
  await options.afterMutation?.();
}

function actorFromRequest(req: Request, store: MemoryStore): Actor {
  const authenticatedActor = (req as AuthenticatedRequest).actor;
  if (authenticatedActor) {
    store.ensureUser(authenticatedActor);
    return authenticatedActor;
  }

  const fallback = store.defaultActor();
  const role = req.header("x-actor-role");
  const actor: Actor = {
    id: String(req.header("x-actor-id") ?? fallback.id),
    name: String(req.header("x-actor-name") ?? fallback.name),
    role: role === "inspector" || role === "reviewer" || role === "admin" ? role : fallback.role
  };
  store.ensureUser(actor);
  return actor;
}

function inspectionForRequest(store: MemoryStore, inspectionId: string, actor: Actor, action?: string): Inspection {
  const inspection = store.getInspection(inspectionId);
  requireInspectionAccess(actor, inspection, action);
  return inspection;
}

function photoForRequest(store: MemoryStore, photoId: string, actor: Actor, action?: string): VehiclePhoto {
  const photo = store.getPhoto(photoId);
  const inspection = store.getInspection(photo.inspectionId);
  requireInspectionAccess(actor, inspection, action ?? "access this photo");
  return photo;
}

function suggestionForRequest(store: MemoryStore, suggestionId: string, actor: Actor, action?: string): VisionSuggestion {
  const suggestion = store.getSuggestion(suggestionId);
  const inspection = store.getInspection(suggestion.inspectionId);
  requireInspectionAccess(actor, inspection, action ?? "access this AI suggestion");
  return suggestion;
}

function damageForRequest(store: MemoryStore, damageId: string, actor: Actor, action?: string): DamageItem {
  const damage = store.getDamage(damageId);
  const inspection = store.getInspection(damage.inspectionId);
  requireInspectionAccess(actor, inspection, action ?? "access this damage item");
  return damage;
}

function reportForRequest(store: MemoryStore, reportId: string, actor: Actor, action?: string): FinalReport {
  const report = store.getFinalReport(reportId);
  const inspection = store.getInspection(report.inspectionId);
  requireInspectionAccess(actor, inspection, action ?? "access this report");
  return report;
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

export function createApp(appStore = defaultStore, options: AppOptions = {}): express.Express {
  if (appStore.inspections.size === 0) seedStore(appStore);

  const app = express();
  app.use((req, res, next) => {
    res.locals.requestId = req.header("x-request-id") ?? crypto.randomUUID();
    next();
  });
  app.use(pinoHttp({
    quietReqLogger: true,
    customProps: (_req, res) => ({ requestId: res.locals.requestId })
  }));
  const allowedOrigins = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin: allowedOrigins && allowedOrigins.length > 1 ? allowedOrigins : process.env.WEB_ORIGIN ?? true
  }));
  app.use(express.json({ limit: "4mb" }));
  app.use("/api", (req, res, next) => {
    if (!options.beforeRequest) {
      next();
      return;
    }
    Promise.resolve(options.beforeRequest())
      .then(() => next())
      .catch(next);
  });
  app.use("/api", asyncRoute(async (req, _res, next) => {
    if (req.path === "/health") {
      next();
      return;
    }
    const actor = await authenticateRequest(req);
    if (actor) {
      appStore.ensureUser(actor);
      (req as AuthenticatedRequest).actor = actor;
    }
    if (isEvaluationRequest(req) && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      throw forbidden("Evaluation workspace is read-only. Sign in with Cognito to make workflow changes.", {
        mode: "evaluation-readonly"
      });
    }
    next();
  }));
  app.use("/sample-images", express.static(sampleImageDirectory()));

  app.get("/api/health", (_req, res) => {
    sendData(res, {
      ok: true,
      service: "inspectiq-api",
      providers: {
        vision: process.env.VISION_PROVIDER ?? "local",
        report: process.env.REPORT_PROVIDER ?? "local"
      },
      uptimeSeconds: Math.round(process.uptime())
    });
  });

  app.get("/api/inspections", (req, res) => {
    const actor = actorFromRequest(req, appStore);
    sendData(res, appStore.listInspections().filter((inspection) => canAccessInspection(actor, inspection)).map((inspection) => ({
      ...inspection,
      conditionGrade: appStore.latestGrade(inspection.id),
      humanReviewFlag: inspection.status === "HUMAN_REVIEW_REQUIRED",
      buyerVisibleReady: appStore.buyerVisibleReady(inspection.id),
      readinessIssueCount: appStore.readinessIssues(inspection.id).length
    })));
  });

  app.post("/api/inspections", asyncRoute((req, res) => {
    const input = CreateInspectionSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "inspection:create");
    const inspection = appStore.createInspection(input, actor);
    return persistMutation(options).then(() => sendData(res, inspection, 201));
  }));

  app.get("/api/inspections/:id", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    inspectionForRequest(appStore, req.params.id, actor);
    sendData(res, appStore.bundle(req.params.id));
  }));

  app.patch("/api/inspections/:id", asyncRoute((req, res) => {
    const input = PatchInspectionSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "inspection:update");
    inspectionForRequest(appStore, req.params.id, actor, "update this inspection");
    const inspection = appStore.patchInspection(req.params.id, input, actor);
    return persistMutation(options).then(() => sendData(res, inspection));
  }));

  app.post("/api/inspections/:id/photos/upload", asyncRoute(async (req, res) => {
    const input = UploadPhotoSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "photo:capture");
    inspectionForRequest(appStore, req.params.id, actor, "upload photos to this inspection");
    const objectKey = input.objectKey ?? objectKeyForUpload(req.params.id, input.originalFilename);
    const photo = appStore.addPhoto({
      inspectionId: req.params.id,
      storageKey: input.storageKey ?? `/uploads/${objectKey}`,
      objectBucket: input.objectBucket ?? process.env.IMAGE_BUCKET ?? "inspectiq-local-uploads",
      objectKey,
      thumbnailStorageKey: input.thumbnailStorageKey ?? null,
      byteSize: input.byteSize ?? null,
      checksumSha256: input.checksumSha256 ?? null,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      uploadedBy: actor.id,
      declaredAngle: input.declaredAngle ?? null
    }, actor);
    await persistMutation(options);
    sendData(res, photo, 201);
  }));

  app.post("/api/uploads/intent", asyncRoute(async (req, res) => {
    const input = UploadIntentSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "photo:capture");
    inspectionForRequest(appStore, input.inspectionId, actor, "create upload intent for this inspection");
    appStore.assertMutableInspection(input.inspectionId, "create upload intent");
    const objectKey = objectKeyForUpload(input.inspectionId, input.originalFilename);
    const objectBucket = process.env.IMAGE_BUCKET ?? "inspectiq-local-uploads";
    if (process.env.IMAGE_UPLOAD_MODE === "presigned") {
      if (!process.env.IMAGE_BUCKET) throw validation("IMAGE_BUCKET is required for presigned uploads.");
      const presigned = await createPresignedUpload({
        bucket: objectBucket,
        key: objectKey,
        mimeType: input.mimeType,
        checksumSha256: input.checksumSha256 ?? null
      });
      sendData(res, {
        objectBucket,
        objectKey,
        uploadUrl: presigned.uploadUrl,
        requiredHeaders: presigned.requiredHeaders,
        expiresInSeconds: presigned.expiresInSeconds
      }, 201);
      return;
    }
    sendData(res, {
      objectBucket,
      objectKey,
      uploadUrl: null,
      requiredHeaders: {
        "content-type": input.mimeType,
        ...(input.checksumSha256 ? { "x-amz-checksum-sha256": input.checksumSha256 } : {})
      },
      expiresInSeconds: 900
    }, 201);
  }));

  app.post("/api/inspections/:id/photos/sample", asyncRoute(async (req, res) => {
    const input = SamplePhotoSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "photo:capture");
    inspectionForRequest(appStore, req.params.id, actor, "attach sample photos to this inspection");
    const keys = sampleBundles[input.sampleKey] ?? [input.sampleKey];
    const photos = keys.map((key) => {
      const sample = findSampleImage(key);
      if (!sample) throw validation(`Unknown sample image: ${key}`);
      return appStore.addPhoto({
        inspectionId: req.params.id,
        storageKey: `/sample-images/${sample.filename}`,
        objectBucket: "inspectiq-sample-images",
        objectKey: `sample-images/${sample.filename}`,
        thumbnailStorageKey: `/sample-images/${sample.filename}`,
        byteSize: null,
        checksumSha256: null,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        uploadedBy: actor.id,
        declaredAngle: sample.angle
      }, actor);
    });
    await persistMutation(options);
    sendData(res, photos, 201);
  }));

  app.get("/api/inspections/:id/photos", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    inspectionForRequest(appStore, req.params.id, actor, "view photos for this inspection");
    sendData(res, appStore.listPhotos(req.params.id));
  }));

  app.post("/api/inspections/:id/photos/analyze", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "photo:analyze");
    inspectionForRequest(appStore, req.params.id, actor, "analyze photos for this inspection");

    const force = req.body?.force === true || req.query.force === "true";
    const photos = appStore.listPhotos(req.params.id).filter((photo) => force || photo.analysisStatus !== "completed");
    const idempotencyKeyPrefix = req.header("idempotency-key") ?? req.body?.idempotencyKeyPrefix ?? null;
    const jobs = photos.map((photo) => appStore.enqueueImageAnalysis(
      photo,
      actor,
      force
        ? `force:${idempotencyKeyPrefix ?? req.params.id}:${photo.id}:${crypto.randomUUID()}`
        : idempotencyKeyPrefix ? `${idempotencyKeyPrefix}:${photo.id}` : null
    ));

    if (process.env.IMAGE_ANALYSIS_MODE === "queue") {
      await persistMutation(options);
      const queuedJobs = jobs.filter((job) => job.status === "queued");
      if (queuedJobs.length > 0) {
        await sendImageAnalysisMessage({
          jobIds: queuedJobs.map((job) => job.id),
          inspectionId: req.params.id,
          photoId: queuedJobs[0].photoId,
          actor
        });
      }
      sendData(res, {
        jobs,
        queued: queuedJobs.length,
        suggestions: appStore.listSuggestions(req.params.id)
      }, 202);
      return;
    }

    const results = [];
    for (const job of jobs) {
      results.push(await runImageAnalysisJob(appStore, job.id, actor));
    }
    await persistMutation(options);
    sendData(res, {
      jobs: jobs.map((job) => appStore.imageAnalysisJobs.get(job.id) ?? job),
      results,
      suggestions: appStore.listSuggestions(req.params.id)
    });
  }));

  app.post("/api/photos/:photoId/analyze", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "photo:analyze");
    const photo = photoForRequest(appStore, req.params.photoId, actor, "analyze this photo");
    const force = req.body?.force === true || req.query.force === "true";
    if (photo.analysisStatus === "completed" && !force) {
      sendData(res, {
        analysis: appStore.getPhotoAnalysis(photo.id),
        job: appStore.imageAnalysisJobsForInspection(photo.inspectionId).find((job) => job.photoId === photo.id) ?? null,
        suggestions: appStore.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
      });
      return;
    }
    const requestedIdempotencyKey = req.header("idempotency-key") ?? req.body?.idempotencyKey ?? null;
    const job = appStore.enqueueImageAnalysis(
      photo,
      actor,
      force ? `force:${photo.id}:${crypto.randomUUID()}` : requestedIdempotencyKey
    );
    if (process.env.IMAGE_ANALYSIS_MODE === "queue") {
      await persistMutation(options);
      await sendImageAnalysisMessage({
        jobId: job.id,
        inspectionId: photo.inspectionId,
        photoId: photo.id,
        actor
      });
      sendData(res, {
        job,
        analysis: null,
        suggestions: appStore.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
      }, 202);
      return;
    }
    const result = await runImageAnalysisJob(appStore, job.id, actor);
    await persistMutation(options);
    sendData(res, result, result.analysis.status === "failed" ? 502 : 200);
  }));

  app.get("/api/photos/:photoId/analysis", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    photoForRequest(appStore, req.params.photoId, actor, "view analysis for this photo");
    sendData(res, appStore.getPhotoAnalysis(req.params.photoId));
  }));

  app.get("/api/photos/:photoId/image", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    const photo = photoForRequest(appStore, req.params.photoId, actor, "view this photo");
    if (!photo.objectBucket || !photo.objectKey || photo.objectBucket === "inspectiq-sample-images") {
      if (req.query.intent === "preview") {
        sendData(res, {
          imageUrl: photo.storageKey,
          expiresInSeconds: null,
          source: "sample-or-inline"
        });
        return;
      }
      res.redirect(photo.storageKey);
      return;
    }
    if (process.env.IMAGE_UPLOAD_MODE === "presigned") {
      const imageUrl = await createPresignedDownload({ bucket: photo.objectBucket, key: photo.objectKey, expiresInSeconds: 900 });
      if (req.query.intent === "preview") {
        sendData(res, {
          imageUrl,
          expiresInSeconds: 900,
          source: "object-storage"
        });
        return;
      }
      res.redirect(imageUrl);
      return;
    }
    const imageUrl = photo.storageKey || s3ObjectUrl(photo.objectBucket, photo.objectKey);
    if (req.query.intent === "preview") {
      sendData(res, {
        imageUrl,
        expiresInSeconds: null,
        source: "object-storage"
      });
      return;
    }
    res.redirect(imageUrl);
  }));

  app.get("/api/inspections/:id/vision-suggestions", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    inspectionForRequest(appStore, req.params.id, actor, "view AI suggestions for this inspection");
    sendData(res, appStore.listSuggestions(req.params.id));
  }));

  app.post("/api/vision-suggestions/:id/accept", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:review");
    suggestionForRequest(appStore, req.params.id, actor, "accept this AI suggestion");
    const suggestion = appStore.acceptSuggestion(req.params.id, actor);
    await persistMutation(options);
    sendData(res, suggestion);
  }));

  app.post("/api/vision-suggestions/:id/reject", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:review");
    suggestionForRequest(appStore, req.params.id, actor, "reject this AI suggestion");
    const suggestion = appStore.rejectSuggestion(req.params.id, actor);
    await persistMutation(options);
    sendData(res, suggestion);
  }));

  app.patch("/api/vision-suggestions/:id", asyncRoute(async (req, res) => {
    const input = UpdateSuggestionSchema.parse(req.body);
    if (!Object.prototype.hasOwnProperty.call(input, "suggestedValue")) {
      throw validation("suggestedValue is required.");
    }
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:review");
    suggestionForRequest(appStore, req.params.id, actor, "edit this AI suggestion");
    const suggestion = appStore.editSuggestion(req.params.id, {
      suggestedValue: input.suggestedValue,
      explanation: input.explanation
    }, actor);
    await persistMutation(options);
    sendData(res, suggestion);
  }));

  app.post("/api/inspections/:id/damage", asyncRoute(async (req, res) => {
    const input = CreateDamageItemSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "damage:create");
    inspectionForRequest(appStore, req.params.id, actor, "add damage to this inspection");
    const damage = appStore.addDamage({
      inspectionId: req.params.id,
      photoId: input.photoId ?? null,
      location: input.location,
      damageType: input.damageType,
      severity: input.severity,
      notes: input.notes,
      source: input.source
    }, actor);
    await persistMutation(options);
    sendData(res, damage, 201);
  }));

  app.patch("/api/damage/:id", asyncRoute(async (req, res) => {
    const input = PatchDamageItemSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "damage:update");
    damageForRequest(appStore, req.params.id, actor, "update this damage item");
    const damage = appStore.patchDamage(req.params.id, input, actor);
    await persistMutation(options);
    sendData(res, damage);
  }));

  app.delete("/api/damage/:id", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "damage:delete");
    damageForRequest(appStore, req.params.id, actor, "delete this damage item");
    appStore.deleteDamage(req.params.id, actor);
    await persistMutation(options);
    sendData(res, { deleted: true });
  }));

  app.post("/api/inspections/:id/grade", asyncRoute(async (req, res) => {
    GradeRequestSchema.parse(req.body ?? {});
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "grade:calculate");
    const inspection = inspectionForRequest(appStore, req.params.id, actor, "grade this inspection");
    const missing = appStore.missingRequiredEvidence(inspection.id);
    if (missing.length > 0) {
      throw conflict("Cannot grade before required photo evidence is confirmed.", { missingEvidence: missing });
    }
    if (inspection.status !== "READY_FOR_GRADING" && inspection.status !== "GRADED") {
      throw conflict(`Inspection must be READY_FOR_GRADING before grading. Current status: ${inspection.status}.`);
    }
    const output = await gradeCondition({
      vehicle: { year: inspection.year, mileage: inspection.mileage },
      requiredPhotoCompletion: inspection.completenessPercentage / 100,
      damageItems: appStore.listDamage(inspection.id).map((item) => ({
        location: item.location,
        damageType: item.damageType,
        severity: item.severity
      }))
    });
    const saved = appStore.saveGrade(inspection.id, {
      score: output.score,
      grade: output.grade,
      explanationJson: output.explanation,
      gradingVersion: output.gradingVersion
    }, actor);
    await persistMutation(options);
    sendData(res, saved);
  }));

  app.post("/api/inspections/:id/ai-report", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "report:draft");
    const inspection = inspectionForRequest(appStore, req.params.id, actor, "draft a report for this inspection");
    const grade = appStore.latestGrade(inspection.id);
    if (!grade) throw conflict("Calculate the condition grade before requesting a report draft.");
    if (inspection.status !== "GRADED" && inspection.status !== "REPORT_FAILED" && inspection.status !== "HUMAN_REVIEW_REQUIRED") {
      throw conflict(`Cannot request AI report from status ${inspection.status}.`);
    }
    const job = appStore.createReportJob(inspection.id, req.header("idempotency-key") ?? req.body?.idempotencyKey ?? null, actor);
    appStore.markJobRunning(job.id);
    const provider = getReportProvider();
    try {
      const result = await provider.generate({
        inspection,
        grade,
        missingEvidence: appStore.missingRequiredEvidence(inspection.id),
        damageItems: appStore.listDamage(inspection.id)
      });
      const draft = appStore.completeReportJob(job.id, {
        inspectionId: inspection.id,
        jobId: job.id,
        provider: provider.name,
        promptVersion: provider.promptVersion,
        inputSummaryJson: {
          gradeId: grade.id,
          damageItemCount: appStore.listDamage(inspection.id).length,
          missingEvidence: appStore.missingRequiredEvidence(inspection.id)
        },
        outputJson: result.validated,
        confidence: result.validated.confidence,
        humanReviewRequired: result.validated.humanReviewRequired,
        validationStatus: "valid"
      }, reportBodyFromDraft(result.validated), actor);
      await persistMutation(options);
      sendData(res, {
        job: appStore.latestReportJob(inspection.id),
        draft,
        finalReport: appStore.latestFinalReport(inspection.id)
      });
    } catch (error) {
      const failed = appStore.failReportJob(job.id, error instanceof Error ? error.message : "Unknown report provider failure.", actor);
      await persistMutation(options);
      sendData(res, failed, 502);
    }
  }));

  app.get("/api/inspections/:id/ai-report", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    inspectionForRequest(appStore, req.params.id, actor, "view report workflow for this inspection");
    sendData(res, {
      job: appStore.latestReportJob(req.params.id),
      draft: appStore.latestReportDraft(req.params.id),
      finalReport: appStore.latestFinalReport(req.params.id)
    });
  }));

  app.post("/api/ai-report-jobs/:jobId/retry", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "report:retry");
    const job = appStore.reportJobs.get(req.params.jobId);
    if (!job) throw validation("Unknown AI report job.");
    inspectionForRequest(appStore, job.inspectionId, actor, "retry this report job");
    sendData(res, { retryWith: `/api/inspections/${job.inspectionId}/ai-report` });
  }));

  app.get("/api/reports/:id/export", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    reportForRequest(appStore, req.params.id, actor, "export this report");
    const exported = appStore.buyerReportExport(req.params.id);
    res
      .status(200)
      .type("text/plain")
      .setHeader("content-disposition", `attachment; filename="${exported.filename}"`)
      .send(exported.body);
  }));

  app.patch("/api/reports/:id", asyncRoute(async (req, res) => {
    const input = PatchReportSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "report:edit");
    reportForRequest(appStore, req.params.id, actor, "edit this report");
    const report = appStore.patchReport(req.params.id, input.reportBody, actor);
    await persistMutation(options);
    sendData(res, report);
  }));

  app.post("/api/reports/:id/finalize", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "report:finalize");
    reportForRequest(appStore, req.params.id, actor, "finalize this report");
    const report = appStore.finalizeReport(req.params.id, actor);
    await persistMutation(options);
    sendData(res, report);
  }));

  app.get("/api/inspections/:id/audit-events", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    inspectionForRequest(appStore, req.params.id, actor, "view audit events for this inspection");
    sendData(res, appStore.auditForInspection(req.params.id));
  }));

  app.get("/api/inspections/:id/readiness", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    inspectionForRequest(appStore, req.params.id, actor, "view readiness for this inspection");
    sendData(res, {
      issues: appStore.readinessIssues(req.params.id),
      buyerVisibleReady: appStore.buyerVisibleReady(req.params.id)
    });
  }));

  app.get("/api/reports/:id", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    sendData(res, reportForRequest(appStore, req.params.id, actor, "view this report"));
  }));

  app.get("/api/platform-health", (_req, res) => {
    const provider = getVisionProvider();
    sendData(res, platformHealthPayload(appStore, {
      visionProviderName: provider.name,
      visionPromptVersion: provider.promptVersion
    }));
  });

  app.use(errorHandler);
  return app;
}
