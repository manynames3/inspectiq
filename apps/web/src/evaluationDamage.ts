import type { DamageItem } from "./types.js";

type SessionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const evaluationDamageStoragePrefix = "inspectiq:evaluation-damage:v1";

export function evaluationDamageStorageKey(inspectionId: string) {
  return `${evaluationDamageStoragePrefix}:${inspectionId}`;
}

function isDamageItem(value: unknown, inspectionId: string): value is DamageItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DamageItem>;
  return item.inspectionId === inspectionId
    && typeof item.id === "string"
    && typeof item.location === "string"
    && typeof item.damageType === "string"
    && typeof item.severity === "string"
    && typeof item.notes === "string"
    && item.source === "evaluation_preview";
}

export function loadEvaluationDamage(storage: SessionStorage, inspectionId: string): DamageItem[] {
  try {
    const value = storage.getItem(evaluationDamageStorageKey(inspectionId));
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => isDamageItem(item, inspectionId)) : [];
  } catch {
    return [];
  }
}

export function saveEvaluationDamage(storage: SessionStorage, inspectionId: string, items: DamageItem[]) {
  try {
    if (items.length === 0) {
      storage.removeItem(evaluationDamageStorageKey(inspectionId));
      return;
    }
    storage.setItem(evaluationDamageStorageKey(inspectionId), JSON.stringify(items));
  } catch {
    // The in-memory preview still works if browser session storage is unavailable.
  }
}
