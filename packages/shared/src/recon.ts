import { z } from "zod";

export const inspectionWorkflowStatuses = [
  "ASSIGNED",
  "CAPTURE_IN_PROGRESS",
  "REVIEW_READY",
  "RETAKE_REQUIRED",
  "CR_PUBLISHED"
] as const;

export const reconAuthorizationStatuses = [
  "ESTIMATE_PENDING",
  "AUTHORIZATION_PENDING",
  "AUTHORIZED",
  "PARTIALLY_AUTHORIZED",
  "DECLINED",
  "REAUTHORIZATION_REQUIRED"
] as const;

export const workOrderStatuses = [
  "QUEUED",
  "IN_PROGRESS",
  "BLOCKED",
  "QC_REQUIRED",
  "COMPLETED"
] as const;

export const qualityControlStatuses = ["PENDING", "PASSED", "FAILED"] as const;
export const saleReadinessStatuses = ["BLOCKED", "READY", "SCHEDULED"] as const;
export const approvalModes = ["MANUAL", "AUTO_APPROVE_UNDER_LIMIT", "MANAGED_PROGRAM", "NO_RECON"] as const;
export const serviceTypes = ["DETAIL", "MECHANICAL", "BODY", "TIRE", "GLASS", "THIRD_PARTY"] as const;
export const authorizationSources = [
  "CONSIGNOR_USER",
  "CONSIGNOR_POLICY",
  "MANAGED_PROGRAM_POLICY",
  "ADMINISTRATIVE_OVERRIDE"
] as const;
export const recommendationStatuses = [
  "DRAFT",
  "AUTHORIZATION_PENDING",
  "AUTHORIZED",
  "DECLINED",
  "REAUTHORIZATION_REQUIRED"
] as const;
export const inspectionTypes = ["VISUAL_CONDITION_REPORT", "MECHANICAL_CERTIFICATION", "POST_SALE"] as const;

export const InspectionWorkflowStatusSchema = z.enum(inspectionWorkflowStatuses);
export const ReconAuthorizationStatusSchema = z.enum(reconAuthorizationStatuses);
export const WorkOrderStatusSchema = z.enum(workOrderStatuses);
export const QualityControlStatusSchema = z.enum(qualityControlStatuses);
export const SaleReadinessStatusSchema = z.enum(saleReadinessStatuses);
export const ApprovalModeSchema = z.enum(approvalModes);
export const ServiceTypeSchema = z.enum(serviceTypes);
export const AuthorizationSourceSchema = z.enum(authorizationSources);
export const RecommendationStatusSchema = z.enum(recommendationStatuses);
export const InspectionTypeSchema = z.enum(inspectionTypes);

export type InspectionWorkflowStatus = z.infer<typeof InspectionWorkflowStatusSchema>;
export type ReconAuthorizationStatus = z.infer<typeof ReconAuthorizationStatusSchema>;
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;
export type QualityControlStatus = z.infer<typeof QualityControlStatusSchema>;
export type SaleReadinessStatus = z.infer<typeof SaleReadinessStatusSchema>;
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;
export type ServiceType = z.infer<typeof ServiceTypeSchema>;
export type AuthorizationSource = z.infer<typeof AuthorizationSourceSchema>;
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;
export type InspectionType = z.infer<typeof InspectionTypeSchema>;

export const ServiceAuthorizationRuleSchema = z.object({
  enabled: z.boolean(),
  automaticApprovalLimit: z.number().min(0)
}).strict();

export const ReconAuthorizationPolicyInputSchema = z.object({
  approvalMode: ApprovalModeSchema,
  totalVehicleLimit: z.number().min(0),
  serviceRules: z.object({
    DETAIL: ServiceAuthorizationRuleSchema.optional(),
    MECHANICAL: ServiceAuthorizationRuleSchema.optional(),
    BODY: ServiceAuthorizationRuleSchema.optional(),
    TIRE: ServiceAuthorizationRuleSchema.optional(),
    GLASS: ServiceAuthorizationRuleSchema.optional(),
    THIRD_PARTY: ServiceAuthorizationRuleSchema.optional()
  }).strict(),
  costOverrunTolerance: z.number().min(0)
}).strict();

export type ReconAuthorizationPolicyInput = z.infer<typeof ReconAuthorizationPolicyInputSchema>;

export const CreateConsignorAccountSchema = z.object({
  name: z.string().trim().min(1).max(160),
  accountType: z.enum(["DEALERSHIP", "FLEET", "RENTAL", "BANK", "LEASING", "OEM_PROGRAM"]),
  authorizedUserIds: z.array(z.string().trim().min(1).max(120)).default([])
});

