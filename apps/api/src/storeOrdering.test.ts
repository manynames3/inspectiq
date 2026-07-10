import { afterEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "./domain.js";
import { MemoryStore } from "./store.js";

const inspector: Actor = { id: "ordering-inspector", name: "Ordering Inspector", role: "inspector" };

function createInspection(store: MemoryStore, vin: string) {
  return store.createInspection({
    vin,
    year: 2024,
    make: "Test",
    model: "Vehicle",
    trim: "Base",
    mileage: 1,
    exteriorColor: "White",
    sellerSource: "Test lane",
    inspectorName: inspector.name,
  }, inspector);
}

describe("MemoryStore clock and ordering", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses an explicit fixed clock only when requested by test infrastructure", () => {
    vi.stubEnv("INSPECTIQ_FIXED_NOW", "2026-07-10T16:25:18.000Z");
    const store = new MemoryStore();

    expect(createInspection(store, "FIXEDCLOCK0000001").createdAt).toBe("2026-07-10T16:25:18.000Z");
  });

  it("orders equal update timestamps by VIN for deterministic queues", () => {
    const store = new MemoryStore();
    const second = createInspection(store, "ZZZZZZZZZZZZZZZZZ");
    const first = createInspection(store, "AAAAAAAAAAAAAAAAA");
    second.updatedAt = "2026-07-10T16:25:18.000Z";
    first.updatedAt = "2026-07-10T16:25:18.000Z";

    expect(store.listInspections().map((inspection) => inspection.vin)).toEqual([
      "AAAAAAAAAAAAAAAAA",
      "ZZZZZZZZZZZZZZZZZ",
    ]);
  });
});
