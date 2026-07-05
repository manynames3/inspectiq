import type { ImageAnalysisJobStatus, ImageUploadStatus, InspectionStatus, ReadinessIssue, UserRole } from "@inspectiq/shared";

export type Actor = {
  id: string;
  name: string;
  role: UserRole;
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
  updatedAt: string;
  finalizedAt: string | null;
  conditionGrade?: ConditionGrade | null;
  humanReviewFlag?: boolean;
  buyerVisibleReady?: boolean;
  readinessIssueCount?: number;
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
  uploadStatus: ImageUploadStatus;
  declaredAngle: string | null;
  detectedAngle: string | null;
  detectedAngleConfidence: number | null;
  qualityStatus: string;
  analysisStatus: string;
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

export type VisionSuggestion = {
  id: string;
  inspectionId: string;
  photoId: string;
  suggestionType: string;
  suggestedValueJson: any;
  confidence: number;
  explanation: string;
  status: string;
  assignedToRole?: Extract<UserRole, "inspector" | "reviewer"> | null;
  assignedToUserId?: string | null;
  dueAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  resolvedAt?: string | null;
  createdAt?: string;
};

export type DamageItem = {
  id: string;
  inspectionId: string;
  photoId: string | null;
  location: string;
  damageType: string;
  severity: string;
  notes: string;
  source: string;
};

export type ConditionGrade = {
  id: string;
  score: number;
  grade: string;
  explanationJson: any;
  gradingVersion: string;
};

export type FinalReport = {
  id: string;
  reportBody: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  version: number;
};

export type AuditEvent = {
  id: string;
  actor: string;
  eventType: string;
  detailsJson: any;
  createdAt: string;
};

export type InspectionBundle = {
  inspection: Inspection;
  photos: VehiclePhoto[];
  imageAnalysisJobs: ImageAnalysisJob[];
  suggestions: VisionSuggestion[];
  damageItems: DamageItem[];
  conditionGrade: ConditionGrade | null;
  aiReportJob: any;
  aiReportDraft: any;
  finalReport: FinalReport | null;
  auditEvents: AuditEvent[];
  readinessIssues: ReadinessIssue[];
  buyerVisibleReady: boolean;
};

export type SampleImage = {
  key: string;
  filename: string;
  label: string;
  angle: string;
  mimeType: string;
};
