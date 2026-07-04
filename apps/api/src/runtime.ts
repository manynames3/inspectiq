import { Pool } from "pg";
import { createApp } from "./app.js";
import { loadPostgresSnapshot, savePostgresSnapshot } from "./postgresPersistence.js";
import { createPostgresPool } from "./postgresPool.js";
import { resolveDatabaseUrl } from "./runtimeConfig.js";
import { store } from "./store.js";
import { loadStoreSnapshot, saveStoreSnapshot } from "./storeSnapshot.js";

export type Runtime = {
  app: ReturnType<typeof createApp>;
  pool: Pool | null;
};

let runtimePromise: Promise<Runtime> | null = null;

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

    const loadedSnapshot = persistPostgres && pool
      ? await loadPostgresSnapshot(store, pool)
      : persistLocally
        ? await loadStoreSnapshot(store)
        : false;

    const app = createApp(store, {
      beforeRequest: persistPostgres && pool
        ? async () => {
          await loadPostgresSnapshot(store, pool);
        }
        : undefined,
      afterMutation: persistPostgres && pool
        ? () => savePostgresSnapshot(store, pool)
        : persistLocally
          ? () => saveStoreSnapshot(store)
          : undefined
    });

    if (persistPostgres && pool && !loadedSnapshot) {
      await savePostgresSnapshot(store, pool);
    }
    if (persistLocally && !loadedSnapshot) {
      await saveStoreSnapshot(store);
    }

    return { app, pool };
  })();
  return runtimePromise;
}
