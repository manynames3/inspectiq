import type {
  ApprovalMode,
  AuthorizationSource,
  ImageAnalysisJobStatus,
  ImageUploadStatus,
  InspectionStatus,
  InspectionType,
  InspectionWorkflowStatus,
  QualityControlStatus,
  ReadinessIssue,
  ReconAuthorizationStatus,
  SaleReadinessBlocker,
  SaleReadinessStatus,
  ServiceType,
  UrgencyAssessment,
  UserRole,
  WorkOrderStatus
} from "@inspectiq/shared";

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
  inspectionId: string;
  suggestedGrade: number;
  approvedGrade: number | null;
  conditionGradeBeforeRecon: number;
  estimatedGradeAfterRecon: number;
  reviewedBy: string | null;
  overrideReason: string | null;
  evidenceBlockers: string[];
  explanationJson: any;
  gradingVersion: string;
  version: number;
  createdAt: string;
  reviewedAt: string | null;
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

export type ConsignorAccount = {
  id: string;
  name: string;
  accountType: string;
  authorizedUserIds: string[];
};

export type ReconPolicy = {
  id: string;
  consignorAccountId: string;
  name: string;
  approvalMode: ApprovalMode;
  totalVehicleLimit: number;
  serviceRules: Partial<Record<ServiceType, { enabled: boolean; automaticApprovalLimit: number }>>;
  costOverrunTolerance: number;
  version: number;
};

export type VehicleIntake = {
  id: string;
  inspectionId: string;
  consignorAccountId: string;
  facility: string;
  yardZone: string;
  parkingSpace: string;
  lastLocationTimestamp: string;
  inspectionType: InspectionType;
  inspectionWorkflowStatus: InspectionWorkflowStatus;
};

export type SaleAssignment = {
  id: string;
  inspectionId: string;
  saleDateTime: string;
  lane: string;
  runNumber: string;
  saleEventId: string | null;
  status: SaleReadinessStatus;
};

export type ReconRecommendation = {
  id: string;
  inspectionId: string;
  damageItemId: string | null;
  serviceType: ServiceType;
  recommendedAction: string;
  estimatedCost: number;
  estimatedDurationHours: number;
  expectedGradeLift: number;
  estimateCreatorId: string;
  supportingPhotoIds: string[];
  notes: string;
  status: string;
  version: number;
};

export type ReconAuthorization = {
  id: string;
  inspectionId: string;
  recommendationId: string;
  decision: "PENDING" | "AUTHORIZED" | "DECLINED" | "REVISION_REQUESTED";
  authorizedAmount: number;
  authorizationSource: AuthorizationSource | null;
  consignorUserId: string | null;
  decisionReason: string;
  decisionTimestamp: string | null;
  version: number;
};

export type WorkOrderTask = {
  id: string;
  workOrderId: string;
  recommendationId: string;
  description: string;
  authorizedAmount: number;
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
};

export type QualityControlResult = {
  id: string;
  workOrderId: string;
  status: QualityControlStatus;
  notes: string;
  inspectedByUserId: string;
  inspectedAt: string;
};

export type WorkOrder = {
  id: string;
  workOrderNumber: string;
  inspectionId: string;
  facility: string;
  serviceDepartment: ServiceType;
  authorizedAmount: number;
  currentEstimatedCost: number;
  actualCost: number | null;
  assignedTechnician: string | null;
  instructions: string;
  saleDeadline: string;
  status: WorkOrderStatus;
  blockedReason: string | null;
  version: number;
  tasks: WorkOrderTask[];
  qualityControl: QualityControlResult | null;
};

export type SaleReadinessAssessment = {
  id: string;
  inspectionId: string;
  saleReady: boolean;
  status: SaleReadinessStatus;
  blockers: SaleReadinessBlocker[];
  assessedByUserId: string;
  assessedAt: string;
};

export type ReconOperationsRecord = {
  inspection: Inspection;
  intake: VehicleIntake;
  consignor: ConsignorAccount;
  saleAssignment: SaleAssignment;
  conditionGrade: ConditionGrade | null;
  conditionReport: FinalReport | null;
  damageItems: DamageItem[];
  photos: VehiclePhoto[];
  policy: ReconPolicy | null;
  recommendations: ReconRecommendation[];
  authorizations: ReconAuthorization[];
  workOrders: WorkOrder[];
  reconStatus: ReconAuthorizationStatus;
  urgency: UrgencyAssessment;
  readiness: SaleReadinessAssessment;
  totals: {
    recommendedCost: number;
    automaticallyAuthorizedCost: number;
    manuallyAuthorizedCost: number;
    declinedCost: number;
    pendingCost: number;
    remainingAccountAuthorization: number;
  };
  estimatedCompletion: string | null;
};
