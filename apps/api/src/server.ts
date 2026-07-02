import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    message: "InspectIQ API listening",
    port,
    service: "inspectiq-api"
  }));
});

