import { describe, expect, it } from "vitest";
import { localVisionProvider } from "./visionProvider.js";

describe("localVisionProvider", () => {
  it("flags the Honda Accord rear listing photo as a reviewer-confirmed damage candidate", async () => {
    const result = await localVisionProvider.analyze({
      filename: "2020-honda-accord-rear.jpg",
      storageKey: "https://carfax-img.vast.com/carfax/v2/866048677535386941/3/640x480",
      declaredAngle: "rear"
    });

    expect(result.validated.photoAngle).toBe("rear");
    expect(result.validated.confidence).toBe(0.94);
    expect(result.validated.humanReviewRequired).toBe(true);
    expect(result.validated.detectedDamageCandidates).toEqual([
      expect.objectContaining({
        location: "rear bumper",
        damageType: "dent",
        severityEstimate: "moderate",
        confidence: 0.87,
        requiresHumanConfirmation: true
      })
    ]);
  });
});
