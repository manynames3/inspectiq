import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import {
  AdministrativeAuthorizationSchema,
  AssignInspectionSchema,
  ConsignorDecisionSchema,
  CreateConsignorAccountSchema,
  CreateDamageItemSchema,
  CreateReconAuthorizationPolicySchema,
  CreateReconRecommendationSchema,
  CreateVehicleIntakeSchema,
  BulkRetakeRequestSchema,
  BulkSuggestionAssignmentSchema,
  CreateInspectionSchema,
  ApproveConditionGradeSchema,
  GradeRequestSchema,
  PatchDamageItemSchema,
  PatchInspectionSchema,
  PatchReportSchema,
  ReportApprovalSchema,
  SamplePhotoSchema,
  UpdateSuggestionSchema,
  SuggestionAssignmentSchema,
  SuggestionDecisionSchema,
  SubmitReconEstimateSchema,
  TransitionInspectionWorkflowSchema,
  UploadIntentSchema,
  UploadPhotoSchema,
  UserRoleSchema,
  VehicleLocationUpdateSchema,
  WorkOrderUpdateSchema,
  QualityControlDecisionSchema,
  requiredPhotoAngles,
  rolePermissions,
  type ApiEnvelope
} from "@inspectiq/shared";
import { errorHandler, validation, conflict, forbidden, unauthorized } from "./errors.js";
import { gradeCondition } from "./gradingClient.js";
import { getReportProvider } from "./reportProvider.js";
import { getVisionProvider } from "./visionProvider.js";
import { createPresignedDownload, createPresignedUpload, s3ObjectUrl } from "./awsStorage.js";
import { sendImageAnalysisMessage } from "./awsQueue.js";
import { runImageAnalysisJob } from "./imageAnalysisRunner.js";
import { domainEventDlqHealth, flushPendingDomainEvents, replayDomainEventDlq } from "./awsEvents.js";
import { getMonthlyBedrockUsage, getOperationalProjectionHealth, listRecentOperationalEvents, reserveBedrockUsage } from "./operationsStore.js";
import { platformHealthPayload } from "./platformHealth.js";
import { authenticateRequest, authMode } from "./auth.js";
import { canAccessInspection, isEvaluationActor, requireAction, requireInspectionAccess } from "./rbac.js";
import { findSampleImage, findSamplePhotoSet, sampleBundles, sampleImageDirectory, sampleSetForInspection } from "./sampleImages.js";
import { identityDataUrl, identitySourceLicense, identitySourceName, seedStore } from "./seedData.js";
import { MemoryStore, store as defaultStore } from "./store.js";
import { runWithRequestContext } from "./requestContext.js";
import { decodeVehicleReference } from "./vpicClient.js";
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

function referenceEvidenceEnabled(): boolean {
  const configured = process.env.ENABLE_REFERENCE_EVIDENCE;
  if (configured) return configured.toLowerCase() === "true";
  return process.env.NODE_ENV !== "production";
}

function opsSimulationEnabled(): boolean {
  const configured = process.env.ENABLE_OPS_SIMULATION;
  if (configured) return configured.toLowerCase() === "true";
  return process.env.NODE_ENV !== "production";
}

function evaluationModeEnabled(): boolean {
  const configured = process.env.ENABLE_EVALUATION_MODE;
  if (configured) return configured.toLowerCase() === "true";
  return process.env.NODE_ENV !== "production";
}

function evaluationActorFromRequest(req: Request): Actor {
  const role = req.header("x-actor-role");
  const parsedRole = UserRoleSchema.safeParse(role);
  const evaluationRole = parsedRole.success ? parsedRole.data : "reviewer";
  const names: Record<Actor["role"], string> = {
    inspector: "John Smith",
    reviewer: "Evaluation Reviewer",
    recon_coordinator: "Evaluation Recon Coordinator",
    consignor_approver: "Evaluation Consignor Approver",
    technician: "Evaluation Technician",
    admin: "Evaluation Admin"
  };
  return {
    id: `evaluation-${evaluationRole}`,
    name: names[evaluationRole],
    role: evaluationRole
  };
}

function prepareEvaluationRequest(req: Request, store: MemoryStore): void {
  const isEvaluationPath = req.url.startsWith("/api/evaluation");
  const isEvaluationHeader = req.header("x-evaluation-mode")?.toLowerCase() === "true";
  const isLegacyEvaluationHeader = req.header("x-inspectiq-evaluation-mode")?.toLowerCase() === "readonly";
  if (!isEvaluationPath && !isEvaluationHeader && !isLegacyEvaluationHeader) return;
  if (!evaluationModeEnabled()) {
    throw unauthorized("Evaluation workspace is not enabled for this environment.");
  }
  const actor = evaluationActorFromRequest(req);
  store.ensureUser(actor);
  (req as AuthenticatedRequest).actor = actor;
  req.headers["x-evaluation-mode"] = "true";
  if (isEvaluationPath) {
    req.url = req.url.replace(/^\/api\/evaluation(?=\/|$)/, "/api");
  }
}

