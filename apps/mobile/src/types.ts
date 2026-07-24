import type {
  DamageSeverity,
  DamageType,
  InspectionStatus,
  ReadinessIssue,
  RequiredPhotoAngle,
  UserRole
} from "@inspectiq/shared";

export type Actor = { id: string; name: string; role: UserRole };

export type MobileSession = {
  mode: "oidc" | "evaluation";
  actor: Actor;
  idToken: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;
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
  assignedToUserId: string | null;
  version: number;
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
  originalFilename: string;
  mimeType: string;
  uploadStatus: string;
  declaredAngle: RequiredPhotoAngle | null;
  detectedAngle: string | null;
  detectedAngleConfidence: number | null;
  qualityStatus: string;
  analysisStatus: string;
  operationId?: string | null;
  captureSource?: "web" | "mobile" | "reference";
};

export type PhotoAnalysisResult = {
  id: string;
  photoId: string;
  provider: string;
  modelId: string | null;
  confidence: number;
  status: string;
  createdAt: string;
};

export type VisionSuggestion = {
  id: string;
  inspectionId: string;
  photoId: string;
  suggestionType: "photo_angle" | "damage_candidate" | "quality_warning" | "extracted_text";
  suggestedValueJson: Record<string, unknown>;
  confidence: number;
  explanation: string;
  status: "pending" | "accepted" | "rejected" | "edited";
  assignedToRole: "inspector" | "reviewer" | null;
  assignedToUserId: string | null;
  dueAt: string | null;
  version: number;
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
  source: string;
};

export type FinalReport = {
  id: string;
  inspectionId: string;
  reportBody: string;
  approvalStatus: "draft" | "in_review" | "approved" | "finalized";
  reviewerComment: string;
  approvedBy: string | null;
  approvedAt: string | null;
  finalizedBy: string | null;
  finalizedAt: string | null;
  version: number;
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
  inspectionId: string;
  actor: string;
  eventType: string;
  detailsJson: Record<string, unknown>;
  createdAt: string;
};

export type InspectionBundle = {
  inspection: Inspection;
  photos: VehiclePhoto[];
  photoAnalysisResults?: PhotoAnalysisResult[];
  suggestions: VisionSuggestion[];
  damageItems: DamageItem[];
  conditionGrade: {
    id: string;
    inspectionId: string;
    suggestedGrade: number;
    approvedGrade: number | null;
    conditionGradeBeforeRecon: number;
    estimatedGradeAfterRecon: number;
    reviewedBy: string | null;
    overrideReason: string | null;
    evidenceBlockers: string[];
    explanationJson: unknown;
    gradingVersion: string;
    version: number;
  } | null;
  aiReportJob: { id: string; status: string; errorMessage: string | null } | null;
  aiReportDraft: { id: string; confidence: number; humanReviewRequired: boolean } | null;
  finalReport: FinalReport | null;
  auditEvents: AuditEvent[];
  readinessIssues: ReadinessIssue[];
  buyerVisibleReady: boolean;
};

export type MobileBootstrap = {
  actor: Actor;
  permissions: string[];
  requiredPhotoAngles: RequiredPhotoAngle[];
  cursor: string;
  inspections: InspectionBundle[];
};

export type CaptureQuality = {
  width: number;
  height: number;
  brightness: number;
  sharpness: number;
  resolutionOk: boolean;
  exposureStatus: "good" | "dark" | "bright";
  blurStatus: "good" | "review";
  retakeRequired: boolean;
  guidance: string[];
};

export type UploadOperation = {
  id: string;
  inspectionId: string;
  declaredAngle: RequiredPhotoAngle;
  fileUri: string;
  checksumSha256: string;
  byteSize: number;
  width: number;
  height: number;
  quality: CaptureQuality;
  status: "queued" | "uploading" | "confirming" | "uploaded" | "failed" | "blocked";
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  uploadedPhotoId: string | null;
};