export const CreateReconAuthorizationPolicySchema = ReconAuthorizationPolicyInputSchema.extend({
  consignorAccountId: z.string().uuid(),
  name: z.string().trim().min(1).max(160)
});

export const CreateVehicleIntakeSchema = z.object({
  inspectionId: z.string().uuid(),
  consignorAccountId: z.string().uuid(),
  facility: z.string().trim().min(1).max(120),
  yardZone: z.string().trim().min(1).max(40),
  parkingSpace: z.string().trim().min(1).max(40),
  saleDateTime: z.string().datetime(),
  lane: z.string().trim().min(1).max(40),
  runNumber: z.string().trim().min(1).max(40),
  saleEventId: z.string().trim().max(120).nullable().optional(),
  inspectionType: InspectionTypeSchema.default("VISUAL_CONDITION_REPORT")
});

export const CreateReconRecommendationSchema = z.object({
  damageItemId: z.string().uuid().nullable().optional(),
  serviceType: ServiceTypeSchema,
  recommendedAction: z.string().trim().min(1).max(500),
  estimatedCost: z.number().min(0).max(1_000_000),
  estimatedDurationHours: z.number().min(0.1).max(10_000),
  expectedGradeLift: z.number().min(0).max(5),
  supportingPhotoIds: z.array(z.string().uuid()).max(20).default([]),
  notes: z.string().trim().max(1000).default("")
});

export const SubmitReconEstimateSchema = z.object({
  recommendationIds: z.array(z.string().uuid()).min(1).max(100)
});

export const ConsignorDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "DECLINE", "REQUEST_REVISION"]),
  decisionReason: z.string().trim().min(1).max(1000),
  authorizedAmount: z.number().min(0).max(1_000_000).optional(),
  expectedVersion: z.number().int().min(1)
});

export const AdministrativeAuthorizationSchema = ConsignorDecisionSchema.extend({
  overrideReason: z.string().trim().min(10).max(1000)
});

export const WorkOrderUpdateSchema = z.object({
  action: z.enum([
    "ASSIGN_TECHNICIAN",
    "START",
    "BLOCK",
    "REVISE_ESTIMATE",
    "SEND_TO_QC",
    "COMPLETE"
  ]),
  assignedTechnician: z.string().trim().min(1).max(120).optional(),
  blockedReason: z.string().trim().min(1).max(1000).optional(),
  currentEstimatedCost: z.number().min(0).max(1_000_000).optional(),
  actualCost: z.number().min(0).max(1_000_000).optional(),
  expectedVersion: z.number().int().min(1)
});

export const QualityControlDecisionSchema = z.object({
  decision: z.enum(["PASS", "FAIL"]),
  notes: z.string().trim().min(1).max(1000),
  expectedVersion: z.number().int().min(1)
});

export const AssignInspectionSchema = z.object({
  assignedToUserId: z.string().trim().min(1).max(120),
  dueAt: z.string().datetime()
});

export const TransitionInspectionWorkflowSchema = z.object({
  nextStatus: InspectionWorkflowStatusSchema
});

export const VehicleLocationUpdateSchema = z.object({
  facility: z.string().trim().min(1).max(120),
  yardZone: z.string().trim().min(1).max(40),
  parkingSpace: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(300)
});

export const UrgencyAssessmentSchema = z.object({
  urgencyScore: z.number().int().min(1).max(5),
  urgencyClassification: z.enum(["LOW", "MEDIUM", "HIGH"]),
  urgencyReasons: z.array(z.string())
}).strict();

export type UrgencyAssessment = z.infer<typeof UrgencyAssessmentSchema>;

export type UrgencyInput = {
  hoursUntilSale: number;
  conditionReportPublished: boolean;
  missingRequiredEvidence: number;
  requiredRetakes: number;
  authorizationAwaitingDecision: boolean;
  approvedWorkOverdue: boolean;
  reauthorizationRequired: boolean;
  failedQualityControl: boolean;
  wrongFacilityLocation: boolean;
};

export function classifyUrgency(score: number): UrgencyAssessment["urgencyClassification"] {
  if (score >= 4) return "HIGH";
  if (score >= 2) return "MEDIUM";
  return "LOW";
}

