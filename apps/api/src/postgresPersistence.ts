import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type {
  AiReportDraft,
  AiReportJob,
  AuditEvent,
  ConditionGrade,
  DamageItem,
  FinalReport,
  ImageAnalysisJob,
  Inspection,
  PhotoAnalysisResult,
  User,
  VehiclePhoto,
  VisionSuggestion
} from "./domain.js";
import type { MemoryStore } from "./store.js";

const deleteOrder = [
  "audit_events",
  "final_reports",
  "ai_report_drafts",
  "ai_report_jobs",
  "condition_grades",
  "damage_items",
  "vision_suggestions",
  "photo_analysis_results",
  "image_analysis_jobs",
  "vehicle_photos",
  "inspections",
  "users"
] as const;

const SNAPSHOT_MUTATION_LOCK_KEY = "7803144587035695001";

function schemaPath(): string {
  const candidates = [
    process.env.DB_SCHEMA_PATH,
    path.resolve(process.cwd(), "src/db/schema.sql"),
    path.resolve(process.cwd(), "apps/api/src/db/schema.sql"),
    path.resolve(process.cwd(), "schema.sql"),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), "db/schema.sql")
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Could not locate schema.sql. Checked: ${candidates.join(", ")}`);
  return found;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(value);
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return num(value);
}

async function insertRows(client: PoolClient, table: string, columns: string[], rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.flat();
  const rowSql = rows.map((row, rowIndex) => {
    const slots = row.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`);
    return `(${slots.join(", ")})`;
  });
  await client.query(`insert into ${table} (${columns.join(", ")}) values ${rowSql.join(", ")}`, values);
}

export async function migratePostgres(pool: Pool, filePath = schemaPath()): Promise<void> {
  const schema = await readFile(filePath, "utf8");
  await pool.query(schema);
}

