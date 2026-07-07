import type {
  DamageSeverity,
  DamageType,
  ImageAnalysisJobStatus,
  ImageUploadStatus,
  InspectionStatus,
  PhotoAngle,
  ReadinessIssue,
  SuggestionStatus,
  UserRole
} from "@inspectiq/shared";

export type Actor = {
  id: string;
  name: string;
  role: UserRole;
};

export type User = {
  id: string;
  name: string;
  role: UserRole;
  createdAt: string;
};

export type Inspection = {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  mileage: number;
  exteriorColor: string;
  sellerSource: string;
  inspectorName: string;
  status: InspectionStatus;
  completenessPercentage: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};

export type VehiclePhoto = {
  id: string;
  inspectionId: string;
  storageKey: string;
  objectBucket: string | null;
  objectKey: string | null;
  thumbnailStorageKey: string | null;
  byteSize: number | null;
  checksumSha256: string | null;
  originalFilename: string;
  mimeType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceLicense: string | null;
  uploadedBy: string;
  uploadedAt: string;
  uploadStatus: ImageUploadStatus;
  declaredAngle: PhotoAngle | null;
  detectedAngle: PhotoAngle | null;
  detectedAngleConfidence: number | null;
  qualityStatus: "unknown" | "ok" | "warning" | "fail";
  analysisStatus: "not_analyzed" | "pending" | "completed" | "failed";
};

export type ImageAnalysisJob = {
  id: string;
  inspectionId: string;
  photoId: string;
  status: ImageAnalysisJobStatus;
  idempotencyKey: string | null;
  attempts: number;
  errorMessage: string | null;
  queuedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type PhotoAnalysisResult = {
  id: string;
  photoId: string;
  provider: string;
  promptVersion: string;
  rawModelOutputJson: unknown;
  validatedOutputJson: unknown;
  confidence: number;
  status: "completed" | "failed";
  errorMessage: string | null;
  createdAt: string;
};

export type VisionSuggestion = {
  id: string;
  inspectionId: string;
  photoId: string;
  suggestionType: "photo_angle" | "quality_warning" | "damage_candidate" | "extracted_text";
  suggestedValueJson: unknown;
  confidence: number;
  explanation: string;
  status: SuggestionStatus;
  assignedToRole: Extract<UserRole, "inspector" | "reviewer">;
  assignedToUserId: string | null;
  dueAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type DamageItem = {
  id: string;
  inspectionId: string;
  photoId: string | null;
  location: string;
  damageType: DamageType;
  severity: DamageSeverity;
  notes: string;
  source: "manual" | "vision_suggestion";
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConditionGrade = {
  id: string;
  inspectionId: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  explanationJson: unknown;
  gradingVersion: string;
  createdAt: string;
};

export type AiReportJob = {
  id: string;
  inspectionId: string;
  status: "pending" | "running" | "completed" | "failed";
  idempotencyKey: string | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

export type AiReportDraft = {
  id: string;
  inspectionId: string;
  jobId: string;
  provider: string;
  promptVersion: string;
  inputSummaryJson: unknown;
  outputJson: unknown;
  confidence: number;
  humanReviewRequired: boolean;
  validationStatus: "valid" | "invalid";
  createdAt: string;
};

export type FinalReport = {
  id: string;
  inspectionId: string;
  reportBody: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  version: number;
};

export type AuditEvent = {
  id: string;
  inspectionId: string;
  actor: string;
  eventType: string;
  detailsJson: unknown;
  createdAt: string;
};

export type InspectionBundle = {
  inspection: Inspection;
  photos: VehiclePhoto[];
  photoAnalysisResults: PhotoAnalysisResult[];
  imageAnalysisJobs: ImageAnalysisJob[];
  suggestions: VisionSuggestion[];
  damageItems: DamageItem[];
  conditionGrade: ConditionGrade | null;
  aiReportJob: AiReportJob | null;
  aiReportDraft: AiReportDraft | null;
  finalReport: FinalReport | null;
  auditEvents: AuditEvent[];
  readinessIssues: ReadinessIssue[];
  buyerVisibleReady: boolean;
};

export type OperationalMetric = {
  metric: string;
  label: string;
  value: string;
  status: "healthy" | "watch" | "blocked";
  evidence: string;
};
