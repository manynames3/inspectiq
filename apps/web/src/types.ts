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
  assignedToUserId?: string | null;
  version?: number;
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
  sourceName: string | null;
  sourceUrl: string | null;
  sourceLicense: string | null;
  uploadStatus: ImageUploadStatus;
  declaredAngle: string | null;
  detectedAngle: string | null;
  detectedAngleConfidence: number | null;
  qualityStatus: string;
  analysisStatus: string;
  captureSource?: "web" | "mobile" | "reference";
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
  confidence: number;
  status: string;
  errorMessage: string | null;
  modelId: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  schemaValid: boolean;
  fallbackUsed: boolean;
  failureCategory: string | null;
  createdAt: string;
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
  version: number;
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

export type IdentityVerification = {
  id: string;
  inspectionId: string;
  photoId: string;
  field: "vin" | "odometer";
  value: string;
  sourceSuggestionId: string;
  verifiedBy: string;
  verifiedAt: string;
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
  inspectionId?: string;
  reportBody: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  version: number;
  approvalStatus: "draft" | "in_review" | "approved" | "finalized";
  reviewerComment: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type ReportVersion = {
  id: string;
  reportId: string;
  inspectionId: string;
  version: number;
  reportBody: string;
  approvalStatus: FinalReport["approvalStatus"];
  reviewerComment: string;
  changedBy: string;
  changeType: "generated" | "edited" | "approved" | "finalized";
  createdAt: string;
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
  photoAnalysisResults?: PhotoAnalysisResult[];
  imageAnalysisJobs: ImageAnalysisJob[];
  suggestions: VisionSuggestion[];
  damageItems: DamageItem[];
  identityVerifications?: IdentityVerification[];
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
  storageKey?: string;
  label: string;
  angle: string;
  mimeType: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceLicense?: string;
};

export type SamplePhotoSet = {
  key: string;
  label: string;
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string;
  };
  sampleKeys: string[];
};
