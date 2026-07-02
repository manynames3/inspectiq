import { z } from "zod";

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
export const userRoles = ["inspector", "reviewer", "admin"] as const;

export const InspectionStatusSchema = z.enum(inspectionStatuses);
export const PhotoAngleSchema = z.enum(photoAngles);
export const RequiredPhotoAngleSchema = z.enum(requiredPhotoAngles);
export const DamageTypeSchema = z.enum(damageTypes);
export const DamageSeveritySchema = z.enum(damageSeverities);
export const SuggestionStatusSchema = z.enum(suggestionStatuses);
export const UserRoleSchema = z.enum(userRoles);

export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;
export type PhotoAngle = z.infer<typeof PhotoAngleSchema>;
export type RequiredPhotoAngle = z.infer<typeof RequiredPhotoAngleSchema>;
export type DamageType = z.infer<typeof DamageTypeSchema>;
export type DamageSeverity = z.infer<typeof DamageSeveritySchema>;
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;

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
  status: InspectionStatusSchema.optional()
});

export const UploadPhotoSchema = z.object({
  originalFilename: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().regex(/^image\/(jpeg|png|webp|svg\+xml)$/),
  declaredAngle: PhotoAngleSchema.optional().nullable(),
  storageKey: z.string().trim().max(240).optional()
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
  requiresHumanConfirmation: z.boolean()
});

export const VisionOutputSchema = z.object({
  photoAngle: PhotoAngleSchema,
  confidence: z.number().min(0).max(1),
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
  explanation: z.string().trim().min(1).max(500).optional()
});

export const CreateDamageItemSchema = z.object({
  photoId: z.string().uuid().optional().nullable(),
  location: z.string().trim().min(1).max(120),
  damageType: DamageTypeSchema,
  severity: DamageSeveritySchema,
  notes: z.string().trim().max(800).default(""),
  source: z.enum(["manual", "vision_suggestion"]).default("manual")
});

export const PatchDamageItemSchema = CreateDamageItemSchema.partial();

export const GradeRequestSchema = z.object({
  idempotencyKey: z.string().trim().max(120).optional()
}).default({});

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
  score: z.number().int().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  explanation: z.object({
    baseScore: z.number(),
    deductions: z.array(z.object({
      reason: z.string(),
      points: z.number()
    })),
    completionPenalty: z.number(),
    mileageAdjustment: z.number(),
    ageAdjustment: z.number().optional()
  }),
  gradingVersion: z.string()
});

export type GradingInput = z.infer<typeof GradingInputSchema>;
export type GradingOutput = z.infer<typeof GradingOutputSchema>;

export const AiReportOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  notableDefects: z.array(z.string().trim().min(1).max(400)),
  missingEvidence: z.array(z.string().trim().min(1).max(200)),
  recommendedDisclosure: z.string().trim().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  humanReviewRequired: z.boolean(),
  reasoningSummary: z.string().trim().min(1).max(1200)
}).strict();

export type AiReportOutput = z.infer<typeof AiReportOutputSchema>;

export const PatchReportSchema = z.object({
  reportBody: z.string().trim().min(1).max(8000)
});

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

