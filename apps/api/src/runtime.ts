import { Pool } from "pg";
import { createApp } from "./app.js";
import { loadPostgresRows, savePostgresRows } from "./postgresPersistence.js";
import { createPostgresPool } from "./postgresPool.js";
import { resolveDatabaseUrl } from "./runtimeConfig.js";
import { reconcileReferenceEvidence } from "./seedData.js";
import { store } from "./store.js";
import { loadStoreSnapshot, saveStoreSnapshot } from "./storeSnapshot.js";
import { flushPendingDomainEvents } from "./awsEvents.js";

export type Runtime = {
  app: ReturnType<typeof createApp>;
  pool: Pool | null;
};

let runtimePromise: Promise<Runtime> | null = null;

export function shouldPersistInitialStore(
  persistenceMode: string,
  loadedStore: boolean,
  reconciledReferenceEvidence: boolean,
): boolean {
  if (persistenceMode === "postgres") return !loadedStore;
  return !loadedStore || reconciledReferenceEvidence;
}

export async function createRuntime(): Promise<Runtime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const persistenceMode = process.env.PERSISTENCE_MODE ?? "file";
    const persistLocally = persistenceMode === "file";
    const persistPostgres = persistenceMode === "postgres";
    const databaseUrl = await resolveDatabaseUrl();

    if (persistPostgres && !databaseUrl) {
      throw new Error("PERSISTENCE_MODE=postgres requires DATABASE_URL or DATABASE_SECRET_ARN.");
    }

    const pool = persistPostgres && databaseUrl ? createPostgresPool(databaseUrl, "inspectiq-api") : null;

    const loadedStore = persistPostgres && pool
      ? await loadPostgresRows(store, pool)
      : persistLocally
        ? await loadStoreSnapshot(store)
        : false;
    const reconciledReferenceEvidence = reconcileReferenceEvidence(store);

    const app = createApp(store, {
      beforeRequest: persistPostgres && pool
        ? async () => {
          await loadPostgresRows(store, pool);
          reconcileReferenceEvidence(store);
        }
        : undefined,
      afterMutation: persistPostgres && pool
        ? async () => {
          await savePostgresRows(store, pool);
          await flushPendingDomainEvents(store);
          await savePostgresRows(store, pool);
        }
        : persistLocally
          ? async () => {
            await flushPendingDomainEvents(store);
            await saveStoreSnapshot(store);
          }
          : undefined
    });

    if (persistPostgres && pool && shouldPersistInitialStore(persistenceMode, loadedStore, reconciledReferenceEvidence)) {
      await savePostgresRows(store, pool);
    }
    if (persistLocally && shouldPersistInitialStore(persistenceMode, loadedStore, reconciledReferenceEvidence)) {
      await saveStoreSnapshot(store);
    }

    return { app, pool };
  })();
  return runtimePromise;
}