export function calculateUrgency(input: UrgencyInput): UrgencyAssessment {
  let score = 1;
  const reasons: string[] = [];

  if (input.hoursUntilSale < 8) {
    score += 2;
    reasons.push("Sale begins in less than eight hours");
  } else if (input.hoursUntilSale < 24) {
    score += 1;
    reasons.push("Sale begins in less than twenty-four hours");
  }
  if (!input.conditionReportPublished) {
    score += 1;
    reasons.push("Condition report is not published");
  }
  if (input.missingRequiredEvidence > 0) {
    score += 1;
    reasons.push(`${input.missingRequiredEvidence} required evidence item${input.missingRequiredEvidence === 1 ? " is" : "s are"} missing`);
  }
  if (input.requiredRetakes > 0) {
    score += 1;
    reasons.push(`${input.requiredRetakes} photo retake${input.requiredRetakes === 1 ? " is" : "s are"} required`);
  }
  if (input.authorizationAwaitingDecision && input.hoursUntilSale < 24) {
    score += 1;
    reasons.push("Recon authorization is awaiting a decision near the sale deadline");
  }
  if (input.approvedWorkOverdue) {
    score += 2;
    reasons.push("Authorized recon work is overdue");
  }
  if (input.reauthorizationRequired) {
    score += 2;
    reasons.push("A revised estimate requires reauthorization");
  }
  if (input.failedQualityControl) {
    score += 2;
    reasons.push("Quality control failed");
  }
  if (input.wrongFacilityLocation) {
    score += 2;
    reasons.push("Vehicle is not in its expected facility location");
  }

  const urgencyScore = Math.max(1, Math.min(5, score));
  return {
    urgencyScore,
    urgencyClassification: classifyUrgency(urgencyScore),
    urgencyReasons: reasons
  };
}

export function countHighUrgency<T extends { urgency: UrgencyAssessment }>(items: T[]): number {
  let count = 0;
  for (const item of items) {
    if (item.urgency.urgencyScore >= 4) count += 1;
  }
  return count;
}

export function sortByUrgencyAndSaleDeadline<T extends { urgency: UrgencyAssessment; saleDateTime: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const urgencyDifference = right.urgency.urgencyScore - left.urgency.urgencyScore;
    if (urgencyDifference !== 0) return urgencyDifference;
    return new Date(left.saleDateTime).getTime() - new Date(right.saleDateTime).getTime();
  });
}

export type PolicyRecommendation = {
  serviceType: ServiceType;
  estimatedCost: number;
};

export type PolicyEvaluation = {
  decision: "AUTO_AUTHORIZED" | "MANUAL_REQUIRED" | "POLICY_DECLINED";
  authorizationSource: AuthorizationSource | null;
  reason: string;
  remainingVehicleLimit: number;
};

export function evaluateAuthorizationPolicy(
  policy: ReconAuthorizationPolicyInput,
  recommendation: PolicyRecommendation,
  alreadyAuthorizedCost: number
): PolicyEvaluation {
  const remainingVehicleLimit = Math.max(0, policy.totalVehicleLimit - alreadyAuthorizedCost);
  if (policy.approvalMode === "NO_RECON") {
    return {
      decision: "POLICY_DECLINED",
      authorizationSource: null,
      reason: "The consignor policy does not authorize recon work.",
      remainingVehicleLimit
    };
  }

  const serviceRule = policy.serviceRules[recommendation.serviceType];
  if (!serviceRule?.enabled) {
    return {
      decision: "MANUAL_REQUIRED",
      authorizationSource: null,
      reason: `${recommendation.serviceType} work is not enabled for automatic authorization.`,
      remainingVehicleLimit
    };
  }

  if (policy.approvalMode === "MANUAL") {
    return {
      decision: "MANUAL_REQUIRED",
      authorizationSource: null,
      reason: "The consignor policy requires a person to approve recon spending.",
      remainingVehicleLimit
    };
  }

  if (recommendation.estimatedCost > serviceRule.automaticApprovalLimit) {
    return {
      decision: "MANUAL_REQUIRED",
      authorizationSource: null,
      reason: `The estimate exceeds the ${recommendation.serviceType} automatic approval limit.`,
      remainingVehicleLimit
    };
  }

  if (recommendation.estimatedCost > remainingVehicleLimit) {
    return {
      decision: "MANUAL_REQUIRED",
      authorizationSource: null,
      reason: "The combined authorized work would exceed the vehicle authorization limit.",
      remainingVehicleLimit
    };
  }

  return {
    decision: "AUTO_AUTHORIZED",
    authorizationSource: policy.approvalMode === "MANAGED_PROGRAM"
      ? "MANAGED_PROGRAM_POLICY"
      : "CONSIGNOR_POLICY",
    reason: "The estimate is eligible under the snapshotted consignor authorization policy.",
    remainingVehicleLimit: remainingVehicleLimit - recommendation.estimatedCost
  };
}

export type ReconAmountItem = {
  estimatedCost: number;
  authorizationStatus: "PENDING" | "AUTHORIZED" | "DECLINED";
  authorizationSource: AuthorizationSource | null;
};

