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

  it("keeps the explicitly labeled damage challenge fixture for evaluator coverage", async () => {
    const result = await localVisionProvider.analyze({
      filename: "rear-severe-damage.jpg",
      storageKey: "/sample-images/rear-severe-damage.jpg",
      declaredAngle: "rear"
    });

    expect(result.validated.detectedDamageCandidates).toEqual([
      expect.objectContaining({
        location: "rear bumper",
        damageType: "dent",
        severityEstimate: "severe",
        requiresHumanConfirmation: true
      })
    ]);
  });
});
