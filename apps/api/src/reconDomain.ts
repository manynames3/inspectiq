import type {
  ApprovalMode,
  AuthorizationSource,
  InspectionType,
  InspectionWorkflowStatus,
  QualityControlStatus,
  ReconAuthorizationPolicyInput,
  ReconAuthorizationStatus,
  RecommendationStatus,
  SaleReadinessBlocker,
  SaleReadinessStatus,
  ServiceType,
  UrgencyAssessment,
  WorkOrderStatus
} from "@inspectiq/shared";
import type { ConditionGrade, DamageItem, FinalReport, Inspection, VehiclePhoto } from "./domain.js";

export type ConsignorAccount = {
  id: string;
  name: string;
  accountType: "DEALERSHIP" | "FLEET" | "RENTAL" | "BANK" | "LEASING" | "OEM_PROGRAM";
  authorizedUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ReconAuthorizationPolicy = ReconAuthorizationPolicyInput & {
  id: string;
  consignorAccountId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
};

export type InspectionAssignment = {
  id: string;
  inspectionId: string;
  assignedToUserId: string;
  assignedByUserId: string;
  dueAt: string;
  status: "ASSIGNED" | "ACCEPTED" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
};

export type SaleAssignment = {
  id: string;
  inspectionId: string;
  saleDateTime: string;
  lane: string;
  runNumber: string;
  saleEventId: string | null;
  status: SaleReadinessStatus;
  createdAt: string;
  updatedAt: string;
};

export type VehicleLocationEvent = {
  id: string;
  inspectionId: string;
  facility: string;
  yardZone: string;
  parkingSpace: string;
  reason: string;
  actorId: string;
  createdAt: string;
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
  status: RecommendationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ReconAuthorization = {
  id: string;
  inspectionId: string;
  recommendationId: string;
  decision: "PENDING" | "AUTHORIZED" | "DECLINED" | "REVISION_REQUESTED";
  authorizedAmount: number;
  authorizationSource: AuthorizationSource | null;
  consignorUserId: string | null;
  policySnapshot: (ReconAuthorizationPolicyInput & { policyId: string; policyVersion: number }) | null;
  decisionReason: string;
  decisionTimestamp: string | null;
  expiresAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type WorkOrderTask = {
  id: string;
  workOrderId: string;
  recommendationId: string;
  description: string;
  authorizedAmount: number;
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
};

export type QualityControlResult = {
  id: string;
  workOrderId: string;
  status: QualityControlStatus;
  notes: string;
  inspectedByUserId: string;
  inspectedAt: string;
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
  conditionGradePreview: {
    value: number;
    status: "APPROVED" | "PRELIMINARY";
    evidenceBlockers: string[];
  } | null;
  conditionReport: FinalReport | null;
  damageItems: DamageItem[];
  photos: VehiclePhoto[];
  policy: ReconAuthorizationPolicy | null;
  recommendations: ReconRecommendation[];
  authorizations: ReconAuthorization[];
  workOrders: Array<WorkOrder & { tasks: WorkOrderTask[]; qualityControl: QualityControlResult | null }>;
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

export type PolicyDecisionContext = {
  policy: ReconAuthorizationPolicy;
  recommendation: ReconRecommendation;
  alreadyAuthorizedCost: number;
  approvalMode: ApprovalMode;
};
