import { Pool } from "pg";
import { runImageAnalysisJob } from "./imageAnalysisRunner.js";
import { loadPostgresSnapshot, savePostgresSnapshot } from "./postgresPersistence.js";
import { createPostgresPool } from "./postgresPool.js";
import { resolveDatabaseUrl } from "./runtimeConfig.js";
import { store } from "./store.js";
import type { Actor } from "./domain.js";

type SqsRecord = {
  messageId?: string;
  body: string;
};

type SqsEvent = {
  Records?: SqsRecord[];
};

let pool: Pool | null = null;
const workerSnapshotLockKey = "7803144587035695002";

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const databaseUrl = await resolveDatabaseUrl();
  if (!databaseUrl) throw new Error("Image worker requires DATABASE_URL or DATABASE_SECRET_ARN.");
  pool = createPostgresPool(databaseUrl, "inspectiq-image-worker");
  return pool;
}

export async function handler(event: SqsEvent): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> {
  const activePool = await getPool();
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const [index, record] of (event.Records ?? []).entries()) {
    try {
      const message = JSON.parse(record.body) as {
        jobId?: string;
        jobIds?: string[];
        actor?: Actor;
      };
      const jobIds = message.jobIds?.length ? message.jobIds : message.jobId ? [message.jobId] : [];
      if (jobIds.length === 0) throw new Error("Image analysis message did not include jobId or jobIds.");
      const lockClient = await activePool.connect();
      try {
        await lockClient.query("select pg_advisory_lock($1::bigint)", [workerSnapshotLockKey]);
        await loadPostgresSnapshot(store, activePool);
        await Promise.all(jobIds.map((jobId) =>
          runImageAnalysisJob(store, jobId, message.actor ?? {
            id: "image-worker",
            name: "Image Analysis Worker",
            role: "admin"
          })
        ));
        await savePostgresSnapshot(store, activePool);
      } finally {
        await lockClient.query("select pg_advisory_unlock($1::bigint)", [workerSnapshotLockKey]).catch(() => undefined);
        lockClient.release();
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "inspectiq.image_worker.failed",
        message: error instanceof Error ? error.message : "Unknown image worker failure."
      }));
      batchItemFailures.push({ itemIdentifier: record.messageId ?? String(index) });
    }
  }

  return { batchItemFailures };
}
