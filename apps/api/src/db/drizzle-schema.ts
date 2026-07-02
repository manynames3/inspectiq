import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const inspections = pgTable("inspections", {
  id: uuid("id").defaultRandom().primaryKey(),
  vin: text("vin").notNull(),
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  trim: text("trim").notNull(),
  mileage: integer("mileage").notNull(),
  exteriorColor: text("exterior_color").notNull(),
  sellerSource: text("seller_source").notNull(),
  inspectorName: text("inspector_name").notNull(),
  status: text("status").notNull(),
  completenessPercentage: integer("completeness_percentage").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true })
});

export const vehiclePhotos = pgTable("vehicle_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  declaredAngle: text("declared_angle"),
  detectedAngle: text("detected_angle"),
  detectedAngleConfidence: numeric("detected_angle_confidence"),
  qualityStatus: text("quality_status").notNull(),
  analysisStatus: text("analysis_status").notNull()
});

export const photoAnalysisResults = pgTable("photo_analysis_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  photoId: uuid("photo_id").notNull().references(() => vehiclePhotos.id),
  provider: text("provider").notNull(),
  promptVersion: text("prompt_version").notNull(),
  rawModelOutputJson: jsonb("raw_model_output_json"),
  validatedOutputJson: jsonb("validated_output_json"),
  confidence: numeric("confidence").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const visionSuggestions = pgTable("vision_suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  photoId: uuid("photo_id").notNull().references(() => vehiclePhotos.id),
  suggestionType: text("suggestion_type").notNull(),
  suggestedValueJson: jsonb("suggested_value_json").notNull(),
  confidence: numeric("confidence").notNull(),
  explanation: text("explanation").notNull(),
  status: text("status").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const damageItems = pgTable("damage_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  photoId: uuid("photo_id").references(() => vehiclePhotos.id),
  location: text("location").notNull(),
  damageType: text("damage_type").notNull(),
  severity: text("severity").notNull(),
  notes: text("notes").notNull(),
  source: text("source").notNull(),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const conditionGrades = pgTable("condition_grades", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  score: integer("score").notNull(),
  grade: text("grade").notNull(),
  explanationJson: jsonb("explanation_json").notNull(),
  gradingVersion: text("grading_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const aiReportJobs = pgTable("ai_report_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key"),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const aiReportDrafts = pgTable("ai_report_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  jobId: uuid("job_id").notNull().references(() => aiReportJobs.id),
  provider: text("provider").notNull(),
  promptVersion: text("prompt_version").notNull(),
  inputSummaryJson: jsonb("input_summary_json").notNull(),
  outputJson: jsonb("output_json").notNull(),
  confidence: numeric("confidence").notNull(),
  humanReviewRequired: boolean("human_review_required").notNull(),
  validationStatus: text("validation_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const finalReports = pgTable("final_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  reportBody: text("report_body").notNull(),
  finalizedBy: uuid("finalized_by").references(() => users.id),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  version: integer("version").notNull()
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  actor: text("actor").notNull(),
  eventType: text("event_type").notNull(),
  detailsJson: jsonb("details_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

