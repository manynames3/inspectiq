import {
  DamageCandidateSchema,
  ImageQualitySchema,
  PhotoAngleSchema,
  estimateDamageRepairCost,
  requiredPhotoAngles,
  type CreateInspectionSchema,
  type DamageSeverity,
  type DamageType,
  type InspectionStatus,
  type PhotoAngle,
  type ReadinessIssue,
  type VisionOutput
} from "@inspectiq/shared";
import { z } from "zod";
import type {
  Actor,
  AiReportDraft,
  AiReportJob,
  AuditEvent,
  ConditionGrade,
  DamageItem,
  FinalReport,
  ImageAnalysisJob,
  Inspection,
  InspectionBundle,
  OperationalMetric,
  PhotoAnalysisResult,
  User,
  VehiclePhoto,
  VisionSuggestion
} from "./domain.js";
import { conflict, notFound } from "./errors.js";
import { assertTransition, canTransition } from "./stateMachine.js";

type CreateInspectionInput = z.infer<typeof CreateInspectionSchema>;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const mutableInspectionFields = [
  "vin",
  "year",
  "make",
  "model",
  "trim",
  "mileage",
  "exteriorColor",
  "sellerSource",
  "inspectorName"
] as const;
const PhotoAngleSuggestionSchema = z.object({ photoAngle: PhotoAngleSchema }).strict();
const QualityWarningSuggestionSchema = z.object({
  warning: z.string().trim().min(1).max(160),
  imageQuality: ImageQualitySchema.optional()
}).strict();
const ExtractedTextSuggestionSchema = z.object({
  odometer: z.string().nullable().optional(),
  vin: z.string().nullable().optional()
}).strict();

function percentLabel(numerator: number, denominator: number, fallback = 0): string {
  if (denominator === 0) return `${fallback}%`;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function rateValue(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0) return fallback;
  return numerator / denominator;
}

function formatLatency(minutes: number | null): string {
  if (minutes === null) return "No grade jobs yet";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}

function analysisRequiresRetake(analysis: PhotoAnalysisResult): boolean {
  const output = analysis.validatedOutputJson;
  if (!output || typeof output !== "object") return false;
  const imageQuality = (output as { imageQuality?: unknown }).imageQuality;
  if (!imageQuality || typeof imageQuality !== "object") return false;
  return (imageQuality as { retakeRequired?: unknown }).retakeRequired === true;
}

function validateSuggestionValue(suggestion: VisionSuggestion): unknown {
  if (suggestion.suggestionType === "photo_angle") {
    return PhotoAngleSuggestionSchema.parse(suggestion.suggestedValueJson);
  }
  if (suggestion.suggestionType === "damage_candidate") {
    return DamageCandidateSchema.parse(suggestion.suggestedValueJson);
  }
  if (suggestion.suggestionType === "quality_warning") {
    return QualityWarningSuggestionSchema.parse(suggestion.suggestedValueJson);
  }
  return ExtractedTextSuggestionSchema.parse(suggestion.suggestedValueJson);
}

export class MemoryStore {
  users = new Map<string, User>();
  inspections = new Map<string, Inspection>();
  photos = new Map<string, VehiclePhoto>();
  imageAnalysisJobs = new Map<string, ImageAnalysisJob>();
  analyses = new Map<string, PhotoAnalysisResult>();
  suggestions = new Map<string, VisionSuggestion>();
  damageItems = new Map<string, DamageItem>();
  conditionGrades = new Map<string, ConditionGrade>();
  reportJobs = new Map<string, AiReportJob>();
  reportDrafts = new Map<string, AiReportDraft>();
  finalReports = new Map<string, FinalReport>();
  auditEvents = new Map<string, AuditEvent>();

  assertMutableInspection(inspectionId: string, action: string): Inspection {
    const inspection = this.getInspection(inspectionId);
    if (inspection.status === "FINALIZED") {
      throw conflict(`Cannot ${action} on a finalized inspection.`);
    }
    return inspection;
  }

  reset(): void {
    this.users.clear();
    this.inspections.clear();
    this.photos.clear();
    this.imageAnalysisJobs.clear();
    this.analyses.clear();
    this.suggestions.clear();
    this.damageItems.clear();
    this.conditionGrades.clear();
    this.reportJobs.clear();
    this.reportDrafts.clear();
    this.finalReports.clear();
    this.auditEvents.clear();
  }

  addUser(input: Pick<User, "name" | "role"> & { id?: string }): User {
    const user: User = {
      id: input.id ?? id(),
      name: input.name,
      role: input.role,
      createdAt: now()
    };
    this.users.set(user.id, user);
    return user;
  }

  defaultActor(): Actor {
    const user = [...this.users.values()][0] ?? this.addUser({ name: "John Smith", role: "inspector" });
    return { id: user.id, name: user.name, role: user.role };
  }

