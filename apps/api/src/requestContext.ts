import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  correlationId: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(correlationId: string, callback: () => T): T {
  return storage.run({ correlationId }, callback);
}

export function currentCorrelationId(): string {
  return storage.getStore()?.correlationId ?? crypto.randomUUID();
}
