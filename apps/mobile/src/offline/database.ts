import { File } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import type { MobileBootstrap, InspectionBundle, UploadOperation } from "../types";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("inspectiq-mobile.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS cached_inspections (
          id TEXT PRIMARY KEY NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS upload_operations (
          id TEXT PRIMARY KEY NOT NULL,
          inspection_id TEXT NOT NULL,
          declared_angle TEXT NOT NULL,
          file_uri TEXT NOT NULL,
          checksum_sha256 TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          quality_json TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          next_attempt_at TEXT,
          created_at TEXT NOT NULL,
          uploaded_photo_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_upload_operations_sync
          ON upload_operations (status, next_attempt_at, created_at);
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return databasePromise;
}

type OperationRow = {
  id: string;
  inspection_id: string;
  declared_angle: UploadOperation["declaredAngle"];
  file_uri: string;
  checksum_sha256: string;
  byte_size: number;
  width: number;
  height: number;
  quality_json: string;
  status: UploadOperation["status"];
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  uploaded_photo_id: string | null;
};

function operationFromRow(row: OperationRow): UploadOperation {
  return {
    id: row.id,
    inspectionId: row.inspection_id,
    declaredAngle: row.declared_angle,
    fileUri: row.file_uri,
    checksumSha256: row.checksum_sha256,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    quality: JSON.parse(row.quality_json) as UploadOperation["quality"],
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    uploadedPhotoId: row.uploaded_photo_id
  };
}

export async function cacheBootstrap(bootstrap: MobileBootstrap): Promise<void> {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const bundle of bootstrap.inspections) {
      await transaction.runAsync(
        `INSERT INTO cached_inspections (id, payload_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
        bundle.inspection.id,
        JSON.stringify(bundle),
        bundle.inspection.updatedAt
      );
    }
    await transaction.runAsync(
      `INSERT INTO sync_state (key, value) VALUES ('bootstrap_cursor', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      bootstrap.cursor
    );
  });
}

export async function bootstrapCursor(): Promise<string | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_state WHERE key = 'bootstrap_cursor'");
  return row?.value ?? null;
}

export async function cachedInspectionBundles(): Promise<InspectionBundle[]> {
  const db = await database();
  const rows = await db.getAllAsync<{ payload_json: string }>(
    "SELECT payload_json FROM cached_inspections ORDER BY updated_at DESC"
  );
  return rows.map((row) => JSON.parse(row.payload_json) as InspectionBundle);
}

export async function cachedInspectionBundle(inspectionId: string): Promise<InspectionBundle | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload_json: string }>(
    "SELECT payload_json FROM cached_inspections WHERE id = ?",
    inspectionId
  );
  return row ? JSON.parse(row.payload_json) as InspectionBundle : null;
}

export async function queueUploadOperation(operation: UploadOperation): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO upload_operations (
      id, inspection_id, declared_angle, file_uri, checksum_sha256, byte_size, width, height,
      quality_json, status, attempts, last_error, next_attempt_at, created_at, uploaded_photo_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO NOTHING`,
    operation.id,
    operation.inspectionId,
    operation.declaredAngle,
    operation.fileUri,
    operation.checksumSha256,
    operation.byteSize,
    operation.width,
    operation.height,
    JSON.stringify(operation.quality),
    operation.status,
    operation.attempts,
    operation.lastError,
    operation.nextAttemptAt,
    operation.createdAt,
    operation.uploadedPhotoId
  );
}

export async function uploadOperations(includeCompleted = false): Promise<UploadOperation[]> {
  const db = await database();
  const where = includeCompleted ? "" : "WHERE status != 'uploaded'";
  const rows = await db.getAllAsync<OperationRow>(
    `SELECT * FROM upload_operations ${where} ORDER BY created_at`
  );
  return rows.map(operationFromRow);
}

export async function updateUploadOperation(
  operationId: string,
  patch: Partial<Pick<UploadOperation, "status" | "attempts" | "lastError" | "nextAttemptAt" | "uploadedPhotoId">>
): Promise<void> {
  const db = await database();
  const current = await db.getFirstAsync<OperationRow>("SELECT * FROM upload_operations WHERE id = ?", operationId);
  if (!current) return;
  const operation = operationFromRow(current);
  const next = { ...operation, ...patch };
  await db.runAsync(
    `UPDATE upload_operations
     SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ?, uploaded_photo_id = ?
     WHERE id = ?`,
    next.status,
    next.attempts,
    next.lastError,
    next.nextAttemptAt,
    next.uploadedPhotoId,
    operationId
  );
}

export async function removeUploadOperation(operationId: string, removeFile = true): Promise<void> {
  const db = await database();
  const row = await db.getFirstAsync<{ file_uri: string }>("SELECT file_uri FROM upload_operations WHERE id = ?", operationId);
  await db.runAsync("DELETE FROM upload_operations WHERE id = ?", operationId);
  if (removeFile && row?.file_uri) {
    const file = new File(row.file_uri);
    if (file.exists) file.delete();
  }
}

export async function clearOfflineData(options: { removeFiles: boolean }): Promise<void> {
  const db = await database();
  const files = options.removeFiles
    ? await db.getAllAsync<{ file_uri: string }>("SELECT file_uri FROM upload_operations")
    : [];
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync("DELETE FROM cached_inspections");
    await transaction.runAsync("DELETE FROM upload_operations");
    await transaction.runAsync("DELETE FROM sync_state");
  });
  for (const row of files) {
    const file = new File(row.file_uri);
    if (file.exists) file.delete();
  }
}