  listInspections(): Inspection[] {
    return [...this.inspections.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getInspection(idValue: string): Inspection {
    const inspection = this.inspections.get(idValue);
    if (!inspection) throw notFound("Inspection");
    return inspection;
  }

  createInspection(input: CreateInspectionInput, actor: Actor): Inspection {
    const timestamp = now();
    const inspection: Inspection = {
      id: id(),
      vin: input.vin,
      year: input.year,
      make: input.make,
      model: input.model,
      trim: input.trim,
      mileage: input.mileage,
      exteriorColor: input.exteriorColor,
      sellerSource: input.sellerSource,
      inspectorName: input.inspectorName,
      status: "DRAFT",
      completenessPercentage: 0,
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      finalizedAt: null
    };
    this.inspections.set(inspection.id, inspection);
    this.addAudit(inspection.id, actor, "inspection.created", { status: inspection.status, vin: inspection.vin });
    return inspection;
  }

  patchInspection(idValue: string, patch: Partial<CreateInspectionInput> & { status?: InspectionStatus }, actor: Actor): Inspection {
    const inspection = this.getInspection(idValue);
    const hasFieldPatch = mutableInspectionFields.some((field) => Object.prototype.hasOwnProperty.call(patch, field));
    if (patch.status === "FINALIZED") {
      throw conflict("Finalize inspections through the report finalization endpoint.");
    }
    if (inspection.status === "FINALIZED") {
      throw conflict("Cannot edit inspection fields on a finalized inspection.");
    }
    if (hasFieldPatch) {
      this.assertMutableInspection(idValue, "edit inspection fields");
    }
    const before = { ...inspection };
    if (patch.status) {
      this.transition(inspection.id, patch.status, actor, "inspection.status_changed");
    }
    const current = this.getInspection(idValue);
    Object.assign(current, {
      vin: patch.vin ?? current.vin,
      year: patch.year ?? current.year,
      make: patch.make ?? current.make,
      model: patch.model ?? current.model,
      trim: patch.trim ?? current.trim,
      mileage: patch.mileage ?? current.mileage,
      exteriorColor: patch.exteriorColor ?? current.exteriorColor,
      sellerSource: patch.sellerSource ?? current.sellerSource,
      inspectorName: patch.inspectorName ?? current.inspectorName,
      updatedAt: now()
    });
    this.addAudit(idValue, actor, "inspection.updated", { before, after: current });
    return current;
  }

  transition(inspectionId: string, nextStatus: InspectionStatus, actor: Actor, eventType = "inspection.status_changed"): Inspection {
    const inspection = this.getInspection(inspectionId);
    if (inspection.status === nextStatus) return inspection;
    assertTransition(inspection.status, nextStatus);
    const beforeStatus = inspection.status;
    inspection.status = nextStatus;
    inspection.updatedAt = now();
    if (nextStatus === "FINALIZED") inspection.finalizedAt = inspection.updatedAt;
    this.addAudit(inspectionId, actor, eventType, { beforeStatus, afterStatus: nextStatus });
    return inspection;
  }

  addPhoto(input: {
    inspectionId: string;
    storageKey: string;
    objectBucket?: string | null;
    objectKey?: string | null;
    thumbnailStorageKey?: string | null;
    byteSize?: number | null;
    checksumSha256?: string | null;
    originalFilename: string;
    mimeType: string;
    uploadedBy: string;
    declaredAngle?: PhotoAngle | null;
  }, actor: Actor): VehiclePhoto {
    const inspection = this.assertMutableInspection(input.inspectionId, "upload photos");
    const photo: VehiclePhoto = {
      id: id(),
      inspectionId: inspection.id,
      storageKey: input.storageKey,
      objectBucket: input.objectBucket ?? null,
      objectKey: input.objectKey ?? null,
      thumbnailStorageKey: input.thumbnailStorageKey ?? null,
      byteSize: input.byteSize ?? null,
      checksumSha256: input.checksumSha256 ?? null,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      uploadedBy: input.uploadedBy,
      uploadedAt: now(),
      uploadStatus: "uploaded",
      declaredAngle: input.declaredAngle ?? null,
      detectedAngle: null,
      detectedAngleConfidence: null,
      qualityStatus: "unknown",
      analysisStatus: "not_analyzed"
    };
    this.photos.set(photo.id, photo);
    this.maybeProgressFromDraft(inspection.id, actor);
    this.addAudit(inspection.id, actor, "photo.uploaded", {
      photoId: photo.id,
      storageKey: photo.storageKey,
      objectBucket: photo.objectBucket,
      objectKey: photo.objectKey,
      byteSize: photo.byteSize,
      declaredAngle: photo.declaredAngle
    });
    return photo;
  }

  listPhotos(inspectionId: string): VehiclePhoto[] {
    this.getInspection(inspectionId);
    return [...this.photos.values()].filter((photo) => photo.inspectionId === inspectionId);
  }

  getPhoto(photoId: string): VehiclePhoto {
    const photo = this.photos.get(photoId);
    if (!photo) throw notFound("Photo");
    return photo;
  }

  enqueueImageAnalysis(photo: VehiclePhoto, actor: Actor, idempotencyKey: string | null): ImageAnalysisJob {
    this.assertMutableInspection(photo.inspectionId, "queue photo analysis");
    const reusable = [...this.imageAnalysisJobs.values()].find((job) =>
      job.photoId === photo.id &&
      job.status !== "failed" &&
      job.status !== "dead_letter" &&
      (idempotencyKey ? job.idempotencyKey === idempotencyKey : true)
    );
    if (reusable) return reusable;

    const timestamp = now();
    const job: ImageAnalysisJob = {
      id: id(),
      inspectionId: photo.inspectionId,
      photoId: photo.id,
      status: "queued",
      idempotencyKey,
      attempts: 0,
      errorMessage: null,
      queuedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null
    };
    this.imageAnalysisJobs.set(job.id, job);
    photo.analysisStatus = "pending";
    this.addAudit(photo.inspectionId, actor, "image_analysis.queued", {
      jobId: job.id,
      photoId: photo.id,
      idempotencyKey
    });
    return job;
  }

  startImageAnalysisJob(jobId: string, actor: Actor): ImageAnalysisJob {
    const job = this.imageAnalysisJobs.get(jobId);
    if (!job) throw notFound("Image analysis job");
    const photo = this.getPhoto(job.photoId);
    this.assertMutableInspection(photo.inspectionId, "run photo analysis");
    job.status = "running";
    job.attempts += 1;
    job.updatedAt = now();
    photo.analysisStatus = "pending";
    this.addAudit(photo.inspectionId, actor, "image_analysis.started", {
      jobId: job.id,
      photoId: photo.id,
      attempt: job.attempts
    });
    return job;
  }

  imageAnalysisJobsForInspection(inspectionId: string): ImageAnalysisJob[] {
    this.getInspection(inspectionId);
    return [...this.imageAnalysisJobs.values()]
      .filter((job) => job.inspectionId === inspectionId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  saveAnalysis(photo: VehiclePhoto, input: {
    provider: string;
    promptVersion: string;
    raw: unknown;
    validated: VisionOutput;
    jobId?: string | null;
  }, actor: Actor): PhotoAnalysisResult {
    this.assertMutableInspection(photo.inspectionId, "analyze photos");
    const duplicate = [...this.analyses.values()].find((analysis) => analysis.photoId === photo.id && analysis.status === "completed");
    if (duplicate) {
      if (input.jobId) {
        const job = this.imageAnalysisJobs.get(input.jobId);
        if (job) {
          job.status = "completed";
          job.errorMessage = null;
          job.updatedAt = now();
          job.completedAt = job.updatedAt;
        }
      }
      return duplicate;
    }

    const analysis: PhotoAnalysisResult = {
      id: id(),
      photoId: photo.id,
      provider: input.provider,
      promptVersion: input.promptVersion,
      rawModelOutputJson: input.raw,
      validatedOutputJson: input.validated,
      confidence: input.validated.confidence,
      status: "completed",
      errorMessage: null,
      createdAt: now()
    };
    this.analyses.set(analysis.id, analysis);

    photo.detectedAngle = input.validated.photoAngle;
    photo.detectedAngleConfidence = input.validated.confidence;
    photo.qualityStatus = input.validated.qualityWarnings.length > 0 ? "warning" : "ok";
    photo.analysisStatus = "completed";

    if (input.jobId) {
      const job = this.imageAnalysisJobs.get(input.jobId);
      if (job) {
        job.status = "completed";
        job.errorMessage = null;
        job.updatedAt = now();
        job.completedAt = job.updatedAt;
      }
    }

    this.createSuggestion({
      inspectionId: photo.inspectionId,
      photoId: photo.id,
      suggestionType: "photo_angle",
      suggestedValueJson: { photoAngle: input.validated.photoAngle },
      confidence: input.validated.confidence,
      explanation: `Detected likely photo angle: ${input.validated.photoAngle}. AI suggestion - requires human confirmation.`
    });

    for (const warning of input.validated.qualityWarnings) {
      this.createSuggestion({
        inspectionId: photo.inspectionId,
        photoId: photo.id,
        suggestionType: "quality_warning",
        suggestedValueJson: { warning, imageQuality: input.validated.imageQuality },
        confidence: Math.min(input.validated.confidence, 0.75),
        explanation: `${warning} AI suggestion - requires human confirmation.`
      });
    }

    for (const candidate of input.validated.detectedDamageCandidates) {
      this.createSuggestion({
        inspectionId: photo.inspectionId,
        photoId: photo.id,
        suggestionType: "damage_candidate",
        suggestedValueJson: candidate,
        confidence: candidate.confidence,
        explanation: `${candidate.explanation} AI suggestion - requires human confirmation.`
      });
    }

    if (input.validated.extractedText.odometer || input.validated.extractedText.vin) {
      this.createSuggestion({
        inspectionId: photo.inspectionId,
        photoId: photo.id,
        suggestionType: "extracted_text",
        suggestedValueJson: input.validated.extractedText,
        confidence: input.validated.confidence,
        explanation: "Detected possible odometer or VIN text. AI suggestion - requires human confirmation."
      });
    }

    this.addAudit(photo.inspectionId, actor, "photo.analyzed", {
      jobId: input.jobId ?? null,
      photoId: photo.id,
      provider: input.provider,
      promptVersion: input.promptVersion,
      schema: "VisionOutputSchema",
      confidence: input.validated.confidence,
      imageQuality: input.validated.imageQuality,
      humanReviewRequired: input.validated.humanReviewRequired
    });
    return analysis;
  }

  failAnalysis(photo: VehiclePhoto, provider: string, promptVersion: string, errorMessage: string, actor: Actor, jobId?: string | null): PhotoAnalysisResult {
    this.assertMutableInspection(photo.inspectionId, "record photo analysis failures");
    photo.analysisStatus = "failed";
    photo.qualityStatus = "fail";
    if (jobId) {
      const job = this.imageAnalysisJobs.get(jobId);
      if (job) {
        job.status = job.attempts >= 3 ? "dead_letter" : "failed";
        job.errorMessage = errorMessage;
        job.updatedAt = now();
      }
    }
    const analysis: PhotoAnalysisResult = {
      id: id(),
      photoId: photo.id,
      provider,
      promptVersion,
      rawModelOutputJson: null,
      validatedOutputJson: null,
      confidence: 0,
      status: "failed",
      errorMessage,
      createdAt: now()
    };
    this.analyses.set(analysis.id, analysis);
    this.addAudit(photo.inspectionId, actor, "photo.analysis_failed", { jobId: jobId ?? null, photoId: photo.id, provider, errorMessage });
    return analysis;
  }

  getPhotoAnalysis(photoId: string): PhotoAnalysisResult | null {
    return [...this.analyses.values()]
      .filter((analysis) => analysis.photoId === photoId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  createSuggestion(input: Omit<VisionSuggestion, "id" | "status" | "reviewedBy" | "reviewedAt" | "createdAt">): VisionSuggestion {
    const suggestion: VisionSuggestion = {
      id: id(),
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now(),
      ...input
    };
    this.suggestions.set(suggestion.id, suggestion);
    return suggestion;
  }

  listSuggestions(inspectionId: string): VisionSuggestion[] {
    this.getInspection(inspectionId);
    return [...this.suggestions.values()]
      .filter((suggestion) => suggestion.inspectionId === inspectionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getSuggestion(idValue: string): VisionSuggestion {
    const suggestion = this.suggestions.get(idValue);
    if (!suggestion) throw notFound("Vision suggestion");
    return suggestion;
  }

  editSuggestion(idValue: string, patch: { suggestedValue: unknown; explanation?: string }, actor: Actor): VisionSuggestion {
    const suggestion = this.getSuggestion(idValue);
    this.assertMutableInspection(suggestion.inspectionId, "edit suggestions");
    if (suggestion.status === "accepted" || suggestion.status === "rejected") {
      throw conflict("Reviewed suggestions cannot be edited.");
    }
    validateSuggestionValue({ ...suggestion, suggestedValueJson: patch.suggestedValue });
    suggestion.suggestedValueJson = patch.suggestedValue;
    suggestion.explanation = patch.explanation ?? suggestion.explanation;
    suggestion.status = "edited";
    suggestion.reviewedBy = actor.id;
    suggestion.reviewedAt = now();
    this.addAudit(suggestion.inspectionId, actor, "suggestion.edited", {
      suggestionId: suggestion.id,
      suggestionType: suggestion.suggestionType,
      suggestedValueJson: suggestion.suggestedValueJson
    });
    return suggestion;
  }

  acceptSuggestion(idValue: string, actor: Actor): VisionSuggestion {
    const suggestion = this.getSuggestion(idValue);
    this.assertMutableInspection(suggestion.inspectionId, "accept suggestions");
    if (suggestion.status === "accepted") return suggestion;
    if (suggestion.status === "rejected") throw conflict("Rejected suggestions cannot be accepted without a new review.");
    const value = validateSuggestionValue(suggestion);
    let materializedDamageItemId: string | null = null;
    suggestion.status = "accepted";
    suggestion.reviewedBy = actor.id;
    suggestion.reviewedAt = now();

    if (suggestion.suggestionType === "photo_angle") {
      const angleValue = value as { photoAngle: PhotoAngle };
      const photo = this.getPhoto(suggestion.photoId);
      photo.declaredAngle = angleValue.photoAngle;
    }

    if (suggestion.suggestionType === "damage_candidate") {
      const damageValue = value as {
        location: string;
        damageType: DamageType;
        severityEstimate: DamageSeverity;
        explanation: string;
      };
      const item = this.addDamage({
        inspectionId: suggestion.inspectionId,
        photoId: suggestion.photoId,
        location: damageValue.location,
        damageType: damageValue.damageType,
        severity: damageValue.severityEstimate,
        notes: damageValue.explanation,
        source: "vision_suggestion",
        confirmedBy: actor.id
      }, actor);
      materializedDamageItemId = item.id;
    }

    this.recomputeCompleteness(suggestion.inspectionId, actor);
    this.addAudit(suggestion.inspectionId, actor, "suggestion.accepted", {
      suggestionId: suggestion.id,
      suggestionType: suggestion.suggestionType,
      value: suggestion.suggestedValueJson,
      materializedDamageItemId
    });
    return suggestion;
  }

  rejectSuggestion(idValue: string, actor: Actor): VisionSuggestion {
    const suggestion = this.getSuggestion(idValue);
    this.assertMutableInspection(suggestion.inspectionId, "reject suggestions");
    if (suggestion.status === "accepted") throw conflict("Accepted suggestions cannot be rejected.");
    suggestion.status = "rejected";
    suggestion.reviewedBy = actor.id;
    suggestion.reviewedAt = now();
    this.addAudit(suggestion.inspectionId, actor, "suggestion.rejected", {
      suggestionId: suggestion.id,
      suggestionType: suggestion.suggestionType
    });
    return suggestion;
  }

  addDamage(input: {
    inspectionId: string;
    photoId?: string | null;
    location: string;
    damageType: DamageType;
    severity: DamageSeverity;
    notes: string;
    source: "manual" | "vision_suggestion";
    confirmedBy?: string | null;
  }, actor: Actor, writeAudit = true): DamageItem {
    this.assertMutableInspection(input.inspectionId, "add damage");
    const item: DamageItem = {
      id: id(),
      inspectionId: input.inspectionId,
      photoId: input.photoId ?? null,
      location: input.location,
      damageType: input.damageType,
      severity: input.severity,
      notes: input.notes,
      source: input.source,
      confirmedBy: input.confirmedBy ?? actor.id,
      createdAt: now(),
      updatedAt: now()
    };
    this.damageItems.set(item.id, item);
    if (writeAudit) this.addAudit(item.inspectionId, actor, "damage.added", { damageItemId: item.id, item });
    return item;
  }

  patchDamage(idValue: string, patch: Partial<DamageItem>, actor: Actor): DamageItem {
    const item = this.damageItems.get(idValue);
    if (!item) throw notFound("Damage item");
    this.assertMutableInspection(item.inspectionId, "edit damage");
    const before = { ...item };
    Object.assign(item, {
      photoId: patch.photoId ?? item.photoId,
      location: patch.location ?? item.location,
      damageType: patch.damageType ?? item.damageType,
      severity: patch.severity ?? item.severity,
      notes: patch.notes ?? item.notes,
      updatedAt: now()
    });
    this.addAudit(item.inspectionId, actor, "damage.edited", { damageItemId: item.id, before, after: item });
    return item;
  }

  deleteDamage(idValue: string, actor: Actor): void {
    const item = this.damageItems.get(idValue);
    if (!item) throw notFound("Damage item");
    this.assertMutableInspection(item.inspectionId, "delete damage");
    this.damageItems.delete(idValue);
    this.addAudit(item.inspectionId, actor, "damage.deleted", { damageItemId: idValue, item });
  }

  listDamage(inspectionId: string): DamageItem[] {
    this.getInspection(inspectionId);
    return [...this.damageItems.values()].filter((item) => item.inspectionId === inspectionId);
  }

  saveGrade(inspectionId: string, grade: Omit<ConditionGrade, "id" | "inspectionId" | "createdAt">, actor: Actor): ConditionGrade {
    const existing = this.latestGrade(inspectionId);
    if (existing && existing.gradingVersion === grade.gradingVersion) return existing;
    const saved: ConditionGrade = {
      id: id(),
      inspectionId,
      createdAt: now(),
      ...grade
    };
    this.conditionGrades.set(saved.id, saved);
    this.transition(inspectionId, "GRADED", actor, "inspection.status_changed");
    this.addAudit(inspectionId, actor, "condition.grade_generated", {
      gradeId: saved.id,
      score: saved.score,
      grade: saved.grade,
      gradingVersion: saved.gradingVersion
    });
    return saved;
  }

  latestGrade(inspectionId: string): ConditionGrade | null {
    return [...this.conditionGrades.values()]
      .filter((grade) => grade.inspectionId === inspectionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  createReportJob(inspectionId: string, idempotencyKey: string | null, actor: Actor): AiReportJob {
    const active = [...this.reportJobs.values()].find((job) =>
      job.inspectionId === inspectionId &&
      job.status !== "failed" &&
      job.status !== "completed" &&
      (idempotencyKey ? job.idempotencyKey === idempotencyKey : true)
    );
    if (active) return active;
    const timestamp = now();
    const job: AiReportJob = {
      id: id(),
      inspectionId,
      status: "pending",
      idempotencyKey,
      errorMessage: null,
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.reportJobs.set(job.id, job);
    this.transition(inspectionId, "AI_DRAFT_PENDING", actor, "inspection.status_changed");
    this.addAudit(inspectionId, actor, "ai_report.requested", { jobId: job.id, idempotencyKey });
    return job;
  }

  markJobRunning(jobId: string): AiReportJob {
    const job = this.reportJobs.get(jobId);
    if (!job) throw notFound("AI report job");
    job.status = "running";
    job.attempts += 1;
    job.updatedAt = now();
    return job;
  }

  completeReportJob(jobId: string, draft: Omit<AiReportDraft, "id" | "createdAt">, reportBody: string, actor: Actor): AiReportDraft {
    const job = this.reportJobs.get(jobId);
    if (!job) throw notFound("AI report job");
    const savedDraft: AiReportDraft = {
      id: id(),
      createdAt: now(),
      ...draft
    };
    this.reportDrafts.set(savedDraft.id, savedDraft);
    job.status = "completed";
    job.updatedAt = now();

    const existingReport = this.latestFinalReport(job.inspectionId);
    if (existingReport) {
      existingReport.reportBody = reportBody;
      existingReport.version += 1;
    } else {
      const reportId = id();
      this.finalReports.set(reportId, {
        id: reportId,
        inspectionId: job.inspectionId,
        reportBody,
        finalizedBy: null,
        finalizedAt: null,
        version: 1
      });
    }

    const nextStatus = savedDraft.humanReviewRequired ? "HUMAN_REVIEW_REQUIRED" : "AI_DRAFTED";
    this.transition(job.inspectionId, nextStatus, actor, "inspection.status_changed");
    if (savedDraft.humanReviewRequired) {
      this.addAudit(job.inspectionId, actor, "human_review.required", {
        jobId: job.id,
        draftId: savedDraft.id,
        reason: "Report draft requires reviewer approval."
      });
    }
    this.addAudit(job.inspectionId, actor, "ai_report.generated", {
      jobId: job.id,
      draftId: savedDraft.id,
      provider: savedDraft.provider,
      promptVersion: savedDraft.promptVersion,
      schema: "AiReportOutputSchema",
      confidence: savedDraft.confidence,
      humanReviewRequired: savedDraft.humanReviewRequired
    });
    return savedDraft;
  }

  failReportJob(jobId: string, errorMessage: string, actor: Actor): AiReportJob {
    const job = this.reportJobs.get(jobId);
    if (!job) throw notFound("AI report job");
    job.status = "failed";
    job.errorMessage = errorMessage;
    job.updatedAt = now();
    this.transition(job.inspectionId, "REPORT_FAILED", actor, "inspection.status_changed");
    this.addAudit(job.inspectionId, actor, "ai_report.failed", { jobId, errorMessage });
    return job;
  }

  latestReportJob(inspectionId: string): AiReportJob | null {
    return [...this.reportJobs.values()]
      .filter((job) => job.inspectionId === inspectionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  latestReportDraft(inspectionId: string): AiReportDraft | null {
    return [...this.reportDrafts.values()]
      .filter((draft) => draft.inspectionId === inspectionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  latestFinalReport(inspectionId: string): FinalReport | null {
    return [...this.finalReports.values()]
      .filter((report) => report.inspectionId === inspectionId)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }

  getFinalReport(reportId: string): FinalReport {
    const report = this.finalReports.get(reportId);
    if (!report) throw notFound("Final report");
    return report;
  }

  buyerReportExport(reportId: string): { filename: string; body: string } {
    const report = this.getFinalReport(reportId);
    const inspection = this.getInspection(report.inspectionId);
    const grade = this.latestGrade(inspection.id);
    const damage = this.listDamage(inspection.id);
    const totalEstimate = damage.length > 0
      ? damage.map((item) => estimateDamageRepairCost(item.damageType, item.severity))
      : [];
    const minEstimate = totalEstimate.reduce((sum, item) => sum + item.min, 0);
    const maxEstimate = totalEstimate.reduce((sum, item) => sum + item.max, 0);
    const estimateLabel = totalEstimate.length === 0
      ? "No confirmed recon"
      : minEstimate === 0 && maxEstimate === 0
        ? "Estimator review"
        : `$${minEstimate.toLocaleString()} - $${maxEstimate.toLocaleString()}`;
    const damageLines = damage.length > 0
      ? damage.map((item) => `- ${item.location}: ${item.severity} ${item.damageType.replaceAll("_", " ")}. ${item.notes}`)
      : ["- No confirmed damage items."];
    const body = [
      `Condition Report: ${inspection.year} ${inspection.make} ${inspection.model} ${inspection.trim}`.trim(),
      `VIN: ${inspection.vin}`,
      `Odometer: ${inspection.mileage.toLocaleString()} mi`,
      `Exterior: ${inspection.exteriorColor}`,
      `Source: ${inspection.sellerSource}`,
      "",
      `Condition Grade: ${grade ? `${grade.grade} (${grade.score}/100)` : "Not graded"}`,
      `Estimated Reconditioning: ${estimateLabel}`,
      "",
      "Confirmed Damage",
      ...damageLines,
      "",
      "Reviewer Disclosure",
      report.reportBody,
      "",
      `Report Version: ${report.version}`,
      `Finalized: ${report.finalizedAt ? new Date(report.finalizedAt).toLocaleString("en-US") : "Not finalized"}`
    ].join("\n");
    return {
      filename: `${inspection.vin}-condition-report.txt`,
      body
    };
  }

  patchReport(reportId: string, reportBody: string, actor: Actor): FinalReport {
    const report = this.getFinalReport(reportId);
    if (report.finalizedAt) throw conflict("Finalized reports cannot be edited.");
    report.reportBody = reportBody;
    report.version += 1;
    this.addAudit(report.inspectionId, actor, "report.edited", { reportId, version: report.version });
    return report;
  }

  finalizeReport(reportId: string, actor: Actor): FinalReport {
    const report = this.getFinalReport(reportId);
    const inspection = this.getInspection(report.inspectionId);
    if (report.finalizedAt) return report;
    if (inspection.completenessPercentage < 100) {
      throw conflict("Cannot finalize until required photo evidence is complete.", {
        completenessPercentage: inspection.completenessPercentage
      });
    }
    const blockers = this.readinessIssues(inspection.id).filter((issue) =>
      issue.severity === "blocker" && issue.type !== "final_report_missing"
    );
    if (blockers.length > 0) {
      throw conflict("Cannot finalize until buyer-visible release blockers are resolved.", { blockers });
    }
    if (!canTransition(inspection.status, "FINALIZED")) {
      throw conflict(`Cannot finalize from status ${inspection.status}.`);
    }
    report.finalizedAt = now();
    report.finalizedBy = actor.id;
    this.transition(inspection.id, "FINALIZED", actor, "inspection.status_changed");
    this.addAudit(inspection.id, actor, "report.finalized", { reportId, version: report.version });
    return report;
  }

  auditForInspection(inspectionId: string): AuditEvent[] {
    this.getInspection(inspectionId);
    return [...this.auditEvents.values()]
      .filter((event) => event.inspectionId === inspectionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addAudit(inspectionId: string, actor: Actor, eventType: string, detailsJson: unknown): AuditEvent {
    if (!this.users.has(actor.id)) {
      this.addUser({ id: actor.id, name: actor.name, role: actor.role });
    }
    const event: AuditEvent = {
      id: id(),
      inspectionId,
      actor: `${actor.name} (${actor.role})`,
      eventType,
      detailsJson,
      createdAt: now()
    };
    this.auditEvents.set(event.id, event);
    return event;
  }

  operationalMetrics(): OperationalMetric[] {
    const inspections = [...this.inspections.values()];
    const analyses = [...this.analyses.values()];
    const imageJobs = [...this.imageAnalysisJobs.values()];
    const suggestions = [...this.suggestions.values()];
    const grades = [...this.conditionGrades.values()];
    const reports = [...this.finalReports.values()];

    const completedAnalysisRows = analyses.filter((analysis) => analysis.status === "completed");
    const completedAnalyses = completedAnalysisRows.length;
    const failedAnalyses = analyses.filter((analysis) => analysis.status === "failed").length;
    const analysisRate = rateValue(completedAnalyses, analyses.length, 1);
    const retakeRequiredAnalyses = completedAnalysisRows.filter(analysisRequiresRetake).length;
    const retakeRate = rateValue(retakeRequiredAnalyses, completedAnalyses, 0);

    const totalRequiredAngles = inspections.length * requiredPhotoAngles.length;
    const missingRequiredAngles = inspections.reduce((total, inspection) => total + this.missingRequiredEvidence(inspection.id).length, 0);
    const missingRate = rateValue(missingRequiredAngles, totalRequiredAngles, 0);

    const reviewRequired = suggestions.filter((suggestion) => suggestion.status === "pending" || suggestion.status === "edited").length;
    const reviewRate = rateValue(reviewRequired, suggestions.length, 0);

    const gradeLatencies = grades
      .map((grade) => {
        const inspection = this.inspections.get(grade.inspectionId);
        if (!inspection) return null;
        const latencyMs = new Date(grade.createdAt).getTime() - new Date(inspection.createdAt).getTime();
        return latencyMs >= 0 ? latencyMs / 60_000 : null;
      })
      .filter((value): value is number => value !== null);
    const averageGradeLatency = gradeLatencies.length > 0
      ? gradeLatencies.reduce((sum, value) => sum + value, 0) / gradeLatencies.length
      : null;

    const finalizedReports = reports.filter((report) => report.finalizedAt).length;
    const finalizationRate = rateValue(finalizedReports, reports.length, 0);
    const reviewedSuggestions = suggestions.filter((suggestion) => suggestion.status === "accepted" || suggestion.status === "rejected");
    const acceptedSuggestions = reviewedSuggestions.filter((suggestion) => suggestion.status === "accepted").length;
    const acceptanceRate = rateValue(acceptedSuggestions, reviewedSuggestions.length, 0);
    const finishedImageJobs = imageJobs.filter((job) => job.status === "completed" || job.status === "failed" || job.status === "dead_letter");
    const queueLatencies = finishedImageJobs
      .map((job) => {
        const end = job.completedAt ?? job.updatedAt;
        const latencyMs = new Date(end).getTime() - new Date(job.queuedAt).getTime();
        return latencyMs >= 0 ? latencyMs / 1000 : null;
      })
      .filter((value): value is number => value !== null);
    const averageQueueLatency = queueLatencies.length > 0
      ? queueLatencies.reduce((sum, value) => sum + value, 0) / queueLatencies.length
      : null;
    const buyerReadyInspections = inspections.filter((inspection) => this.buyerVisibleReady(inspection.id)).length;
    const buyerReadyRate = rateValue(buyerReadyInspections, inspections.length, 0);

    return [
      {
        metric: "image_analysis_success_rate",
        label: "Image analysis success",
        value: percentLabel(completedAnalyses, analyses.length, 100),
        status: analysisRate >= 0.98 ? "healthy" : analysisRate >= 0.9 ? "watch" : "blocked",
        evidence: `${completedAnalyses} completed, ${failedAnalyses} failed analyses.`
      },
      {
        metric: "image_quality_retake_rate",
        label: "Image retake rate",
        value: percentLabel(retakeRequiredAnalyses, completedAnalyses, 0),
        status: retakeRate <= 0.08 ? "healthy" : retakeRate <= 0.2 ? "watch" : "blocked",
        evidence: `${retakeRequiredAnalyses} completed analyses require image retake before buyer-visible release.`
      },
      {
        metric: "image_analysis_queue_latency",
        label: "Image queue latency",
        value: averageQueueLatency === null ? "No jobs yet" : averageQueueLatency < 1 ? "<1 sec" : `${Math.round(averageQueueLatency)} sec`,
        status: averageQueueLatency === null || averageQueueLatency <= 30 ? "healthy" : averageQueueLatency <= 120 ? "watch" : "blocked",
        evidence: `${finishedImageJobs.length} image-analysis jobs completed or exited.`
      },
      {
        metric: "missing_required_angle_rate",
        label: "Missing required angle rate",
        value: percentLabel(missingRequiredAngles, totalRequiredAngles, 0),
        status: missingRate <= 0.1 ? "healthy" : missingRate <= 0.35 ? "watch" : "blocked",
        evidence: `${missingRequiredAngles} missing angles across ${inspections.length} active inspections.`
      },
      {
        metric: "human_review_rate",
        label: "Human review rate",
        value: percentLabel(reviewRequired, suggestions.length, 0),
        status: reviewRate <= 0.45 ? "healthy" : reviewRate <= 0.75 ? "watch" : "blocked",
        evidence: `${reviewRequired} suggestions still need accept, edit, or reject decisions.`
      },
      {
        metric: "grade_generation_latency",
        label: "Grade generation latency",
        value: formatLatency(averageGradeLatency),
        status: averageGradeLatency === null || averageGradeLatency <= 15 ? "healthy" : averageGradeLatency <= 60 ? "watch" : "blocked",
        evidence: `${grades.length} deterministic grade calculations recorded.`
      },
      {
        metric: "report_finalization_rate",
        label: "Report finalization rate",
        value: percentLabel(finalizedReports, reports.length, 0),
        status: reports.length === 0 || finalizationRate >= 0.8 ? "healthy" : finalizationRate >= 0.5 ? "watch" : "blocked",
        evidence: `${finalizedReports} finalized reports out of ${reports.length} generated report records.`
      },
      {
        metric: "suggestion_acceptance_rate",
        label: "Suggestion acceptance rate",
        value: percentLabel(acceptedSuggestions, reviewedSuggestions.length, 0),
        status: reviewedSuggestions.length === 0 || acceptanceRate >= 0.65 ? "healthy" : acceptanceRate >= 0.45 ? "watch" : "blocked",
        evidence: `${acceptedSuggestions} accepted decisions out of ${reviewedSuggestions.length} reviewed suggestions.`
      },
      {
        metric: "buyer_visible_ready_rate",
        label: "Buyer-visible ready",
        value: percentLabel(buyerReadyInspections, inspections.length, 0),
        status: buyerReadyRate >= 0.7 ? "healthy" : buyerReadyRate >= 0.35 ? "watch" : "blocked",
        evidence: `${buyerReadyInspections} inspections clear all buyer-visible readiness blockers.`
      }
    ];
  }

  bundle(inspectionId: string): InspectionBundle {
    return {
      inspection: this.getInspection(inspectionId),
      photos: this.listPhotos(inspectionId),
      imageAnalysisJobs: this.imageAnalysisJobsForInspection(inspectionId),
      suggestions: this.listSuggestions(inspectionId),
      damageItems: this.listDamage(inspectionId),
      conditionGrade: this.latestGrade(inspectionId),
      aiReportJob: this.latestReportJob(inspectionId),
      aiReportDraft: this.latestReportDraft(inspectionId),
      finalReport: this.latestFinalReport(inspectionId),
      auditEvents: this.auditForInspection(inspectionId),
      readinessIssues: this.readinessIssues(inspectionId),
      buyerVisibleReady: this.buyerVisibleReady(inspectionId)
    };
  }

  readinessIssues(inspectionId: string): ReadinessIssue[] {
    const inspection = this.getInspection(inspectionId);
    const suggestions = this.listSuggestions(inspectionId);
    const photos = this.listPhotos(inspectionId);
    const damageItems = this.listDamage(inspectionId);
    const issues: ReadinessIssue[] = [];
    for (const angle of this.missingRequiredEvidence(inspectionId)) {
      issues.push({
        type: "missing_required_angle",
        severity: "blocker",
        label: `Missing ${angle.replaceAll("_", " ")} angle`,
        detail: "Required photo evidence has not been human-confirmed.",
        action: "Capture or accept a photo-angle suggestion."
      });
    }
    const failedPhotos = photos.filter((photo) => photo.analysisStatus === "failed" || photo.qualityStatus === "fail");
    for (const photo of failedPhotos) {
      issues.push({
        type: "image_analysis_failed",
        severity: "blocker",
        label: `Image analysis failed for ${photo.originalFilename}`,
        detail: "The photo cannot support buyer-facing condition data until analysis succeeds or the image is replaced.",
        action: "Retry analysis or request a retake."
      });
    }
    const qualityWarnings = suggestions.filter((suggestion) =>
      suggestion.suggestionType === "quality_warning" &&
      (suggestion.status === "pending" || suggestion.status === "edited")
    );
    for (const suggestion of qualityWarnings) {
      issues.push({
        type: "image_quality_retake",
        severity: "blocker",
        label: "Image quality needs review",
        detail: suggestion.explanation,
        action: "Accept the retake requirement, reject it with reviewer rationale, or replace the image."
      });
    }
    const unreviewed = suggestions.filter((suggestion) =>
      suggestion.suggestionType !== "quality_warning" &&
      (suggestion.status === "pending" || suggestion.status === "edited")
    );
    if (unreviewed.length > 0) {
      issues.push({
        type: "unreviewed_ai_suggestion",
        severity: "blocker",
        label: `${unreviewed.length} AI suggestion${unreviewed.length === 1 ? "" : "s"} need review`,
        detail: "AI findings are advisory and must be accepted, edited, or rejected before release.",
        action: "Complete the human review queue."
      });
    }
    if (!this.latestGrade(inspectionId)) {
      issues.push({
        type: "condition_grade_missing",
        severity: "blocker",
        label: "Condition grade missing",
        detail: "The condition report does not have a deterministic grade.",
        action: "Run the Java grading service after evidence is complete."
      });
    }
    const estimateMissing = damageItems.some((item) => {
      const estimate = estimateDamageRepairCost(item.damageType, item.severity);
      return estimate.min === 0 && estimate.max === 0;
    });
    if (estimateMissing) {
      issues.push({
        type: "repair_estimate_missing",
        severity: "watch",
        label: "Repair estimate needs estimator review",
        detail: "At least one confirmed damage item has unknown type or severity.",
        action: "Classify the damage item or add estimator notes."
      });
    }
    if (damageItems.some((item) => item.severity === "severe")) {
      issues.push({
        type: "high_arbitration_risk",
        severity: "watch",
        label: "High arbitration risk",
        detail: "Severe confirmed damage should be explicit in buyer disclosures.",
        action: "Verify photos, notes, and report disclosure before release."
      });
    }
    const report = this.latestFinalReport(inspectionId);
    if (!report?.finalizedAt) {
      issues.push({
        type: "final_report_missing",
        severity: "blocker",
        label: "Final report not released",
        detail: `Current inspection status is ${inspection.status}.`,
        action: "Generate, review, and finalize the buyer-ready condition report."
      });
    }
    return issues;
  }

  buyerVisibleReady(inspectionId: string): boolean {
    return this.readinessIssues(inspectionId).every((issue) => issue.severity !== "blocker");
  }

  missingRequiredEvidence(inspectionId: string): string[] {
    const acceptedAngles = new Set<PhotoAngle>();
    for (const suggestion of this.listSuggestions(inspectionId)) {
      if (suggestion.status === "accepted" && suggestion.suggestionType === "photo_angle") {
        const parsed = PhotoAngleSuggestionSchema.safeParse(suggestion.suggestedValueJson);
        if (parsed.success) acceptedAngles.add(parsed.data.photoAngle);
      }
    }
    return requiredPhotoAngles.filter((angle) => !acceptedAngles.has(angle));
  }

  recomputeCompleteness(inspectionId: string, actor: Actor): number {
    const inspection = this.getInspection(inspectionId);
    const missing = this.missingRequiredEvidence(inspectionId);
    const complete = requiredPhotoAngles.length - missing.length;
    inspection.completenessPercentage = Math.round((complete / requiredPhotoAngles.length) * 100);
    inspection.updatedAt = now();
    if (inspection.status === "DRAFT" && inspection.completenessPercentage === 100) {
      this.transition(inspectionId, "READY_FOR_GRADING", actor, "inspection.ready_for_grading");
    } else if (inspection.status === "DRAFT") {
      this.transition(inspectionId, "NEEDS_PHOTOS", actor, "inspection.needs_photos");
    } else if (inspection.status === "NEEDS_PHOTOS" && inspection.completenessPercentage === 100) {
      this.transition(inspectionId, "READY_FOR_GRADING", actor, "inspection.ready_for_grading");
    }
    return inspection.completenessPercentage;
  }

  private maybeProgressFromDraft(inspectionId: string, actor: Actor): void {
    const inspection = this.getInspection(inspectionId);
    if (inspection.status === "DRAFT") {
      this.transition(inspectionId, "NEEDS_PHOTOS", actor, "inspection.needs_photos");
    }
  }
}

export const store = new MemoryStore();
