import { z } from "zod";
import { InspectionTypeSchema } from "./recon.js";
export * from "./recon.js";

export const inspectionStatuses = [
  "DRAFT",
  "NEEDS_PHOTOS",
  "READY_FOR_GRADING",
  "GRADED",
  "AI_DRAFT_PENDING",
  "AI_DRAFTED",
  "HUMAN_REVIEW_REQUIRED",
  "FINALIZED",
  "REPORT_FAILED"
] as const;

export const requiredPhotoAngles = [
  "front",
  "rear",
  "driver_side",
  "passenger_side",
  "interior",
  "engine_bay",
  "odometer",
  "vin_plate"
] as const;

export const photoAngles = [...requiredPhotoAngles, "unknown"] as const;

export const damageTypes = [
  "scratch",
  "dent",
  "crack",
  "paint_damage",
  "glass_damage",
  "wheel_damage",
  "interior_wear",
  "unknown"
] as const;

export const damageSeverities = ["minor", "moderate", "severe", "unknown"] as const;
export const suggestionStatuses = ["pending", "accepted", "rejected", "edited"] as const;
export const userRoles = [
  "inspector",
  "reviewer",
  "recon_coordinator",
  "consignor_approver",
  "technician",
  "admin"
] as const;
export const imageUploadStatuses = ["pending", "uploaded", "failed"] as const;
export const imageAnalysisJobStatuses = ["queued", "running", "completed", "failed", "dead_letter"] as const;
export const supportedImageUploadMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxImageUploadBytes = 25_000_000;
export const maxLocalPreviewUploadBytes = 2_000_000;
export const readinessIssueTypes = [
  "missing_required_angle",
  "image_quality_retake",
  "image_analysis_failed",
  "unreviewed_ai_suggestion",
  "condition_grade_missing",
  "repair_estimate_missing",
  "high_arbitration_risk",
  "final_report_missing"
] as const;
export const roleActions = [
  "inspection:create",
  "inspection:update",
  "inspection:assign",
  "inspection:workflow",
  "vehicle:check_in",
  "vehicle:update_location",
  "photo:capture",
  "photo:analyze",
  "suggestion:review",
  "suggestion:assign",
  "damage:create",
  "damage:update",
  "damage:delete",
  "grade:calculate",
  "grade:approve",
  "report:draft",
  "report:edit",
  "report:approve",
  "report:finalize",
  "report:retry",
  "recon:estimate",
  "recon:authorize",
  "recon:policy_manage",
  "work_order:update",
  "quality_control:decide",
  "sale_readiness:assess",
  "ops:view",
  "ops:recover"
] as const;

export const InspectionStatusSchema = z.enum(inspectionStatuses);
export const PhotoAngleSchema = z.enum(photoAngles);
export const RequiredPhotoAngleSchema = z.enum(requiredPhotoAngles);
export const DamageTypeSchema = z.enum(damageTypes);
export const DamageSeveritySchema = z.enum(damageSeverities);
export const SuggestionStatusSchema = z.enum(suggestionStatuses);
export const UserRoleSchema = z.enum(userRoles);
export const ImageUploadStatusSchema = z.enum(imageUploadStatuses);
export const ImageAnalysisJobStatusSchema = z.enum(imageAnalysisJobStatuses);
export const SupportedImageUploadMimeTypeSchema = z.enum(supportedImageUploadMimeTypes);
export const ReadinessIssueTypeSchema = z.enum(readinessIssueTypes);

export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;
export type PhotoAngle = z.infer<typeof PhotoAngleSchema>;
export type RequiredPhotoAngle = z.infer<typeof RequiredPhotoAngleSchema>;
export type DamageType = z.infer<typeof DamageTypeSchema>;
export type DamageSeverity = z.infer<typeof DamageSeveritySchema>;
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type ImageUploadStatus = z.infer<typeof ImageUploadStatusSchema>;
export type ImageAnalysisJobStatus = z.infer<typeof ImageAnalysisJobStatusSchema>;
export type SupportedImageUploadMimeType = z.infer<typeof SupportedImageUploadMimeTypeSchema>;
export type ReadinessIssueType = z.infer<typeof ReadinessIssueTypeSchema>;
export type RoleAction = typeof roleActions[number];

export type RepairEstimateRange = {
  min: number;
  max: number;
  label: string;
};

