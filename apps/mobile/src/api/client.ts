import { mobileConfig } from "../config";
import type { MobileSession } from "../types";

export class MobileApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

function apiPath(path: string, session: MobileSession): string {
  return session.mode === "evaluation" ? path.replace(/^\/api(?=\/|$)/, "/api/evaluation") : path;
}

export async function mobileApi<T>(
  path: string,
  session: MobileSession,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (session.mode === "evaluation" && !["GET", "HEAD"].includes(method)) {
    throw new MobileApiError(403, "EVALUATION_READ_ONLY", "Evaluation Workspace is read-only.");
  }
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  headers.set("x-request-id", `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  if (session.idToken) headers.set("authorization", `Bearer ${session.idToken}`);
  if (session.mode === "evaluation") headers.set("x-evaluation-mode", "true");
  const response = await fetch(`${mobileConfig.apiBaseUrl}${apiPath(path, session)}`, {
    ...options,
    headers
  });
  const body = await response.json().catch(() => null) as {
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!response.ok) {
    throw new MobileApiError(
      response.status,
      body?.error?.code ?? "API_REQUEST_FAILED",
      body?.error?.message ?? "The API request failed.",
      body?.error?.details
    );
  }
  return body?.data as T;
}