async function loadPostgresSnapshotFromClient(store: MemoryStore, client: PoolClient): Promise<boolean> {
    const { rowCount } = await client.query("select 1 from inspections limit 1");
    if (rowCount === 0) return false;

    store.reset();

    for (const row of (await client.query("select * from users")).rows) {
      const user = row as QueryResultRow;
      store.users.set(user.id, {
        id: user.id,
        name: user.name,
        role: user.role,
        createdAt: iso(user.created_at)
      } satisfies User);
    }

    for (const row of (await client.query("select * from inspections")).rows) {
      const record = row as QueryResultRow;
      store.inspections.set(record.id, {
        id: record.id,
        vin: record.vin,
        year: record.year,
        make: record.make,
        model: record.model,
        trim: record.trim,
        mileage: record.mileage,
        exteriorColor: record.exterior_color,
        sellerSource: record.seller_source,
        inspectorName: record.inspector_name,
        status: record.status,
        completenessPercentage: record.completeness_percentage,
        createdBy: record.created_by,
        createdAt: iso(record.created_at),
        updatedAt: iso(record.updated_at),
        finalizedAt: record.finalized_at ? iso(record.finalized_at) : null
      } satisfies Inspection);
    }

    for (const row of (await client.query("select * from vehicle_photos")).rows) {
      const record = row as QueryResultRow;
      store.photos.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        storageKey: record.storage_key,
        objectBucket: record.object_bucket,
        objectKey: record.object_key,
        thumbnailStorageKey: record.thumbnail_storage_key,
        byteSize: record.byte_size,
        checksumSha256: record.checksum_sha256,
        originalFilename: record.original_filename,
        mimeType: record.mime_type,
        uploadedBy: record.uploaded_by,
        uploadedAt: iso(record.uploaded_at),
        uploadStatus: record.upload_status,
        declaredAngle: record.declared_angle,
        detectedAngle: record.detected_angle,
        detectedAngleConfidence: nullableNum(record.detected_angle_confidence),
        qualityStatus: record.quality_status,
        analysisStatus: record.analysis_status
      } satisfies VehiclePhoto);
    }

    for (const row of (await client.query("select * from image_analysis_jobs")).rows) {
      const record = row as QueryResultRow;
      store.imageAnalysisJobs.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        photoId: record.photo_id,
        status: record.status,
        idempotencyKey: record.idempotency_key,
        attempts: record.attempts,
        errorMessage: record.error_message,
        queuedAt: iso(record.queued_at),
        updatedAt: iso(record.updated_at),
        completedAt: record.completed_at ? iso(record.completed_at) : null
      } satisfies ImageAnalysisJob);
    }

    for (const row of (await client.query("select * from photo_analysis_results")).rows) {
      const record = row as QueryResultRow;
      store.analyses.set(record.id, {
        id: record.id,
        photoId: record.photo_id,
        provider: record.provider,
        promptVersion: record.prompt_version,
        rawModelOutputJson: record.raw_model_output_json,
        validatedOutputJson: record.validated_output_json,
        confidence: num(record.confidence),
        status: record.status,
        errorMessage: record.error_message,
        createdAt: iso(record.created_at)
      } satisfies PhotoAnalysisResult);
    }

    for (const row of (await client.query("select * from vision_suggestions")).rows) {
      const record = row as QueryResultRow;
      store.suggestions.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        photoId: record.photo_id,
        suggestionType: record.suggestion_type,
        suggestedValueJson: record.suggested_value_json,
        confidence: num(record.confidence),
        explanation: record.explanation,
        status: record.status,
        reviewedBy: record.reviewed_by,
        reviewedAt: record.reviewed_at ? iso(record.reviewed_at) : null,
        createdAt: iso(record.created_at)
      } satisfies VisionSuggestion);
    }

    for (const row of (await client.query("select * from damage_items")).rows) {
      const record = row as QueryResultRow;
      store.damageItems.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        photoId: record.photo_id,
        location: record.location,
        damageType: record.damage_type,
        severity: record.severity,
        notes: record.notes,
        source: record.source,
        confirmedBy: record.confirmed_by,
        createdAt: iso(record.created_at),
        updatedAt: iso(record.updated_at)
      } satisfies DamageItem);
    }

    for (const row of (await client.query("select * from condition_grades")).rows) {
      const record = row as QueryResultRow;
      store.conditionGrades.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        score: record.score,
        grade: record.grade,
        explanationJson: record.explanation_json,
        gradingVersion: record.grading_version,
        createdAt: iso(record.created_at)
      } satisfies ConditionGrade);
    }

    for (const row of (await client.query("select * from ai_report_jobs")).rows) {
      const record = row as QueryResultRow;
      store.reportJobs.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        status: record.status,
        idempotencyKey: record.idempotency_key,
        errorMessage: record.error_message,
        attempts: record.attempts,
        createdAt: iso(record.created_at),
        updatedAt: iso(record.updated_at)
      } satisfies AiReportJob);
    }

    for (const row of (await client.query("select * from ai_report_drafts")).rows) {
      const record = row as QueryResultRow;
      store.reportDrafts.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        jobId: record.job_id,
        provider: record.provider,
        promptVersion: record.prompt_version,
        inputSummaryJson: record.input_summary_json,
        outputJson: record.output_json,
        confidence: num(record.confidence),
        humanReviewRequired: record.human_review_required,
        validationStatus: record.validation_status,
        createdAt: iso(record.created_at)
      } satisfies AiReportDraft);
    }

    for (const row of (await client.query("select * from final_reports")).rows) {
      const record = row as QueryResultRow;
      store.finalReports.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        reportBody: record.report_body,
        finalizedBy: record.finalized_by,
        finalizedAt: record.finalized_at ? iso(record.finalized_at) : null,
        version: record.version
      } satisfies FinalReport);
    }

    for (const row of (await client.query("select * from audit_events")).rows) {
      const record = row as QueryResultRow;
      store.auditEvents.set(record.id, {
        id: record.id,
        inspectionId: record.inspection_id,
        actor: record.actor,
        eventType: record.event_type,
        detailsJson: record.details_json,
        createdAt: iso(record.created_at)
      } satisfies AuditEvent);
    }

    return true;
}

export async function loadPostgresSnapshot(store: MemoryStore, pool: Pool): Promise<boolean> {
  await migratePostgres(pool);
  const client = await pool.connect();
  try {
    return await loadPostgresSnapshotFromClient(store, client);
  } finally {
    client.release();
  }
}