export function calculateReconTotals(items: ReconAmountItem[]): {
  recommendedCost: number;
  automaticallyAuthorizedCost: number;
  manuallyAuthorizedCost: number;
  declinedCost: number;
  pendingCost: number;
} {
  let recommendedCost = 0;
  let automaticallyAuthorizedCost = 0;
  let manuallyAuthorizedCost = 0;
  let declinedCost = 0;
  let pendingCost = 0;

  for (const item of items) {
    recommendedCost += item.estimatedCost;
    if (item.authorizationStatus === "DECLINED") {
      declinedCost += item.estimatedCost;
    } else if (item.authorizationStatus === "PENDING") {
      pendingCost += item.estimatedCost;
    } else if (item.authorizationSource === "CONSIGNOR_POLICY" || item.authorizationSource === "MANAGED_PROGRAM_POLICY") {
      automaticallyAuthorizedCost += item.estimatedCost;
    } else {
      manuallyAuthorizedCost += item.estimatedCost;
    }
  }

  return {
    recommendedCost,
    automaticallyAuthorizedCost,
    manuallyAuthorizedCost,
    declinedCost,
    pendingCost
  };
}

export function clampReferenceGrade(value: number): number {
  return Math.round(Math.max(0, Math.min(5, value)) * 10) / 10;
}

export function estimateGradeAfterAuthorizedRecon(
  conditionGradeBeforeRecon: number,
  items: Array<{ expectedGradeLift: number; authorizationStatus: "PENDING" | "AUTHORIZED" | "DECLINED"; qualityControlPassed?: boolean }>
): number {
  let projected = conditionGradeBeforeRecon;
  for (const item of items) {
    if (item.authorizationStatus === "AUTHORIZED") projected += item.expectedGradeLift;
  }
  return clampReferenceGrade(projected);
}

export const SaleReadinessBlockerSchema = z.object({
  code: z.enum([
    "INSPECTION_EVIDENCE_INCOMPLETE",
    "CONDITION_REPORT_NOT_PUBLISHED",
    "RECON_DECISION_PENDING",
    "RECON_WORK_INCOMPLETE",
    "REAUTHORIZATION_REQUIRED",
    "QUALITY_CONTROL_REQUIRED",
    "QUALITY_CONTROL_FAILED",
    "DISCLOSURE_INCOMPLETE",
    "BLOCKING_ISSUE"
  ]),
  message: z.string().trim().min(1)
});

export type SaleReadinessBlocker = z.infer<typeof SaleReadinessBlockerSchema>;

export type SaleReadinessInput = {
  requiredEvidenceComplete: boolean;
  conditionReportPublished: boolean;
  requiredReconDecisionsComplete: boolean;
  authorizedRequiredWorkComplete: boolean;
  reauthorizationRequired: boolean;
  qualityControlPassed: boolean;
  qualityControlFailed: boolean;
  disclosuresComplete: boolean;
  otherBlockingIssues: string[];
};

export function assessSaleReadiness(input: SaleReadinessInput): {
  saleReady: boolean;
  status: SaleReadinessStatus;
  blockers: SaleReadinessBlocker[];
} {
  const blockers: SaleReadinessBlocker[] = [];
  if (!input.requiredEvidenceComplete) {
    blockers.push({ code: "INSPECTION_EVIDENCE_INCOMPLETE", message: "Required inspection evidence is incomplete" });
  }
  if (!input.conditionReportPublished) {
    blockers.push({ code: "CONDITION_REPORT_NOT_PUBLISHED", message: "The condition report is not published" });
  }
  if (!input.requiredReconDecisionsComplete) {
    blockers.push({ code: "RECON_DECISION_PENDING", message: "Required recon decisions are incomplete" });
  }
  if (!input.authorizedRequiredWorkComplete) {
    blockers.push({ code: "RECON_WORK_INCOMPLETE", message: "Authorized required recon work is incomplete" });
  }
  if (input.reauthorizationRequired) {
    blockers.push({ code: "REAUTHORIZATION_REQUIRED", message: "A revised estimate is awaiting reauthorization" });
  }
  if (input.qualityControlFailed) {
    blockers.push({ code: "QUALITY_CONTROL_FAILED", message: "Quality control failed" });
  } else if (!input.qualityControlPassed) {
    blockers.push({ code: "QUALITY_CONTROL_REQUIRED", message: "Quality control has not passed" });
  }
  if (!input.disclosuresComplete) {
    blockers.push({ code: "DISCLOSURE_INCOMPLETE", message: "Required announcements or disclosures are incomplete" });
  }
  for (const issue of input.otherBlockingIssues) {
    blockers.push({ code: "BLOCKING_ISSUE", message: issue });
  }
  return {
    saleReady: blockers.length === 0,
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    blockers
  };
}
