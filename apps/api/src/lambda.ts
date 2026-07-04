import { configure } from "@codegenie/serverless-express";
import { createRuntime } from "./runtime.js";

let proxy: ReturnType<typeof configure> | null = null;

export async function handler(event: unknown, context: unknown): Promise<unknown> {
  if (!proxy) {
    const runtime = await createRuntime();
    proxy = configure({ app: runtime.app });
  }
  return proxy(event, context);
}
