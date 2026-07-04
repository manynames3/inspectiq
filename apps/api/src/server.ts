import { createRuntime } from "./runtime.js";

const port = Number(process.env.PORT ?? 4000);
const persistenceMode = process.env.PERSISTENCE_MODE ?? "file";
const runtime = await createRuntime();

process.on("SIGTERM", () => {
  if (runtime.pool) void runtime.pool.end().finally(() => process.exit(0));
  else process.exit(0);
});

process.on("SIGINT", () => {
  if (runtime.pool) void runtime.pool.end().finally(() => process.exit(0));
  else process.exit(0);
});

runtime.app.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    message: "InspectIQ API listening",
    port,
    persistenceMode,
    service: "inspectiq-api"
  }));
});
