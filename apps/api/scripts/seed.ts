import { seedStore } from "../src/seedData.js";
import { store } from "../src/store.js";

seedStore(store);
console.log(JSON.stringify({
  seededInspections: store.inspections.size,
  seededPhotos: store.photos.size,
  note: "The in-memory inspection store is seeded at API startup. For Postgres, run apps/api/src/db/schema.sql and adapt this script to DATABASE_URL."
}, null, 2));
