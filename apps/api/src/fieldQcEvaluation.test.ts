import { describe, expect, it } from "vitest";
import { evaluateFieldQc, type FieldQcEvaluation } from "./fieldQcEvaluation.js";

// Synthetic test inputs exercise arithmetic/guards only. They are not accuracy results.
const manifest = (): FieldQcEvaluation => ({
  schemaVersion: 1, runId: "synthetic-unit-test",
  model: { provider: "bedrock", modelId: "unit-test-not-real", promptVersion: "test-v1", codeCommit: "abcdef1", startedAt: "2026-09-02T00:00:00Z", completedAt: "2026-09-02T01:00:00Z" },
  groundTruth: { labeler: "labeler", adjudicator: "independent", blindToPredictions: true, lockedAt: "2026-09-01T00:00:00Z", protocolReference: "synthetic-unit-test" },
  tuningVehicleIds: [], tuningPhotoSha256: [],
  vehicles: [{
    vehicleId: "car-a",
    photos: [{ photoId: "photo-a", sha256: "a".repeat(64), rightsBasis: "owned", rightsReference: "synthetic-unit-test" }],
    truth: [{ id: "dent-a", category: "dent", location: "rear bumper", obvious: true, visibleInPhotoIds: ["photo-a"] }],
    predictions: [{ id: "prediction-a", category: "dent", photoId: "photo-a", matchedTruthId: "dent-a" }],
    unableToAssessPhotoIds: [],
    timing: { baselineReviewer: "one", assistedReviewer: "two", baselineSeconds: 120, assistedSeconds: 90, baselineMisses: 0, assistedMisses: 1 }
  }]
});
describe("field-QC evaluation mechanics (not real detection evidence)", () => {
  it("reports denominators and uncertainty; one perfect detection is not validation", () => {
    const result = evaluateFieldQc(manifest());
    expect(result.recall?.point).toBe(1);
    expect(result.recall?.lower95).toBeLessThan(0.95);
    expect(result.pointTargetsMet).toBe(false);
    expect(result.reviewerTime?.savedFraction).toBe(0.25);
    expect(result.reviewerTime?.qualityGuardrailMet).toBe(false);
  });
  it("counts duplicate predictions as false positives", () => {
    const input = manifest();
    input.vehicles[0].predictions.push({ ...input.vehicles[0].predictions[0], id: "duplicate" });
    expect(evaluateFieldQc(input).precision?.point).toBe(0.5);
  });
  it("counts visible missed damage even when the model abstains", () => {
    const input = manifest();
    input.vehicles[0].predictions = [];
    input.vehicles[0].unableToAssessPhotoIds = ["photo-a"];
    expect(evaluateFieldQc(input).recall?.point).toBe(0);
  });
  it("rejects tuning leakage, reused photos, and labels written after predictions", () => {
    const leaked = manifest(); leaked.tuningVehicleIds = ["car-a"];
    expect(() => evaluateFieldQc(leaked)).toThrow(/overlaps/);
    const duplicate = manifest(); duplicate.vehicles.push({ ...duplicate.vehicles[0], vehicleId: "car-b" });
    expect(() => evaluateFieldQc(duplicate)).toThrow(/Duplicate/);
    const late = manifest(); late.groundTruth.lockedAt = "2026-09-03T00:00:00Z";
    expect(() => evaluateFieldQc(late)).toThrow(/Lock/);
  });
  it("rejects fixture providers and unsupported evidence matches", () => {
    const fixture = manifest(); fixture.model.provider = "localVisionProvider";
    expect(() => evaluateFieldQc(fixture)).toThrow(/not field/);
    const invalid = manifest(); invalid.vehicles[0].predictions[0].matchedTruthId = "invented";
    expect(() => evaluateFieldQc(invalid)).toThrow(/unknown ground/);
  });
});
