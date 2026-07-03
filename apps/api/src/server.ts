import { createApp } from "./app.js";
import { store } from "./store.js";
import { loadStoreSnapshot, saveStoreSnapshot } from "./storeSnapshot.js";

const port = Number(process.env.PORT ?? 4000);
const persistenceMode = process.env.PERSISTENCE_MODE ?? "file";
const persistLocally = persistenceMode === "file";

const loadedSnapshot = persistLocally ? await loadStoreSnapshot(store) : false;
const app = createApp(store, {
  afterMutation: persistLocally ? () => saveStoreSnapshot(store) : undefined
});

if (persistLocally && !loadedSnapshot) {
  await saveStoreSnapshot(store);
}

app.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    message: "InspectIQ API listening",
    port,
    persistenceMode,
    service: "inspectiq-api"
  }));
});
