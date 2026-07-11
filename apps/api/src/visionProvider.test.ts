import { describe, expect, it } from "vitest";
import { localVisionProvider } from "./visionProvider.js";

describe("localVisionProvider", () => {
  it("does not invent damage from a clean Honda Accord listing photo", async () => {
    const result = await localVisionProvider.analyze({
      filename: "2020-honda-accord-rear.jpg",
      storageKey: "https://carfax-img.vast.com/carfax/v2/866048677535386941/3/640x480",
      declaredAngle: "rear"
    });

    expect(result.validated.photoAngle).toBe("rear");
    expect(result.validated.confidence).toBe(0.94);
    expect(result.validated.humanReviewRequired).toBe(false);
    expect(result.validated.detectedDamageCandidates).toEqual([]);
  });

  it("keeps the source-documented damage challenge fixture for evaluator coverage", async () => {
    const result = await localVisionProvider.analyze({
      filename: "skoda-roomster-rear-quarter-dent.jpg",
      storageKey: "/sample-images/skoda-roomster-rear-quarter-dent.jpg",
      declaredAngle: "rear"
    });

    expect(result.validated.detectedDamageCandidates).toEqual([
      expect.objectContaining({
        location: "rear bumper lower centre and passenger-side corner",
        damageType: "dent",
        severityEstimate: "moderate",
        repairEstimateUsd: {
          min: 500,
          max: 1200,
          rationale: "Policy range derived from the reviewed damage type and severity; raw model estimate is retained for audit."
        },
        requiresHumanConfirmation: true
      })
    ]);
  });

  it("does not treat the prior clean side-panel fixture as a scratch", async () => {
    const result = await localVisionProvider.analyze({
      filename: "passenger-side-clean.jpg",
      storageKey: "/sample-images/passenger-side-clean.jpg",
      declaredAngle: "passenger_side"
    });

    expect(result.validated.detectedDamageCandidates).toEqual([]);
  });

  it("keeps the source-documented interior wear case distinct from the clean interior control", async () => {
    const result = await localVisionProvider.analyze({
      filename: "interior-wear.jpg",
      storageKey: "/sample-images/interior-wear.jpg",
      declaredAngle: "interior"
    });

    expect(result.validated.detectedDamageCandidates).toEqual([
      expect.objectContaining({
        damageType: "interior_wear",
        severityEstimate: "moderate",
        requiresHumanConfirmation: true
      })
    ]);
  });
});
