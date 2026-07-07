import type { Actor } from "./types.js";
import { authHeaders, evaluationApiPath } from "./auth.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const apiBase = API_BASE;

export const apiUrl = (path: string): string => `${API_BASE}${evaluationApiPath(path)}`;

export const assetUrl = (storageKey: string): string => {
  const migratedStorageKey = storageKey.startsWith("/sample-images/")
    ? storageKey.replace(/\.svg$/i, ".jpg")
    : storageKey;
  if (migratedStorageKey.startsWith("data:") || migratedStorageKey.startsWith("blob:")) return migratedStorageKey;
  if (migratedStorageKey.startsWith("http")) return migratedStorageKey;
  return `${API_BASE}${evaluationApiPath(migratedStorageKey)}`;
};

export function requestHeaders(actor?: Actor, headers: HeadersInit = {}): Record<string, string> {
  const merged = new Headers(headers);
  if (!merged.has("content-type")) merged.set("content-type", "application/json");
  if (actor) {
    merged.set("x-actor-id", actor.id);
    merged.set("x-actor-name", actor.name);
    merged.set("x-actor-role", actor.role);
  }
  for (const [key, value] of Object.entries(authHeaders())) {
    merged.set(key, value);
  }
  const result: Record<string, string> = {};
  merged.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export async function api<T>(path: string, options: RequestInit = {}, actor?: Actor): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: requestHeaders(actor, options.headers)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message ?? body?.message ?? "API request failed.");
  }
  return body.data as T;
}