function actorFromRequest(req: Request, store: MemoryStore): Actor {
  const authenticatedActor = (req as AuthenticatedRequest).actor;
  if (authenticatedActor) {
    store.ensureUser(authenticatedActor);
    return authenticatedActor;
  }

  const fallback = store.defaultActor();
  const role = req.header("x-actor-role");
  const parsedRole = UserRoleSchema.safeParse(role);
  const actor: Actor = {
    id: String(req.header("x-actor-id") ?? fallback.id),
    name: String(req.header("x-actor-name") ?? fallback.name),
    role: parsedRole.success ? parsedRole.data : fallback.role
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

function requireReconAccess(store: MemoryStore, inspectionId: string, actor: Actor, action: string): void {
  if (store.recon.userCanAccessConsignor(actor, inspectionId)) return;
  if (actor.role === "inspector" && canAccessInspection(actor, store.getInspection(inspectionId))) return;
  throw forbidden(`You cannot ${action} for a vehicle outside your assigned account or work queue.`, {
    actorId: actor.id,
    actorRole: actor.role,
    inspectionId
  });
}

function reportBodyFromDraft(output: unknown): string {
  const draft = output as {
    summary?: string;
    notableDefects?: string[];
    missingEvidence?: string[];
    recommendedDisclosure?: string;
    reasoningSummary?: string;
    conditionReportSections?: Array<{
      title: string;
      status: string;
      observations: string[];
    }>;
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
    "Condition report sections:",
    ...(draft.conditionReportSections ?? []).flatMap((section) => [
      `${section.title} [${section.status.replaceAll("_", " ")}]`,
      ...section.observations.map((observation) => `- ${observation}`)
    ]),
    "",
    `Recommended disclosure: ${draft.recommendedDisclosure ?? ""}`,
    "",
    `Review rationale: ${draft.reasoningSummary ?? ""}`
  ].join("\n");
}

async function draftInspectionReport(store: MemoryStore, inspection: Inspection, actor: Actor, idempotencyKey: string | null) {
  const grade = store.latestGrade(inspection.id);
  if (!grade) throw conflict("Calculate the condition grade before requesting a report draft.");
  if (grade.approvedGrade == null) throw conflict("A reviewer must approve the InspectIQ Reference Grade before requesting a report draft.");
  if (inspection.status !== "GRADED" && inspection.status !== "REPORT_FAILED" && inspection.status !== "HUMAN_REVIEW_REQUIRED") {
    throw conflict(`Cannot request AI report from status ${inspection.status}.`);
  }
  const provider = getReportProvider();
  if (provider.name.toLowerCase().includes("bedrock")) {
    await reserveBedrockUsage("reportDrafts", idempotencyKey ?? `report:${inspection.id}:${crypto.randomUUID()}`);
  }
  const job = store.createReportJob(inspection.id, idempotencyKey, actor);
  store.markJobRunning(job.id);
  try {
    const damageItems = store.listDamage(inspection.id);
    const missingEvidence = store.missingRequiredEvidence(inspection.id);
    const result = await provider.generate({
      inspection,
      grade,
      missingEvidence,
      damageItems
    });
    const draft = store.completeReportJob(job.id, {
      inspectionId: inspection.id,
      jobId: job.id,
      provider: provider.name,
      promptVersion: provider.promptVersion,
      inputSummaryJson: {
        gradeId: grade.id,
        damageItemCount: damageItems.length,
        missingEvidence
      },
      outputJson: result.validated,
      confidence: result.validated.confidence,
      humanReviewRequired: result.validated.humanReviewRequired,
      validationStatus: "valid"
    }, reportBodyFromDraft(result.validated), actor);
    return {
      job,
      draft,
      finalReport: store.latestFinalReport(inspection.id)
    };
  } catch (error) {
    return store.failReportJob(job.id, error instanceof Error ? error.message : "Unknown report provider failure.", actor);
  }
}

function objectKeyForUpload(inspectionId: string, filename: string, operationId?: string | null): string {
  const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return `inspections/${inspectionId}/photos/${operationId ?? crypto.randomUUID()}-${cleanName}`;
}

function assertUploadObjectScope(inspectionId: string, input: {
  objectBucket?: string;
  objectKey?: string;
  storageKey?: string;
  byteSize?: number;
  checksumSha256?: string;
}): void {
  const configuredBucket = process.env.IMAGE_BUCKET;
  const expectedPrefix = `inspections/${inspectionId}/photos/`;
  if (input.objectKey && !input.objectKey.startsWith(expectedPrefix)) {
    throw validation("Uploaded image object key must stay under this inspection's photo prefix.", {
      expectedPrefix
    });
  }
  if (configuredBucket && input.objectBucket && input.objectBucket !== configuredBucket) {
    throw validation("Uploaded image object bucket does not match the configured image bucket.");
  }
  if (process.env.IMAGE_UPLOAD_MODE !== "presigned") return;
  if (!input.objectBucket || !input.objectKey) {
    throw validation("Presigned upload metadata must include object bucket and object key.");
  }
  if (!input.byteSize || !input.checksumSha256) {
    throw validation("Presigned upload metadata must include byte size and SHA-256 checksum.");
  }
  if (input.storageKey?.startsWith("data:")) {
    throw validation("Presigned upload metadata cannot use browser data URLs.");
  }
}

function addMissingIdentityEvidence(store: MemoryStore, inspection: Inspection, actor: Actor): VehiclePhoto[] {
  const existingAngles = new Set(store.listPhotos(inspection.id).map((photo) => photo.declaredAngle));
  const additions: VehiclePhoto[] = [];
  if (!existingAngles.has("vin_plate")) {
    additions.push(store.addPhoto({
      inspectionId: inspection.id,
      storageKey: identityDataUrl("VIN PLATE", inspection.vin),
      objectBucket: null,
      objectKey: null,
      thumbnailStorageKey: null,
      byteSize: null,
      checksumSha256: null,
      originalFilename: `vin-plate-${inspection.vin}.svg`,
      mimeType: "image/svg+xml",
      sourceName: identitySourceName,
      sourceUrl: null,
      sourceLicense: identitySourceLicense,
      uploadedBy: actor.id,
      declaredAngle: "vin_plate"
    }, actor));
  }
  if (!existingAngles.has("odometer")) {
    additions.push(store.addPhoto({
      inspectionId: inspection.id,
      storageKey: identityDataUrl("ODOMETER", inspection.mileage.toLocaleString()),
      objectBucket: null,
      objectKey: null,
      thumbnailStorageKey: null,
      byteSize: null,
      checksumSha256: null,
      originalFilename: `odometer-${inspection.mileage}.svg`,
      mimeType: "image/svg+xml",
      sourceName: identitySourceName,
      sourceUrl: null,
      sourceLicense: identitySourceLicense,
      uploadedBy: actor.id,
      declaredAngle: "odometer"
    }, actor));
  }
  return additions;
}

export function createApp(appStore = defaultStore, options: AppOptions = {}): express.Express {
  if (appStore.inspections.size === 0) seedStore(appStore);

  const app = express();
  const autoLogHttpRequests = process.env.NODE_ENV !== "test" && process.env.VITEST !== "true";
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") ?? crypto.randomUUID();
    res.locals.requestId = requestId;
    runWithRequestContext(requestId, next);
  });
  app.use(pinoHttp({
    autoLogging: autoLogHttpRequests,
    quietReqLogger: true,
    customProps: (_req, res) => ({ requestId: res.locals.requestId })
  }));
  const allowedOrigins = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin: allowedOrigins && allowedOrigins.length > 1 ? allowedOrigins : process.env.WEB_ORIGIN ?? true
  }));
  app.use(express.json({ limit: "4mb" }));
  app.use((req, _res, next) => {
    try {
      prepareEvaluationRequest(req, appStore);
      next();
    } catch (error) {
      next(error);
    }
  });
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
    if ((req as AuthenticatedRequest).actor) {
      next();
      return;
    }
    const actor = await authenticateRequest(req);
    if (actor) {
      appStore.ensureUser(actor);
      (req as AuthenticatedRequest).actor = actor;
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

  app.get("/api/auth/session", (req, res) => {
    const actor = actorFromRequest(req, appStore);
    sendData(res, {
      actor,
      authMode: authMode() === "jwt" ? "oidc-jwt" : "local-header-session",
      permissions: rolePermissions[actor.role],
      objectScope: actor.role === "inspector"
        ? "Assigned inspections only"
        : actor.role === "reviewer"
          ? "Review queue and assigned inspection records"
          : "Administrative exception access",
      sessionPolicy: {
        production: "Bearer JWT with issuer, audience, expiry, signature, Cognito group or role-claim mapping, and least-privileged Inspector fallback unless strict role claims are required.",
        local: "Role-scoped local session for RBAC and object-level authorization testing."
      }
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

  app.get("/api/mobile/bootstrap", (req, res) => {
    const actor = actorFromRequest(req, appStore);
    const cursorValue = typeof req.query.cursor === "string"
      ? req.query.cursor
      : typeof req.query.since === "string"
        ? req.query.since
        : "";
    const since = Date.parse(cursorValue);
    const accessible = appStore.listInspections()
      .filter((inspection) => canAccessInspection(actor, inspection))
      .filter((inspection) => !Number.isFinite(since) || Date.parse(inspection.updatedAt) > since);
    const cursor = appStore.listInspections()
      .map((inspection) => inspection.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString();
    sendData(res, {
      actor,
      permissions: rolePermissions[actor.role],
      requiredPhotoAngles,
      cursor,
      inspections: accessible.map((inspection) => appStore.bundle(inspection.id))
    });
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
    assertUploadObjectScope(req.params.id, input);
    const objectKey = input.objectKey ?? objectKeyForUpload(req.params.id, input.originalFilename, input.operationId);
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
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      sourceLicense: input.sourceLicense ?? null,
      uploadedBy: actor.id,
      declaredAngle: input.declaredAngle ?? null,
      operationId: input.operationId ?? null,
      capturedAt: input.capturedAt ?? null,
      deviceId: input.deviceId ?? null,
      captureSource: input.captureSource
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
    const objectKey = objectKeyForUpload(input.inspectionId, input.originalFilename, input.operationId);
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
        expiresInSeconds: presigned.expiresInSeconds,
        operationId: input.operationId ?? null
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
      expiresInSeconds: 900,
      operationId: input.operationId ?? null
    }, 201);
  }));

  app.post("/api/inspections/:id/photos/sample", asyncRoute(async (req, res) => {
    const input = SamplePhotoSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "photo:capture");
    const inspection = inspectionForRequest(appStore, req.params.id, actor, "load reference evidence for this inspection");
    if (!referenceEvidenceEnabled()) {
      throw validation("Reference evidence loading is disabled. Upload captured photos for this inspection.");
    }
    const requestedSet = input.sampleKey === "vehicle-required-set"
      ? sampleSetForInspection(inspection)
      : findSamplePhotoSet(input.sampleKey);
    if (input.sampleKey === "vehicle-required-set" && !requestedSet) {
      throw validation(`No model-matched sample evidence set exists for ${inspection.year} ${inspection.make} ${inspection.model} ${inspection.trim}. Upload actual inspection photos for this vehicle.`);
    }
    const keys = requestedSet?.sampleKeys ?? sampleBundles[input.sampleKey] ?? [input.sampleKey];
    const photos = keys.map((key) => {
      const sample = findSampleImage(key);
      if (!sample) throw validation(`Unknown reference image: ${key}`);
      if (sample.evaluationOnly) {
        throw validation("Offline evaluation images cannot be attached to an inspection.");
      }
      const storageKey = sample.storageKey ?? `/sample-images/${sample.filename}`;
      return appStore.addPhoto({
        inspectionId: req.params.id,
        storageKey,
        objectBucket: "inspectiq-sample-images",
        objectKey: `sample-images/${sample.key}`,
        thumbnailStorageKey: storageKey,
        byteSize: null,
        checksumSha256: null,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        sourceName: sample.sourceName ?? null,
        sourceUrl: sample.sourceUrl ?? null,
        sourceLicense: sample.sourceLicense ?? null,
        uploadedBy: actor.id,
        declaredAngle: sample.angle
      }, actor);
    });
    if (requestedSet) {
      photos.push(...addMissingIdentityEvidence(appStore, inspection, actor));
    }
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
    const imageUrl = photo.storageKey.startsWith("http") || photo.storageKey.startsWith("data:")
      ? s3ObjectUrl(photo.objectBucket, photo.objectKey)
      : photo.storageKey || s3ObjectUrl(photo.objectBucket, photo.objectKey);
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
    inspectionForRequest(appStore, req.params.id, actor, "view review findings for this inspection");
    sendData(res, appStore.listSuggestions(req.params.id));
  }));

  app.post("/api/vision-suggestions/:id/accept", asyncRoute(async (req, res) => {
    const input = SuggestionDecisionSchema.parse(req.body ?? {});
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:review");
    suggestionForRequest(appStore, req.params.id, actor, "accept this review finding");
    const suggestion = appStore.acceptSuggestion(req.params.id, actor, input.expectedVersion);
    await persistMutation(options);
    sendData(res, suggestion);
  }));

  app.post("/api/vision-suggestions/:id/reject", asyncRoute(async (req, res) => {
    const input = SuggestionDecisionSchema.parse(req.body ?? {});
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:review");
    suggestionForRequest(appStore, req.params.id, actor, "reject this review finding");
    const suggestion = appStore.rejectSuggestion(req.params.id, actor, input.expectedVersion);
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
    suggestionForRequest(appStore, req.params.id, actor, "edit this review finding");
    const suggestion = appStore.editSuggestion(req.params.id, {
      suggestedValue: input.suggestedValue,
      explanation: input.explanation,
      expectedVersion: input.expectedVersion
    }, actor);
    await persistMutation(options);
    sendData(res, suggestion);
  }));

  app.patch("/api/vision-suggestions/:id/assignment", asyncRoute(async (req, res) => {
    const input = SuggestionAssignmentSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:assign");
    suggestionForRequest(appStore, req.params.id, actor, "assign this review finding");
    const suggestion = appStore.assignSuggestion(req.params.id, input, actor);
    await persistMutation(options);
    sendData(res, suggestion);
  }));

  app.post("/api/vision-suggestions/bulk-assignment", asyncRoute(async (req, res) => {
    const input = BulkSuggestionAssignmentSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:assign");
    const suggestions = input.suggestionIds.map((suggestionId) => {
      suggestionForRequest(appStore, suggestionId, actor, "assign this review finding");
      return appStore.assignSuggestion(suggestionId, input, actor);
    });
    await persistMutation(options);
    sendData(res, suggestions);
  }));

  app.post("/api/vision-suggestions/bulk-retake", asyncRoute(async (req, res) => {
    const input = BulkRetakeRequestSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "suggestion:assign");
    const suggestions = input.suggestionIds.map((suggestionId) => {
      const suggestion = suggestionForRequest(appStore, suggestionId, actor, "request a retake for this finding");
      if (suggestion.suggestionType !== "quality_warning" && suggestion.suggestionType !== "photo_angle") {
        throw validation("Bulk retake is limited to image quality and angle findings. Damage and identity facts require individual review.", {
          suggestionId,
          suggestionType: suggestion.suggestionType
        });
      }
      return appStore.requestSuggestionRetake(suggestionId, input.reason, actor);
    });
    await persistMutation(options);
    sendData(res, suggestions);
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

  app.get("/api/inspections/:id/vehicle-reference", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    const inspection = inspectionForRequest(appStore, req.params.id, actor, "view NHTSA VIN reference data for this inspection");
    const vehicleReference = await decodeVehicleReference(inspection.vin, inspection.year);
    sendData(res, vehicleReference);
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
      suggestedGrade: output.suggestedGrade,
      conditionGradeBeforeRecon: output.conditionGradeBeforeRecon,
      evidenceBlockers: output.evidenceBlockers,
      explanationJson: output.explanation,
      gradingVersion: output.gradingVersion
    }, actor);
    await persistMutation(options);
    sendData(res, saved);
  }));

  app.post("/api/inspections/:id/condition-grade/approve", asyncRoute(async (req, res) => {
    const input = ApproveConditionGradeSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "grade:approve");
    inspectionForRequest(appStore, req.params.id, actor, "approve this condition grade");
    const saved = appStore.approveGrade(
      req.params.id,
      input.approvedGrade,
      input.overrideReason ?? null,
      actor
    );
    await persistMutation(options);
    sendData(res, saved);
  }));

  app.post("/api/inspections/:id/ai-report", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "report:draft");
    const inspection = inspectionForRequest(appStore, req.params.id, actor, "draft a report for this inspection");
    const result = await draftInspectionReport(appStore, inspection, actor, req.header("idempotency-key") ?? req.body?.idempotencyKey ?? null);
    await persistMutation(options);
    sendData(res, result, "status" in result && result.status === "failed" ? 502 : 200);
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
    if (job.status !== "failed") throw conflict("Only failed report jobs can be retried.", { status: job.status });
    const inspection = inspectionForRequest(appStore, job.inspectionId, actor, "retry this report job");
    const result = await draftInspectionReport(appStore, inspection, actor, `retry:${job.id}:${Date.now()}`);
    await persistMutation(options);
    sendData(res, result, "status" in result && result.status === "failed" ? 502 : 200);
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
    const report = appStore.patchReport(req.params.id, input.reportBody, actor, {
      expectedVersion: input.expectedVersion,
      reviewerComment: input.reviewerComment
    });
    await persistMutation(options);
    sendData(res, report);
  }));

  app.post("/api/reports/:id/approve", asyncRoute(async (req, res) => {
    const input = ReportApprovalSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "report:approve");
    reportForRequest(appStore, req.params.id, actor, "approve this report");
    const report = appStore.approveReport(req.params.id, actor, input.expectedVersion, input.reviewerComment);
    await persistMutation(options);
    sendData(res, report);
  }));

  app.post("/api/reports/:id/finalize", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "report:finalize");
    const currentReport = reportForRequest(appStore, req.params.id, actor, "finalize this report");
    const intake = appStore.recon.intakeForInspection(currentReport.inspectionId);
    if (intake && intake.inspectionWorkflowStatus !== "REVIEW_READY") {
      throw conflict("The inspection workflow must be REVIEW_READY before publishing the condition report.", {
        inspectionWorkflowStatus: intake.inspectionWorkflowStatus
      });
    }
    const expectedVersion = SuggestionDecisionSchema.parse(req.body ?? {}).expectedVersion;
    const report = appStore.finalizeReport(req.params.id, actor, expectedVersion);
    if (intake) {
      appStore.recon.transitionInspection(report.inspectionId, "CR_PUBLISHED", actor);
    }
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

  app.get("/api/reports/:id/versions", asyncRoute((req, res) => {
    const actor = actorFromRequest(req, appStore);
    reportForRequest(appStore, req.params.id, actor, "view report version history");
    sendData(res, appStore.reportVersionsFor(req.params.id));
  }));

  app.post("/api/consignor-accounts", asyncRoute(async (req, res) => {
    const input = CreateConsignorAccountSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "recon:policy_manage");
    const account = appStore.recon.createConsignorAccount(input, actor);
    await persistMutation(options);
    sendData(res, account, 201);
  }));

  app.post("/api/consignor-accounts/:id/policies", asyncRoute(async (req, res) => {
    const input = CreateReconAuthorizationPolicySchema.parse({
      ...req.body,
      consignorAccountId: req.params.id
    });
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "recon:policy_manage");
    const policy = appStore.recon.createPolicy(input, actor);
    await persistMutation(options);
    sendData(res, policy, 201);
  }));

  app.post("/api/vehicle-intakes", asyncRoute(async (req, res) => {
    const input = CreateVehicleIntakeSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "vehicle:check_in");
    inspectionForRequest(appStore, input.inspectionId, actor, "check in this vehicle");
    const intake = appStore.recon.createVehicleIntake(input, actor);
    await persistMutation(options);
    sendData(res, intake, 201);
  }));

  app.post("/api/inspections/:id/assign", asyncRoute(async (req, res) => {
    const input = AssignInspectionSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "inspection:assign");
    const assignment = appStore.recon.assignInspection(req.params.id, input.assignedToUserId, input.dueAt, actor);
    await persistMutation(options);
    sendData(res, assignment, 201);
  }));

  app.post("/api/inspections/:id/workflow-status", asyncRoute(async (req, res) => {
    const input = TransitionInspectionWorkflowSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "inspection:workflow");
    inspectionForRequest(appStore, req.params.id, actor, "advance this inspection workflow");
    const intake = appStore.recon.transitionInspection(req.params.id, input.nextStatus, actor);
    await persistMutation(options);
    sendData(res, intake);
  }));

  app.patch("/api/inspections/:id/location", asyncRoute(async (req, res) => {
    const input = VehicleLocationUpdateSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "vehicle:update_location");
    const location = appStore.recon.updateLocation(req.params.id, input, actor);
    await persistMutation(options);
    sendData(res, location);
  }));

  app.get("/api/operations/recon", (req, res) => {
    const actor = actorFromRequest(req, appStore);
    const allowed = ["reviewer", "recon_coordinator", "consignor_approver", "technician", "admin"].includes(actor.role)
      || isEvaluationActor(actor);
    if (!allowed) throw forbidden("This role does not have access to the recon operations queue.");
    const records = appStore.recon.listOperations(actor)
      .filter((record) => appStore.recon.userCanAccessConsignor(actor, record.inspection.id) || isEvaluationActor(actor));
    sendData(res, records);
  });

  app.get("/api/operations/recon/:inspectionId", (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireReconAccess(appStore, req.params.inspectionId, actor, "view recon operations");
    sendData(res, appStore.recon.operationsRecord(req.params.inspectionId, actor));
  });

  app.post("/api/inspections/:id/recon/recommendations", asyncRoute(async (req, res) => {
    const input = CreateReconRecommendationSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "recon:estimate");
    requireReconAccess(appStore, req.params.id, actor, "create recon estimates");
    const recommendation = appStore.recon.createRecommendation(req.params.id, input, actor);
    await persistMutation(options);
    sendData(res, recommendation, 201);
  }));

  app.post("/api/inspections/:id/recon/submit", asyncRoute(async (req, res) => {
    const input = SubmitReconEstimateSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "recon:estimate");
    requireReconAccess(appStore, req.params.id, actor, "submit recon estimates");
    const record = appStore.recon.submitEstimate(req.params.id, input.recommendationIds, actor);
    await persistMutation(options);
    sendData(res, record);
  }));

  app.post("/api/recon/authorizations/:id/decision", asyncRoute(async (req, res) => {
    const input = ConsignorDecisionSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "recon:authorize");
    const authorization = appStore.recon.getAuthorization(req.params.id);
    requireReconAccess(appStore, authorization.inspectionId, actor, "decide this recon authorization");
    const decision = appStore.recon.decideAuthorization(req.params.id, input, actor);
    await persistMutation(options);
    sendData(res, decision);
  }));

  app.post("/api/recon/authorizations/:id/administrative-override", asyncRoute(async (req, res) => {
    const input = AdministrativeAuthorizationSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "recon:policy_manage");
    const decision = appStore.recon.decideAuthorization(
      req.params.id,
      input,
      actor,
      "ADMINISTRATIVE_OVERRIDE",
      input.overrideReason
    );
    await persistMutation(options);
    sendData(res, decision);
  }));

  app.patch("/api/work-orders/:id", asyncRoute(async (req, res) => {
    const input = WorkOrderUpdateSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "work_order:update");
    const workOrder = appStore.recon.getWorkOrder(req.params.id);
    requireReconAccess(appStore, workOrder.inspectionId, actor, "update this work order");
    const updated = appStore.recon.updateWorkOrder(req.params.id, input, actor);
    await persistMutation(options);
    sendData(res, updated);
  }));

  app.post("/api/work-orders/:id/quality-control", asyncRoute(async (req, res) => {
    const input = QualityControlDecisionSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "quality_control:decide");
    const workOrder = appStore.recon.getWorkOrder(req.params.id);
    requireReconAccess(appStore, workOrder.inspectionId, actor, "record quality control");
    const result = appStore.recon.recordQualityControl(req.params.id, input, actor);
    await persistMutation(options);
    sendData(res, result, 201);
  }));

  app.post("/api/inspections/:id/sale-readiness", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "sale_readiness:assess");
    requireReconAccess(appStore, req.params.id, actor, "assess sale readiness");
    const readiness = appStore.recon.assessReadiness(req.params.id, actor);
    await persistMutation(options);
    sendData(res, readiness);
  }));

  app.get("/api/platform-health", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    const provider = getVisionProvider();
    const [bedrockUsage, operationalEvents, projectionHealth, eventDlq] = await Promise.all([
      getMonthlyBedrockUsage(),
      listRecentOperationalEvents(),
      getOperationalProjectionHealth(),
      domainEventDlqHealth()
    ]);
    sendData(res, {
      ...platformHealthPayload(appStore, {
      visionProviderName: provider.name,
      visionPromptVersion: provider.promptVersion,
      actor,
      apiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? `${req.protocol}://${req.get("host")}`,
      authMode: authMode() === "jwt" ? "Cognito/OIDC JWT" : "local role header",
      roleSource: isEvaluationActor(actor)
        ? "public evaluation route (read-only)"
        : (req as AuthenticatedRequest).actor
          ? "verified JWT role claim or configured identity mapping"
          : "local role header"
      }),
      eventDrivenOperations: {
        bus: process.env.DOMAIN_EVENT_BUS_NAME ?? "local event adapter",
        pendingOutboxEvents: appStore.pendingDomainEvents().length,
        deliveredOutboxEvents: [...appStore.domainEvents.values()].filter((event) => event.status === "delivered").length,
        failedOutboxEvents: [...appStore.domainEvents.values()].filter((event) => event.status === "failed").length,
        recentProjectionEvents: operationalEvents,
        projectionHealth,
        eventDlq
      },
      costGuard: {
        month: bedrockUsage.month,
        imageAnalyses: { used: bedrockUsage.imageAnalyses, limit: Number(process.env.BEDROCK_MONTHLY_IMAGE_LIMIT ?? 250) },
        reportDrafts: { used: bedrockUsage.reportDrafts, limit: Number(process.env.BEDROCK_MONTHLY_REPORT_LIMIT ?? 50) }
      }
    });
  }));

  app.get("/api/operations/projections", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "ops:view");
    const requestedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 50;
    const [events, health, usage, eventDlq] = await Promise.all([
      listRecentOperationalEvents(limit),
      getOperationalProjectionHealth(),
      getMonthlyBedrockUsage(),
      domainEventDlqHealth()
    ]);
    sendData(res, { health, events, usage, eventDlq });
  }));

  app.post("/api/platform-health/replay-domain-events", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "ops:recover");
    const eventIds = Array.isArray(req.body?.eventIds)
      ? req.body.eventIds.filter((value: unknown): value is string => typeof value === "string")
      : undefined;
    const result = await flushPendingDomainEvents(appStore, eventIds);
    const replayedInspectionIds = new Set(
      [...appStore.domainEvents.values()]
        .filter((event) => !eventIds || eventIds.includes(event.id))
        .map((event) => event.inspectionId)
    );
    if (replayedInspectionIds.size === 0) throw validation("No matching domain events were found for replay.");
    for (const inspectionId of replayedInspectionIds) {
      appStore.addAudit(inspectionId, actor, "domain_event.replayed", {
        ...result,
        eventIds: eventIds ?? "all pending"
      });
    }
    await persistMutation(options);
    sendData(res, result);
  }));

  app.post("/api/platform-health/replay-domain-event-dlq", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "ops:recover");
    const result = await replayDomainEventDlq(Number(req.body?.maxMessages ?? 10));
    const auditInspection = appStore.listInspections()[0];
    if (auditInspection) {
      appStore.addAudit(auditInspection.id, actor, "domain_event.dlq_replayed", result);
      await persistMutation(options);
    }
    sendData(res, result);
  }));

  app.post("/api/platform-health/simulate-failed-image-job", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "ops:recover");
    if (!opsSimulationEnabled()) {
      throw conflict("Failed-job simulation is disabled in this environment.", {
        enableWith: "ENABLE_OPS_SIMULATION=true"
      });
    }

    let inspection = appStore.listInspections().find((item) => item.status !== "FINALIZED");
    if (!inspection) {
      inspection = appStore.createInspection({
        vin: `OPS${Date.now().toString().slice(-12)}`,
        year: 2024,
        make: "Hyundai",
        model: "Tucson",
        trim: "SEL",
        mileage: 14250,
        exteriorColor: "Gray",
        sellerSource: "Operations recovery drill",
        inspectorName: actor.name
      }, actor);
    }

    let photo = appStore.listPhotos(inspection.id).find((item) => item.analysisStatus !== "completed");
    if (!photo) {
      photo = appStore.addPhoto({
        inspectionId: inspection.id,
        storageKey: "/sample-images/front-clean.jpg",
        originalFilename: "ops-recovery-front.jpg",
        mimeType: "image/jpeg",
        sourceName: "Operations recovery drill",
        uploadedBy: actor.id,
        declaredAngle: "front"
      }, actor);
    }

    const job = appStore.enqueueImageAnalysis(photo, actor, `ops-drill-${Date.now()}`);
    const timestamp = new Date().toISOString();
    job.status = "failed";
    job.attempts = Math.max(job.attempts, 1);
    job.errorMessage = "Simulated image-provider timeout for Platform Health recovery drill.";
    job.updatedAt = timestamp;
    job.completedAt = null;
    photo.analysisStatus = "failed";
    photo.qualityStatus = "fail";
    appStore.addAudit(inspection.id, actor, "image_analysis.failure_simulated", {
      jobId: job.id,
      photoId: photo.id,
      purpose: "Platform Health recovery drill"
    });

    await persistMutation(options);
    sendData(res, {
      inspection,
      photo,
      job
    }, 201);
  }));

  app.post("/api/platform-health/recover-failed-jobs", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    requireAction(actor, "ops:recover");
    const timestamp = new Date().toISOString();
    const recoverableJobs = [...appStore.imageAnalysisJobs.values()].filter((job) => job.status === "failed" || job.status === "dead_letter");
    for (const job of recoverableJobs) {
      const photo = appStore.photos.get(job.photoId);
      if (!photo) continue;
      job.status = "queued";
      job.errorMessage = null;
      job.completedAt = null;
      job.updatedAt = timestamp;
      photo.analysisStatus = "pending";
      photo.qualityStatus = "unknown";
      appStore.addAudit(job.inspectionId, actor, "image_analysis.requeued", {
        jobId: job.id,
        photoId: job.photoId,
        previousStatus: "failed_or_dead_letter",
        reason: req.body?.reason ?? "Operator recovery from Platform Health"
      });
    }
    await persistMutation(options);
    sendData(res, {
      requeued: recoverableJobs.length,
      jobs: recoverableJobs
    });
  }));

  app.use(errorHandler);
  return app;
}
