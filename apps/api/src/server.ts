import { Pool } from "pg";
import { createApp } from "./app.js";
import { loadPostgresSnapshot, savePostgresSnapshot } from "./postgresPersistence.js";
import { store } from "./store.js";
import { loadStoreSnapshot, saveStoreSnapshot } from "./storeSnapshot.js";

const port = Number(process.env.PORT ?? 4000);
const persistenceMode = process.env.PERSISTENCE_MODE ?? "file";
const persistLocally = persistenceMode === "file";
const persistPostgres = persistenceMode === "postgres";
const pool = persistPostgres
  ? new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_SIZE ?? 5),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 5_000)
  })
  : null;

if (persistPostgres && !process.env.DATABASE_URL) {
  throw new Error("PERSISTENCE_MODE=postgres requires DATABASE_URL.");
}

const loadedSnapshot = persistPostgres && pool
  ? await loadPostgresSnapshot(store, pool)
  : persistLocally
    ? await loadStoreSnapshot(store)
    : false;
const app = createApp(store, {
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

process.on("SIGTERM", () => {
  if (pool) void pool.end().finally(() => process.exit(0));
  else process.exit(0);
});

process.on("SIGINT", () => {
  if (pool) void pool.end().finally(() => process.exit(0));
  else process.exit(0);
});

app.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    message: "InspectIQ API listening",
    port,
    persistenceMode,
    service: "inspectiq-api"
  }));
});
