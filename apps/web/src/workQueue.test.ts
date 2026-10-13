import { describe, expect, it } from "vitest";
import { inspectionNextStep, inspectionPriority } from "./workQueue.js";
import type { Inspection } from "./types.js";
const vehicle = { status: "READY_FOR_GRADING", completenessPercentage: 100 } as Inspection;
describe("work queue action hierarchy", () => {
  it("does not call ungraded or exception-bearing vehicles ready for release", () => {
    expect(inspectionNextStep(vehicle)).toBe("Review condition grade");
    expect(inspectionNextStep({ ...vehicle, readinessIssueCount: 2 })).toBe("Resolve 2 exceptions");
  });
  it("prioritizes failures and incomplete evidence over released records", () => {
    expect(inspectionPriority({ ...vehicle, status: "REPORT_FAILED" })).toBeGreaterThan(inspectionPriority(vehicle));
    expect(inspectionNextStep({ ...vehicle, completenessPercentage: 50 })).toBe("Complete photo evidence");
    expect(inspectionPriority({ ...vehicle, status: "FINALIZED" })).toBe(0);
  });
});
