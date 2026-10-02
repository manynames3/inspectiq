import { describe, expect, it } from "vitest";
import type { DamageItem } from "./types.js";
import { evaluationDamageStorageKey, loadEvaluationDamage, saveEvaluationDamage } from "./evaluationDamage.js";

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

const previewDamage: DamageItem = {
  id: "evaluation-damage-1",
  inspectionId: "inspection-1",
  photoId: null,
  location: "driver-side front door",
  damageType: "scratch",
  severity: "minor",
  notes: "Evaluation session preview.",
  source: "evaluation_preview"
};

describe("evaluation damage session storage", () => {
  it("stores and restores preview damage for one inspection", () => {
    const storage = fakeStorage();
    saveEvaluationDamage(storage, "inspection-1", [previewDamage]);

    expect(loadEvaluationDamage(storage, "inspection-1")).toEqual([previewDamage]);
    expect(loadEvaluationDamage(storage, "inspection-2")).toEqual([]);
  });

  it("ignores malformed and non-preview records", () => {
    const storage = fakeStorage();
    storage.setItem(evaluationDamageStorageKey("inspection-1"), JSON.stringify([
      previewDamage,
      { ...previewDamage, id: 42 },
      { ...previewDamage, source: "manual" }
    ]));

    expect(loadEvaluationDamage(storage, "inspection-1")).toEqual([previewDamage]);
  });

  it("removes the session entry when the preview is cleared", () => {
    const storage = fakeStorage();
    saveEvaluationDamage(storage, "inspection-1", [previewDamage]);
    saveEvaluationDamage(storage, "inspection-1", []);

    expect(storage.getItem(evaluationDamageStorageKey("inspection-1"))).toBeNull();
  });
});
