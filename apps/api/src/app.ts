import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
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
  UploadPhotoSchema,
  type ApiEnvelope
} from "@inspectiq/shared";
import { errorHandler, validation, conflict } from "./errors.js";
import { gradeCondition } from "./gradingClient.js";
import { getReportProvider } from "./reportProvider.js";
import { getVisionProvider } from "./mockVisionProvider.js";
import { findSampleImage, sampleBundles, sampleImages } from "./sampleImages.js";
import { seedStore } from "./seedData.js";
import { MemoryStore, store as defaultStore } from "./store.js";
import type { Actor } from "./domain.js";

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

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

function actorFromRequest(req: Request, store: MemoryStore): Actor {
  const fallback = store.defaultActor();
  return {
    id: String(req.header("x-actor-id") ?? fallback.id),
    name: String(req.header("x-actor-name") ?? fallback.name),
    role: req.header("x-actor-role") === "reviewer" || req.header("x-actor-role") === "admin" ? req.header("x-actor-role") as Actor["role"] : fallback.role
  };
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
    `Reasoning summary: ${draft.reasoningSummary ?? ""}`
  ].join("\n");
}

export function createApp(appStore = defaultStore): express.Express {
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
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? true }));
  app.use(express.json({ limit: "2mb" }));

  const sampleImagePath = path.resolve(process.cwd(), "../../sample-data/images");
  app.use("/sample-images", express.static(sampleImagePath));

  app.get("/api/health", (_req, res) => {
    sendData(res, {
      ok: true,
      service: "inspectiq-api",
      providers: {
        vision: process.env.VISION_PROVIDER ?? "mock",
        report: process.env.REPORT_PROVIDER ?? "mock"
      },
      uptimeSeconds: Math.round(process.uptime())
    });
  });

  app.get("/api/inspections", (_req, res) => {
    sendData(res, appStore.listInspections().map((inspection) => ({
      ...inspection,
      conditionGrade: appStore.latestGrade(inspection.id),
      humanReviewFlag: inspection.status === "HUMAN_REVIEW_REQUIRED"
    })));
  });

  app.post("/api/inspections", asyncRoute((req, res) => {
    const input = CreateInspectionSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    sendData(res, appStore.createInspection(input, actor), 201);
  }));

  app.get("/api/inspections/:id", asyncRoute((req, res) => {
    sendData(res, appStore.bundle(req.params.id));
  }));

  app.patch("/api/inspections/:id", asyncRoute((req, res) => {
    const input = PatchInspectionSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    sendData(res, appStore.patchInspection(req.params.id, input, actor));
  }));

  app.post("/api/inspections/:id/photos/upload", asyncRoute((req, res) => {
    const input = UploadPhotoSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    const photo = appStore.addPhoto({
      inspectionId: req.params.id,
      storageKey: input.storageKey ?? `/uploads/${crypto.randomUUID()}-${input.originalFilename}`,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      uploadedBy: actor.id,
      declaredAngle: input.declaredAngle ?? null
    }, actor);
    sendData(res, photo, 201);
  }));

  app.post("/api/inspections/:id/photos/sample", asyncRoute((req, res) => {
    const input = SamplePhotoSchema.parse(req.body);
    const actor = actorFromRequest(req, appStore);
    const keys = sampleBundles[input.sampleKey] ?? [input.sampleKey];
    const photos = keys.map((key) => {
      const sample = findSampleImage(key);
      if (!sample) throw validation(`Unknown sample image: ${key}`);
      return appStore.addPhoto({
        inspectionId: req.params.id,
        storageKey: `/sample-images/${sample.filename}`,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        uploadedBy: actor.id,
        declaredAngle: null
      }, actor);
    });
    sendData(res, photos, 201);
  }));

  app.get("/api/inspections/:id/photos", asyncRoute((req, res) => {
    sendData(res, appStore.listPhotos(req.params.id));
  }));

  app.post("/api/photos/:photoId/analyze", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    const photo = appStore.getPhoto(req.params.photoId);
    if (photo.analysisStatus === "completed" && !req.body?.force) {
      sendData(res, {
        analysis: appStore.getPhotoAnalysis(photo.id),
        suggestions: appStore.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
      });
      return;
    }
    const provider = getVisionProvider();
    try {
      const result = await provider.analyze({ filename: photo.originalFilename, storageKey: photo.storageKey });
      const analysis = appStore.saveAnalysis(photo, {
        provider: provider.name,
        promptVersion: provider.promptVersion,
        raw: result.raw,
        validated: result.validated
      }, actor);
      sendData(res, {
        analysis,
        suggestions: appStore.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
      });
    } catch (error) {
      const analysis = appStore.failAnalysis(photo, provider.name, provider.promptVersion, error instanceof Error ? error.message : "Unknown analysis failure.", actor);
      sendData(res, analysis, 502);
    }
  }));

  app.get("/api/photos/:photoId/analysis", asyncRoute((req, res) => {
    sendData(res, appStore.getPhotoAnalysis(req.params.photoId));
  }));

  app.get("/api/inspections/:id/vision-suggestions", asyncRoute((req, res) => {
    sendData(res, appStore.listSuggestions(req.params.id));
  }));

  app.post("/api/vision-suggestions/:id/accept", asyncRoute((req, res) => {
    sendData(res, appStore.acceptSuggestion(req.params.id, actorFromRequest(req, appStore)));
  }));

  app.post("/api/vision-suggestions/:id/reject", asyncRoute((req, res) => {
    sendData(res, appStore.rejectSuggestion(req.params.id, actorFromRequest(req, appStore)));
  }));

  app.patch("/api/vision-suggestions/:id", asyncRoute((req, res) => {
    const input = UpdateSuggestionSchema.parse(req.body);
    if (!Object.prototype.hasOwnProperty.call(input, "suggestedValue")) {
      throw validation("suggestedValue is required.");
    }
    sendData(res, appStore.editSuggestion(req.params.id, {
      suggestedValue: input.suggestedValue,
      explanation: input.explanation
    }, actorFromRequest(req, appStore)));
  }));

  app.post("/api/inspections/:id/damage", asyncRoute((req, res) => {
    const input = CreateDamageItemSchema.parse(req.body);
    sendData(res, appStore.addDamage({
      inspectionId: req.params.id,
      photoId: input.photoId ?? null,
      location: input.location,
      damageType: input.damageType,
      severity: input.severity,
      notes: input.notes,
      source: input.source
    }, actorFromRequest(req, appStore)), 201);
  }));

  app.patch("/api/damage/:id", asyncRoute((req, res) => {
    const input = PatchDamageItemSchema.parse(req.body);
    sendData(res, appStore.patchDamage(req.params.id, input, actorFromRequest(req, appStore)));
  }));

  app.delete("/api/damage/:id", asyncRoute((req, res) => {
    appStore.deleteDamage(req.params.id, actorFromRequest(req, appStore));
    sendData(res, { deleted: true });
  }));

  app.post("/api/inspections/:id/grade", asyncRoute(async (req, res) => {
    GradeRequestSchema.parse(req.body ?? {});
    const actor = actorFromRequest(req, appStore);
    const inspection = appStore.getInspection(req.params.id);
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
    sendData(res, saved);
  }));

  app.post("/api/inspections/:id/ai-report", asyncRoute(async (req, res) => {
    const actor = actorFromRequest(req, appStore);
    const inspection = appStore.getInspection(req.params.id);
    const grade = appStore.latestGrade(inspection.id);
    if (!grade) throw conflict("Generate a deterministic condition grade before requesting an AI report.");
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
      sendData(res, {
        job: appStore.latestReportJob(inspection.id),
        draft,
        finalReport: appStore.latestFinalReport(inspection.id)
      });
    } catch (error) {
      const failed = appStore.failReportJob(job.id, error instanceof Error ? error.message : "Unknown report provider failure.", actor);
      sendData(res, failed, 502);
    }
  }));

  app.get("/api/inspections/:id/ai-report", asyncRoute((req, res) => {
    appStore.getInspection(req.params.id);
    sendData(res, {
      job: appStore.latestReportJob(req.params.id),
      draft: appStore.latestReportDraft(req.params.id),
      finalReport: appStore.latestFinalReport(req.params.id)
    });
  }));

  app.post("/api/ai-report-jobs/:jobId/retry", asyncRoute(async (req, res) => {
    const job = appStore.reportJobs.get(req.params.jobId);
    if (!job) throw validation("Unknown AI report job.");
    appStore.getInspection(job.inspectionId);
    sendData(res, { retryWith: `/api/inspections/${job.inspectionId}/ai-report` });
  }));

  app.patch("/api/reports/:id", asyncRoute((req, res) => {
    const input = PatchReportSchema.parse(req.body);
    sendData(res, appStore.patchReport(req.params.id, input.reportBody, actorFromRequest(req, appStore)));
  }));

  app.post("/api/reports/:id/finalize", asyncRoute((req, res) => {
    sendData(res, appStore.finalizeReport(req.params.id, actorFromRequest(req, appStore)));
  }));

  app.get("/api/inspections/:id/audit-events", asyncRoute((req, res) => {
    sendData(res, appStore.auditForInspection(req.params.id));
  }));

  app.get("/api/platform-health", (_req, res) => {
    sendData(res, {
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
    });
  });

  app.use(errorHandler);
  return app;
}
