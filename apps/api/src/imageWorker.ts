import { Pool } from "pg";
import { runImageAnalysisJob } from "./imageAnalysisRunner.js";
import { mutatePostgresRows } from "./postgresPersistence.js";
import { createPostgresPool } from "./postgresPool.js";
import { resolveDatabaseUrl } from "./runtimeConfig.js";
import { store } from "./store.js";
import type { Actor } from "./domain.js";
import { flushPendingDomainEvents } from "./awsEvents.js";
import { savePostgresRows } from "./postgresPersistence.js";
import { runWithRequestContext } from "./requestContext.js";

type SqsRecord = {
  messageId?: string;
  body: string;
};

type SqsEvent = {
  Records?: SqsRecord[];
};

let pool: Pool | null = null;

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
        correlationId?: string;
      };
      const jobIds = message.jobIds?.length ? message.jobIds : message.jobId ? [message.jobId] : [];
      if (jobIds.length === 0) throw new Error("Image analysis message did not include jobId or jobIds.");
      const correlationId = message.correlationId ?? record.messageId ?? crypto.randomUUID();
      await runWithRequestContext(correlationId, async () => {
        await mutatePostgresRows(store, activePool, async () => {
          await Promise.all(jobIds.map((jobId) =>
            runImageAnalysisJob(store, jobId, message.actor ?? {
              id: "image-worker",
              name: "Image Analysis Worker",
              role: "admin"
            })
          ));
        });
        await flushPendingDomainEvents(store);
        await savePostgresRows(store, activePool);
      });
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "inspectiq.image_worker.failed",
        correlationId: record.messageId ?? null,
        message: error instanceof Error ? error.message : "Unknown image worker failure."
      }));
      batchItemFailures.push({ itemIdentifier: record.messageId ?? String(index) });
    }
  }

  return { batchItemFailures };
}