async function writePostgresSnapshotToClient(store: MemoryStore, client: PoolClient): Promise<void> {
    for (const table of deleteOrder) {
      await client.query(`delete from ${table}`);
    }

    await insertRows(client, "users", ["id", "name", "role", "created_at"], [...store.users.values()].map((record) => [
      record.id,
      record.name,
      record.role,
      record.createdAt
    ]));

    await insertRows(client, "inspections", ["id", "vin", "year", "make", "model", "trim", "mileage", "exterior_color", "seller_source", "inspector_name", "status", "completeness_percentage", "created_by", "created_at", "updated_at", "finalized_at"], [...store.inspections.values()].map((record) => [
      record.id,
      record.vin,
      record.year,
      record.make,
      record.model,
      record.trim,
      record.mileage,
      record.exteriorColor,
      record.sellerSource,
      record.inspectorName,
      record.status,
      record.completenessPercentage,
      record.createdBy,
      record.createdAt,
      record.updatedAt,
      record.finalizedAt
    ]));

    await insertRows(client, "vehicle_photos", ["id", "inspection_id", "storage_key", "object_bucket", "object_key", "thumbnail_storage_key", "byte_size", "checksum_sha256", "original_filename", "mime_type", "uploaded_by", "uploaded_at", "upload_status", "declared_angle", "detected_angle", "detected_angle_confidence", "quality_status", "analysis_status"], [...store.photos.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.storageKey,
      record.objectBucket,
      record.objectKey,
      record.thumbnailStorageKey,
      record.byteSize,
      record.checksumSha256,
      record.originalFilename,
      record.mimeType,
      record.uploadedBy,
      record.uploadedAt,
      record.uploadStatus,
      record.declaredAngle,
      record.detectedAngle,
      record.detectedAngleConfidence,
      record.qualityStatus,
      record.analysisStatus
    ]));

    await insertRows(client, "image_analysis_jobs", ["id", "inspection_id", "photo_id", "status", "idempotency_key", "attempts", "error_message", "queued_at", "updated_at", "completed_at"], [...store.imageAnalysisJobs.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.photoId,
      record.status,
      record.idempotencyKey,
      record.attempts,
      record.errorMessage,
      record.queuedAt,
      record.updatedAt,
      record.completedAt
    ]));

    await insertRows(client, "photo_analysis_results", ["id", "photo_id", "provider", "prompt_version", "raw_model_output_json", "validated_output_json", "confidence", "status", "error_message", "created_at"], [...store.analyses.values()].map((record) => [
      record.id,
      record.photoId,
      record.provider,
      record.promptVersion,
      record.rawModelOutputJson,
      record.validatedOutputJson,
      record.confidence,
      record.status,
      record.errorMessage,
      record.createdAt
    ]));

    await insertRows(client, "vision_suggestions", ["id", "inspection_id", "photo_id", "suggestion_type", "suggested_value_json", "confidence", "explanation", "status", "reviewed_by", "reviewed_at", "created_at"], [...store.suggestions.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.photoId,
      record.suggestionType,
      record.suggestedValueJson,
      record.confidence,
      record.explanation,
      record.status,
      record.reviewedBy,
      record.reviewedAt,
      record.createdAt
    ]));

    await insertRows(client, "damage_items", ["id", "inspection_id", "photo_id", "location", "damage_type", "severity", "notes", "source", "confirmed_by", "created_at", "updated_at"], [...store.damageItems.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.photoId,
      record.location,
      record.damageType,
      record.severity,
      record.notes,
      record.source,
      record.confirmedBy,
      record.createdAt,
      record.updatedAt
    ]));

    await insertRows(client, "condition_grades", ["id", "inspection_id", "score", "grade", "explanation_json", "grading_version", "created_at"], [...store.conditionGrades.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.score,
      record.grade,
      record.explanationJson,
      record.gradingVersion,
      record.createdAt
    ]));

    await insertRows(client, "ai_report_jobs", ["id", "inspection_id", "status", "idempotency_key", "error_message", "attempts", "created_at", "updated_at"], [...store.reportJobs.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.status,
      record.idempotencyKey,
      record.errorMessage,
      record.attempts,
      record.createdAt,
      record.updatedAt
    ]));

    await insertRows(client, "ai_report_drafts", ["id", "inspection_id", "job_id", "provider", "prompt_version", "input_summary_json", "output_json", "confidence", "human_review_required", "validation_status", "created_at"], [...store.reportDrafts.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.jobId,
      record.provider,
      record.promptVersion,
      record.inputSummaryJson,
      record.outputJson,
      record.confidence,
      record.humanReviewRequired,
      record.validationStatus,
      record.createdAt
    ]));

    await insertRows(client, "final_reports", ["id", "inspection_id", "report_body", "finalized_by", "finalized_at", "version"], [...store.finalReports.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.reportBody,
      record.finalizedBy,
      record.finalizedAt,
      record.version
    ]));

    await insertRows(client, "audit_events", ["id", "inspection_id", "actor", "event_type", "details_json", "created_at"], [...store.auditEvents.values()].map((record) => [
      record.id,
      record.inspectionId,
      record.actor,
      record.eventType,
      record.detailsJson,
      record.createdAt
    ]));
}

export async function savePostgresSnapshot(store: MemoryStore, pool: Pool): Promise<void> {
  await migratePostgres(pool);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1::bigint)", [SNAPSHOT_MUTATION_LOCK_KEY]);
    await writePostgresSnapshotToClient(store, client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function mutatePostgresSnapshot(
  store: MemoryStore,
  pool: Pool,
  mutation: () => Promise<void>
): Promise<boolean> {
  await migratePostgres(pool);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1::bigint)", [SNAPSHOT_MUTATION_LOCK_KEY]);
    const loaded = await loadPostgresSnapshotFromClient(store, client);
    await mutation();
    await writePostgresSnapshotToClient(store, client);
    await client.query("commit");
    return loaded;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
