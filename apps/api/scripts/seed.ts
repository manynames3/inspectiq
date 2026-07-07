import { seedStore } from "../src/seedData.js";
import { createPostgresPool } from "../src/postgresPool.js";
import { loadPostgresRows, savePostgresRows } from "../src/postgresPersistence.js";
import { resolveDatabaseUrl } from "../src/runtimeConfig.js";
import { store } from "../src/store.js";
import { loadStoreSnapshot, saveStoreSnapshot } from "../src/storeSnapshot.js";

const persistenceMode = process.env.PERSISTENCE_MODE ?? "file";
let persistedTo = "memory";

if (persistenceMode === "postgres") {
  const databaseUrl = await resolveDatabaseUrl();
  if (!databaseUrl) throw new Error("PERSISTENCE_MODE=postgres requires DATABASE_URL or DATABASE_SECRET_ARN.");
  const pool = createPostgresPool(databaseUrl, "inspectiq-seed");
  try {
    await loadPostgresRows(store, pool);
    seedStore(store);
    await savePostgresRows(store, pool);
    persistedTo = "postgres";
  } finally {
    await pool.end();
  }
} else if (persistenceMode === "file") {
  await loadStoreSnapshot(store);
  seedStore(store);
  await saveStoreSnapshot(store);
  persistedTo = "file";
} else {
  seedStore(store);
}

console.log(JSON.stringify({
  referenceInspections: store.inspections.size,
  referencePhotos: store.photos.size,
  persistedTo,
  note: "Reference vehicles use VIN-specific listing evidence for required angles where public listings expose them. Remaining engine-bay gaps use documented exact-model references."
}, null, 2));
