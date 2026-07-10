import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./store.js";
import { loadStoreSnapshot, saveStoreSnapshot } from "./storeSnapshot.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local store snapshots", () => {
  it("preserves accepted VIN and odometer identity verifications across restart", async () => {
    const source = new MemoryStore();
    const verification = {
      id: "identity-verification-1",
      inspectionId: "inspection-1",
      photoId: "photo-1",
      field: "vin" as const,
      value: "1HGBH41JXMN109186",
      sourceSuggestionId: "suggestion-1",
      verifiedBy: "reviewer-1",
      verifiedAt: "2026-07-09T12:00:00.000Z"
    };
    source.identityVerifications.set(verification.id, verification);

    const directory = await mkdtemp(path.join(tmpdir(), "inspectiq-store-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "store.json");
    await saveStoreSnapshot(source, filePath);

    const restored = new MemoryStore();
    expect(await loadStoreSnapshot(restored, filePath)).toBe(true);
    expect(restored.identityVerifications.get(verification.id)).toEqual(verification);
  });
});