export const repairEstimateRangesUsd: Record<DamageType, Record<DamageSeverity, RepairEstimateRange>> = {
  scratch: {
    minor: { min: 150, max: 300, label: "$150 - $300" },
    moderate: { min: 300, max: 700, label: "$300 - $700" },
    severe: { min: 700, max: 1500, label: "$700 - $1,500" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  },
  dent: {
    minor: { min: 200, max: 450, label: "$200 - $450" },
    moderate: { min: 500, max: 1200, label: "$500 - $1,200" },
    severe: { min: 1200, max: 2500, label: "$1,200 - $2,500" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  },
  crack: {
    minor: { min: 250, max: 600, label: "$250 - $600" },
    moderate: { min: 600, max: 1400, label: "$600 - $1,400" },
    severe: { min: 1400, max: 3000, label: "$1,400 - $3,000" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  },
  paint_damage: {
    minor: { min: 250, max: 600, label: "$250 - $600" },
    moderate: { min: 600, max: 1500, label: "$600 - $1,500" },
    severe: { min: 1500, max: 3500, label: "$1,500 - $3,500" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  },
  glass_damage: {
    minor: { min: 200, max: 500, label: "$200 - $500" },
    moderate: { min: 500, max: 900, label: "$500 - $900" },
    severe: { min: 900, max: 1600, label: "$900 - $1,600" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  },
  wheel_damage: {
    minor: { min: 125, max: 350, label: "$125 - $350" },
    moderate: { min: 350, max: 850, label: "$350 - $850" },
    severe: { min: 850, max: 1800, label: "$850 - $1,800" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  },
  interior_wear: {
    minor: { min: 75, max: 250, label: "$75 - $250" },
    moderate: { min: 250, max: 750, label: "$250 - $750" },
    severe: { min: 750, max: 1800, label: "$750 - $1,800" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  },
  unknown: {
    minor: { min: 150, max: 400, label: "$150 - $400" },
    moderate: { min: 400, max: 1000, label: "$400 - $1,000" },
    severe: { min: 1000, max: 2500, label: "$1,000 - $2,500" },
    unknown: { min: 0, max: 0, label: "Estimator review" }
  }
};

function normalizeDamageType(value: string): DamageType {
  const normalized = value.toLowerCase().replaceAll(" ", "_");
  return damageTypes.includes(normalized as DamageType) ? normalized as DamageType : "unknown";
}

function normalizeDamageSeverity(value: string): DamageSeverity {
  const normalized = value.toLowerCase().replaceAll(" ", "_");
  return damageSeverities.includes(normalized as DamageSeverity) ? normalized as DamageSeverity : "unknown";
}

export function estimateDamageRepairCost(
  damageType: DamageType | string,
  severity: DamageSeverity | string
): RepairEstimateRange {
  const typeKey = normalizeDamageType(damageType);
  const severityKey = normalizeDamageSeverity(severity);
  return repairEstimateRangesUsd[typeKey][severityKey] ?? repairEstimateRangesUsd.unknown.unknown;
}

export function estimateTotalRepairRange(
  items: Array<{ damageType: DamageType | string; severity: DamageSeverity | string }>
): RepairEstimateRange | null {
  if (items.length === 0) return null;
  let min = 0;
  let max = 0;
  for (const item of items) {
    const estimate = estimateDamageRepairCost(item.damageType, item.severity);
    min += estimate.min;
    max += estimate.max;
  }
  if (min === 0 && max === 0) return { min, max, label: "Estimator review" };
  return {
    min,
    max,
    label: `$${min.toLocaleString()} - $${max.toLocaleString()}`
  };
}

export const rolePermissions: Record<UserRole, RoleAction[]> = {
  inspector: [
    "inspection:create",
    "inspection:workflow",
    "vehicle:check_in",
    "photo:capture",
    "photo:analyze",
    "damage:create"
  ],
  reviewer: [
    "inspection:workflow",
    "suggestion:review",
    "suggestion:assign",
    "damage:create",
    "grade:calculate",
    "grade:approve",
    "report:draft",
    "report:edit",
    "report:approve",
    "report:finalize",
    "report:retry"
  ],
  recon_coordinator: [
    "recon:estimate",
    "work_order:update",
    "quality_control:decide",
    "sale_readiness:assess",
    "ops:view"
  ],
  consignor_approver: [
    "recon:authorize"
  ],
  technician: [
    "work_order:update"
  ],
  admin: [...roleActions]
};

export const roleActionLabels: Record<RoleAction, string> = {
  "inspection:create": "create inspections",
  "inspection:update": "edit inspection records",
  "inspection:assign": "assign inspections",
  "inspection:workflow": "advance inspection workflow states",
  "vehicle:check_in": "check in vehicles",
  "vehicle:update_location": "update vehicle facility locations",
  "photo:capture": "attach or upload photo evidence",
  "photo:analyze": "run image analysis",
  "suggestion:review": "accept, reject, or edit AI suggestions",
  "suggestion:assign": "assign AI suggestions",
  "damage:create": "confirm damage items",
  "damage:update": "edit confirmed damage",
  "damage:delete": "delete confirmed damage",
  "grade:calculate": "calculate condition grades",
  "grade:approve": "approve or override condition grades",
  "report:draft": "draft condition reports",
  "report:edit": "edit report drafts",
  "report:approve": "approve report drafts",
  "report:finalize": "finalize condition reports",
  "report:retry": "retry report jobs",
  "recon:estimate": "create or revise recon estimates",
  "recon:authorize": "authorize or decline recon spending",
  "recon:policy_manage": "manage consignor authorization policies",
  "work_order:update": "update authorized work orders",
  "quality_control:decide": "record quality-control decisions",
  "sale_readiness:assess": "recalculate sale readiness",
  "ops:view": "view operational projections",
  "ops:recover": "recover failed operations jobs"
};

export const roleDescriptions: Record<UserRole, string> = {
  inspector: "Capture vehicle evidence, record observed damage, and run image analysis.",
  reviewer: "Confirm AI findings, grade inspections, and finalize reports.",
  recon_coordinator: "Prepare recon estimates, manage authorized work, and verify completion.",
  consignor_approver: "Approve or decline recon spending for authorized consignor accounts.",
  technician: "Perform and update assigned facility work orders.",
  admin: "Full workflow access, including record correction and exceptions."
};

export function canRole(role: UserRole, action: RoleAction): boolean {
  return rolePermissions[role].includes(action);
}

export function rolesForAction(action: RoleAction): UserRole[] {
  return userRoles.filter((role) => canRole(role, action));
}

export const CreateInspectionSchema = z.object({
  vin: z.string().trim().min(4).max(32),
  year: z.coerce.number().int().min(1980).max(2035),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  trim: z.string().trim().max(80).default(""),
  mileage: z.coerce.number().int().min(0).max(500000),
  exteriorColor: z.string().trim().min(1).max(40),
  sellerSource: z.string().trim().min(1).max(80),
  inspectorName: z.string().trim().min(1).max(80)
});

export const PatchInspectionSchema = CreateInspectionSchema.partial().extend({
  status: InspectionStatusSchema.optional(),
  assignedToUserId: z.string().trim().min(1).max(120).nullable().optional(),
  expectedVersion: z.coerce.number().int().min(1).optional()
});

export const UploadPhotoSchema = z.object({
  originalFilename: z.string().trim().min(1).max(180),
  mimeType: SupportedImageUploadMimeTypeSchema,
  declaredAngle: PhotoAngleSchema.optional().nullable(),
  storageKey: z.string().trim().max(3_000_000).optional(),
  objectBucket: z.string().trim().min(1).max(120).optional(),
  objectKey: z.string().trim().min(1).max(500).optional(),
  thumbnailStorageKey: z.string().trim().max(500).optional(),
  byteSize: z.coerce.number().int().min(1).max(maxImageUploadBytes).optional(),
  checksumSha256: z.string().trim().regex(/^([a-f0-9]{64}|[A-Za-z0-9+/]{43}=)$/i).optional(),
  sourceName: z.string().trim().min(1).max(120).optional(),
  sourceUrl: z.string().trim().url().max(500).optional(),
  sourceLicense: z.string().trim().min(1).max(160).optional(),
  operationId: z.string().uuid().optional(),
  capturedAt: z.string().datetime().optional(),
  deviceId: z.string().trim().min(1).max(120).optional(),
  captureSource: z.enum(["web", "mobile", "reference"]).default("web")
}).superRefine((input, ctx) => {
  if (input.captureSource === "mobile" && !input.operationId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operationId"], message: "Mobile uploads require an operationId." });
  }
  if (input.captureSource === "mobile" && !input.deviceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deviceId"], message: "Mobile uploads require a deviceId." });
  }
});

export const UploadIntentSchema = z.object({
  inspectionId: z.string().uuid(),
  originalFilename: z.string().trim().min(1).max(180),
  mimeType: SupportedImageUploadMimeTypeSchema,
  byteSize: z.coerce.number().int().min(1).max(maxImageUploadBytes),
  checksumSha256: z.string().trim().regex(/^([a-f0-9]{64}|[A-Za-z0-9+/]{43}=)$/i).optional(),
  operationId: z.string().uuid().optional(),
  captureSource: z.enum(["web", "mobile"]).default("web")
}).superRefine((input, ctx) => {
  if (input.captureSource === "mobile" && !input.operationId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operationId"], message: "Mobile upload intents require an operationId." });
  }
});

export const SamplePhotoSchema = z.object({
  sampleKey: z.string().trim().min(1).max(120)
});

export const DamageCandidateSchema = z.object({
  location: z.string().trim().min(1).max(120),
  damageType: DamageTypeSchema,
  severityEstimate: DamageSeveritySchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string().trim().min(1).max(500),
  repairEstimateUsd: z.object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    rationale: z.string().trim().min(1).max(300)
  }),
  requiresHumanConfirmation: z.boolean()
});

export const ImageQualitySchema = z.object({
  grade: z.enum(["pass", "review", "retake"]),
  blurScore: z.number().min(0).max(1),
  exposureScore: z.number().min(0).max(1),
  framingScore: z.number().min(0).max(1),
  resolutionScore: z.number().min(0).max(1),
  occlusionRisk: z.number().min(0).max(1),
  retakeRequired: z.boolean(),
  notes: z.array(z.string().trim().min(1).max(160))
}).strict();

export const VehicleOrientationSchema = z.object({
  frontDirection: z.enum(["left", "right", "center", "unknown"]),
  confidence: z.number().min(0).max(1),
  cues: z.array(z.string().trim().min(1).max(160)).max(3)
}).strict();

export const VisionOutputSchema = z.object({
  photoAngle: PhotoAngleSchema,
  confidence: z.number().min(0).max(1),
  vehicleOrientation: VehicleOrientationSchema.optional(),
  imageQuality: ImageQualitySchema,
  qualityWarnings: z.array(z.string().trim().min(1).max(160)),
  detectedDamageCandidates: z.array(DamageCandidateSchema),
  extractedText: z.object({
    odometer: z.string().nullable().optional(),
    vin: z.string().nullable().optional()
  }),
  humanReviewRequired: z.boolean()
}).strict();

export type VisionOutput = z.infer<typeof VisionOutputSchema>;

export const UpdateSuggestionSchema = z.object({
  suggestedValue: z.unknown(),
  explanation: z.string().trim().min(1).max(500).optional(),
  expectedVersion: z.coerce.number().int().min(1).optional()
});

export const SuggestionDecisionSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1).optional()
}).default({});

export const SuggestionAssignmentSchema = z.object({
  assignedToRole: z.enum(["inspector", "reviewer"]),
  assignedToUserId: z.string().trim().min(1).max(120).nullable().optional(),
  dueAt: z.string().datetime().optional(),
  expectedVersion: z.coerce.number().int().min(1).optional()
});

export const BulkSuggestionAssignmentSchema = z.object({
  suggestionIds: z.array(z.string().uuid()).min(1).max(100),
  assignedToRole: z.enum(["inspector", "reviewer"]),
  assignedToUserId: z.string().trim().min(1).max(120).nullable().optional(),
  dueAt: z.string().datetime().optional()
});

export const BulkRetakeRequestSchema = z.object({
  suggestionIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().trim().min(1).max(500)
});

export const CreateDamageItemSchema = z.object({
  photoId: z.string().uuid().optional().nullable(),
  location: z.string().trim().min(1).max(120),
  damageType: DamageTypeSchema,
  severity: DamageSeveritySchema,
  notes: z.string().trim().max(800).default(""),
  source: z.enum(["manual", "vision_suggestion"]).default("manual"),
  idempotencyKey: z.string().trim().min(1).max(120).optional()
});

export const PatchDamageItemSchema = CreateDamageItemSchema
  .omit({ idempotencyKey: true })
  .partial();

export const GradeRequestSchema = z.object({
  idempotencyKey: z.string().trim().max(120).optional()
}).default({});

export const ApproveConditionGradeSchema = z.object({
  approvedGrade: z.number().min(0).max(5),
  overrideReason: z.string().trim().min(1).max(1000).nullable().optional()
});

export const ReadinessIssueSchema = z.object({
  type: ReadinessIssueTypeSchema,
  severity: z.enum(["blocker", "watch"]),
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(500),
  action: z.string().trim().min(1).max(200)
});

export type ReadinessIssue = z.infer<typeof ReadinessIssueSchema>;

export const GradingInputSchema = z.object({
  vehicle: z.object({
    year: z.number().int(),
    mileage: z.number().int()
  }),
  requiredPhotoCompletion: z.number().min(0).max(1),
  damageItems: z.array(z.object({
    location: z.string(),
    damageType: DamageTypeSchema,
    severity: DamageSeveritySchema
  }))
});

export const GradingOutputSchema = z.object({
  suggestedGrade: z.number().min(0).max(5),
  conditionGradeBeforeRecon: z.number().min(0).max(5),
  evidenceBlockers: z.array(z.string()),
  explanation: z.object({
    baseGrade: z.number().min(0).max(5),
    deductions: z.array(z.object({
      reason: z.string(),
      amount: z.number().min(0).max(5)
    }))
  }),
  gradingVersion: z.string()
});

export type GradingInput = z.infer<typeof GradingInputSchema>;
export type GradingOutput = z.infer<typeof GradingOutputSchema>;

export const ConditionReportSectionSchema = z.object({
  key: z.enum([
    "VIN_VERIFICATION",
    "ODOMETER_VERIFICATION",
    "EXTERIOR_CONDITION",
    "INTERIOR_CONDITION",
    "STRUCTURAL_OBSERVATIONS",
    "DAMAGE_LINE_ITEMS",
    "TIRES_AND_TREAD",
    "WHEELS",
    "WINDSHIELD_AND_GLASS",
    "KEYS",
    "WARNING_LIGHTS",
    "DIAGNOSTIC_TROUBLE_CODES",
    "PRIOR_PAINT_OR_REPAIR",
    "ODOR",
    "EMISSIONS",
    "AIR_CONDITIONING",
    "SRS_AIRBAG",
    "FLOOD_INDICATORS",
    "REVIEWER_NOTES",
    "ANNOUNCEMENTS_AND_DISCLOSURES"
  ]),
  title: z.string().trim().min(1).max(120),
  status: z.enum(["VERIFIED", "OBSERVED", "NOT_OBSERVED", "NOT_APPLICABLE", "REQUIRES_REVIEW"]),
  observations: z.array(z.string().trim().min(1).max(500)).max(20)
}).strict();

export type ConditionReportSection = z.infer<typeof ConditionReportSectionSchema>;

export const AiReportOutputSchema = z.object({
  inspectionType: InspectionTypeSchema.default("VISUAL_CONDITION_REPORT"),
  summary: z.string().trim().min(1).max(2000),
  notableDefects: z.array(z.string().trim().min(1).max(400)),
  missingEvidence: z.array(z.string().trim().min(1).max(200)),
  recommendedDisclosure: z.string().trim().min(1).max(1000),
  conditionReportSections: z.array(ConditionReportSectionSchema).default([]),
  confidence: z.number().min(0).max(1),
  humanReviewRequired: z.boolean(),
  reasoningSummary: z.string().trim().min(1).max(1200)
}).strict();

export type AiReportOutput = z.infer<typeof AiReportOutputSchema>;

export const PatchReportSchema = z.object({
  reportBody: z.string().trim().min(1).max(8000),
  reviewerComment: z.string().trim().max(2000).optional(),
  expectedVersion: z.coerce.number().int().min(1).optional()
});

export const ReportApprovalSchema = z.object({
  reviewerComment: z.string().trim().max(2000).optional(),
  expectedVersion: z.coerce.number().int().min(1)
});

export const DomainEventTypeSchema = z.enum([
  "inspection.created",
  "vehicle.checked_in",
  "vehicle.location_updated",
  "inspection.assigned",
  "inspection.completed",
  "photo.uploaded",
  "image.analysis.completed",
  "image.analysis.failed",
  "image.retake.required",
  "suggestion.reviewed",
  "condition_report.published",
  "recon.estimate_created",
  "recon.estimate_revision_requested",
  "recon.authorization_requested",
  "recon.item_auto_authorized",
  "recon.item_authorized",
  "recon.item_declined",
  "recon.reauthorization_required",
  "work_order.created",
  "work_order.started",
  "work_order.blocked",
  "work_order.completed",
  "quality_control.failed",
  "quality_control.passed",
  "vehicle.sale_readiness_changed",
  "report.finalized"
]);

export const DomainEventV1Schema = z.object({
  eventId: z.string().uuid(),
  eventType: DomainEventTypeSchema,
  schemaVersion: z.literal("1.0"),
  occurredAt: z.string().datetime(),
  inspectionId: z.string().uuid(),
  actor: z.object({
    id: z.string().trim().min(1).max(120),
    role: UserRoleSchema
  }),
  correlationId: z.string().trim().min(1).max(160),
  payload: z.record(z.unknown())
}).strict();

export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;
export type DomainEventV1 = z.infer<typeof DomainEventV1Schema>;

export type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export function formatAngle(angle: string): string {
  return angle.replaceAll("_", " ");
}
