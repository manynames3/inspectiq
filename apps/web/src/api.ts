import type { Actor } from "./types.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export const assetUrl = (storageKey: string): string => {
  if (storageKey.startsWith("http")) return storageKey;
  return `${API_BASE}${storageKey}`;
};

export async function api<T>(path: string, options: RequestInit = {}, actor?: Actor): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(actor ? {
        "x-actor-id": actor.id,
        "x-actor-name": actor.name,
        "x-actor-role": actor.role
      } : {}),
      ...(options.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message ?? "API request failed.");
  }
  return body.data as T;
}
