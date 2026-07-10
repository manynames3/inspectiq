import type { UploadOperation } from "../types";

export function nextAttempt(attempts: number, nowMs = Date.now()): string {
  const delayMs = Math.min(300_000, 2_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(nowMs + delayMs).toISOString();
}

export function shouldAttempt(operation: UploadOperation, nowMs = Date.now()): boolean {
  if (operation.status === "blocked" || operation.status === "uploaded") return false;
  if (operation.attempts >= 5) return false;
  return !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= nowMs;
}
