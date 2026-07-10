import { describe, expect, it } from "vitest";
import { shouldPersistInitialStore } from "./runtime.js";

describe("runtime persistence bootstrap", () => {
  it("does not write repaired reference evidence during a loaded Postgres cold start", () => {
    expect(shouldPersistInitialStore("postgres", true, true)).toBe(false);
  });

  it("initializes an empty Postgres store", () => {
    expect(shouldPersistInitialStore("postgres", false, false)).toBe(true);
  });

  it("persists local reference reconciliation", () => {
    expect(shouldPersistInitialStore("file", true, true)).toBe(true);
  });
});
