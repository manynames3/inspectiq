import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const inspections = pgTable("inspections", {
  id: text("id").primaryKey(),
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
  createdBy: text("created_by").references(() => users.id),
  assignedToUserId: text("assigned_to_user_id").references(() => users.id),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true })
});

export const vehiclePhotos = pgTable("vehicle_photos", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  storageKey: text("storage_key").notNull(),
  objectBucket: text("object_bucket"),
  objectKey: text("object_key"),
  thumbnailStorageKey: text("thumbnail_storage_key"),
  byteSize: integer("byte_size"),
  checksumSha256: text("checksum_sha256"),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  sourceLicense: text("source_license"),
  uploadedBy: text("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploadStatus: text("upload_status").notNull(),
  declaredAngle: text("declared_angle"),
  detectedAngle: text("detected_angle"),
  detectedAngleConfidence: numeric("detected_angle_confidence"),
  qualityStatus: text("quality_status").notNull(),
  analysisStatus: text("analysis_status").notNull(),
  operationId: text("operation_id"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  deviceId: text("device_id"),
  captureSource: text("capture_source").notNull().default("web")
});

export const imageAnalysisJobs = pgTable("image_analysis_jobs", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  photoId: text("photo_id").notNull().references(() => vehiclePhotos.id),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key"),
  attempts: integer("attempts").notNull(),
  errorMessage: text("error_message"),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const photoAnalysisResults = pgTable("photo_analysis_results", {
  id: text("id").primaryKey(),
  photoId: text("photo_id").notNull().references(() => vehiclePhotos.id),
  provider: text("provider").notNull(),
  promptVersion: text("prompt_version").notNull(),
  rawModelOutputJson: jsonb("raw_model_output_json"),
  validatedOutputJson: jsonb("validated_output_json"),
  confidence: numeric("confidence").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  modelId: text("model_id"),
  latencyMs: integer("latency_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }),
  schemaValid: boolean("schema_valid").notNull().default(true),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  failureCategory: text("failure_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const visionSuggestions = pgTable("vision_suggestions", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  photoId: text("photo_id").notNull().references(() => vehiclePhotos.id),
  suggestionType: text("suggestion_type").notNull(),
  suggestedValueJson: jsonb("suggested_value_json").notNull(),
  confidence: numeric("confidence").notNull(),
  explanation: text("explanation").notNull(),
  status: text("status").notNull(),
  assignedToRole: text("assigned_to_role").notNull(),
  assignedToUserId: text("assigned_to_user_id").references(() => users.id),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const damageItems = pgTable("damage_items", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  photoId: text("photo_id").references(() => vehiclePhotos.id),
  location: text("location").notNull(),
  damageType: text("damage_type").notNull(),
  severity: text("severity").notNull(),
  notes: text("notes").notNull(),
  source: text("source").notNull(),
  confirmedBy: text("confirmed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const conditionGrades = pgTable("condition_grades", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  suggestedGrade: numeric("suggested_grade", { precision: 2, scale: 1 }).notNull(),
  approvedGrade: numeric("approved_grade", { precision: 2, scale: 1 }),
  conditionGradeBeforeRecon: numeric("condition_grade_before_recon", { precision: 2, scale: 1 }).notNull(),
  estimatedGradeAfterRecon: numeric("estimated_grade_after_recon", { precision: 2, scale: 1 }).notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id),
  overrideReason: text("override_reason"),
  evidenceBlockersJson: jsonb("evidence_blockers_json").notNull(),
  explanationJson: jsonb("explanation_json").notNull(),
  gradingVersion: text("grading_version").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
});

export const aiReportJobs = pgTable("ai_report_jobs", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key"),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const aiReportDrafts = pgTable("ai_report_drafts", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  jobId: text("job_id").notNull().references(() => aiReportJobs.id),
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
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  reportBody: text("report_body").notNull(),
  finalizedBy: text("finalized_by").references(() => users.id),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  version: integer("version").notNull(),
  approvalStatus: text("approval_status").notNull().default("draft"),
  reviewerComment: text("reviewer_comment").notNull().default(""),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true })
});

export const reportVersions = pgTable("report_versions", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull().references(() => finalReports.id),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  version: integer("version").notNull(),
  reportBody: text("report_body").notNull(),
  approvalStatus: text("approval_status").notNull(),
  reviewerComment: text("reviewer_comment").notNull().default(""),
  changedBy: text("changed_by").notNull().references(() => users.id),
  changeType: text("change_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  actor: text("actor").notNull(),
  eventType: text("event_type").notNull(),
  detailsJson: jsonb("details_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const domainEvents = pgTable("domain_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  schemaVersion: text("schema_version").notNull(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  correlationId: text("correlation_id").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  status: text("status").notNull(),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true })
});

export const consignorAccounts = pgTable("consignor_accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull(),
  authorizedUserIdsJson: jsonb("authorized_user_ids_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const reconAuthorizationPolicies = pgTable("recon_authorization_policies", {
  id: text("id").primaryKey(),
  consignorAccountId: text("consignor_account_id").notNull().references(() => consignorAccounts.id),
  name: text("name").notNull(),
  approvalMode: text("approval_mode").notNull(),
  totalVehicleLimit: numeric("total_vehicle_limit", { precision: 12, scale: 2 }).notNull(),
  serviceRulesJson: jsonb("service_rules_json").notNull(),
  costOverrunTolerance: numeric("cost_overrun_tolerance", { precision: 12, scale: 2 }).notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const vehicleIntakes = pgTable("vehicle_intakes", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  consignorAccountId: text("consignor_account_id").notNull().references(() => consignorAccounts.id),
  facility: text("facility").notNull(),
  yardZone: text("yard_zone").notNull(),
  parkingSpace: text("parking_space").notNull(),
  lastLocationTimestamp: timestamp("last_location_timestamp", { withTimezone: true }).notNull(),
  inspectionType: text("inspection_type").notNull(),
  inspectionWorkflowStatus: text("inspection_workflow_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const inspectionAssignments = pgTable("inspection_assignments", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  assignedToUserId: text("assigned_to_user_id").notNull().references(() => users.id),
  assignedByUserId: text("assigned_by_user_id").notNull().references(() => users.id),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const saleAssignments = pgTable("sale_assignments", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  saleDateTime: timestamp("sale_date_time", { withTimezone: true }).notNull(),
  lane: text("lane").notNull(),
  runNumber: text("run_number").notNull(),
  saleEventId: text("sale_event_id"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const vehicleLocationEvents = pgTable("vehicle_location_events", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  facility: text("facility").notNull(),
  yardZone: text("yard_zone").notNull(),
  parkingSpace: text("parking_space").notNull(),
  reason: text("reason").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const reconRecommendations = pgTable("recon_recommendations", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  damageItemId: text("damage_item_id").references(() => damageItems.id),
  serviceType: text("service_type").notNull(),
  recommendedAction: text("recommended_action").notNull(),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }).notNull(),
  estimatedDurationHours: numeric("estimated_duration_hours", { precision: 10, scale: 2 }).notNull(),
  expectedGradeLift: numeric("expected_grade_lift", { precision: 2, scale: 1 }).notNull(),
  estimateCreatorId: text("estimate_creator_id").notNull().references(() => users.id),
  supportingPhotoIdsJson: jsonb("supporting_photo_ids_json").notNull(),
  notes: text("notes").notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const reconAuthorizations = pgTable("recon_authorizations", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  recommendationId: text("recommendation_id").notNull().references(() => reconRecommendations.id),
  decision: text("decision").notNull(),
  authorizedAmount: numeric("authorized_amount", { precision: 12, scale: 2 }).notNull(),
  authorizationSource: text("authorization_source"),
  consignorUserId: text("consignor_user_id").references(() => users.id),
  policySnapshotJson: jsonb("policy_snapshot_json"),
  decisionReason: text("decision_reason").notNull(),
  decisionTimestamp: timestamp("decision_timestamp", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const workOrders = pgTable("work_orders", {
  id: text("id").primaryKey(),
  workOrderNumber: text("work_order_number").notNull(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  facility: text("facility").notNull(),
  serviceDepartment: text("service_department").notNull(),
  authorizedAmount: numeric("authorized_amount", { precision: 12, scale: 2 }).notNull(),
  currentEstimatedCost: numeric("current_estimated_cost", { precision: 12, scale: 2 }).notNull(),
  actualCost: numeric("actual_cost", { precision: 12, scale: 2 }),
  assignedTechnician: text("assigned_technician"),
  instructions: text("instructions").notNull(),
  saleDeadline: timestamp("sale_deadline", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  blockedReason: text("blocked_reason"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const workOrderTasks = pgTable("work_order_tasks", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id),
  recommendationId: text("recommendation_id").notNull().references(() => reconRecommendations.id),
  description: text("description").notNull(),
  authorizedAmount: numeric("authorized_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const qualityControlResults = pgTable("quality_control_results", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id),
  status: text("status").notNull(),
  notes: text("notes").notNull(),
  inspectedByUserId: text("inspected_by_user_id").notNull().references(() => users.id),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }).notNull()
});

export const saleReadinessAssessments = pgTable("sale_readiness_assessments", {
  id: text("id").primaryKey(),
  inspectionId: text("inspection_id").notNull().references(() => inspections.id),
  saleReady: boolean("sale_ready").notNull(),
  status: text("status").notNull(),
  blockersJson: jsonb("blockers_json").notNull(),
  assessedByUserId: text("assessed_by_user_id").notNull(),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull()
});
