import { describe, expect, it } from "vitest";
import { requiredPhotoAngles } from "@inspectiq/shared";
import { findSampleImage, samplePhotoSets } from "./sampleImages.js";
import { reconcileReferenceEvidence, seedStore } from "./seedData.js";
import { MemoryStore } from "./store.js";

describe("reference evidence reconciliation", () => {
  it("keeps each vehicle reference set mapped to one image per required angle", () => {
    for (const set of samplePhotoSets) {
      const angles = set.sampleKeys.map((sampleKey) => {
        const sample = findSampleImage(sampleKey);
        expect(sample, `Missing sample ${sampleKey} in ${set.key}`).toBeTruthy();
        return sample!.angle;
      });

      expect(new Set(angles).size, `${set.key} should not duplicate angle slots`).toBe(angles.length);
      expect([...angles].sort()).toEqual([...requiredPhotoAngles].sort());
    }
  });

  it("repairs stale Honda Accord passenger-side sample evidence", () => {
    const store = new MemoryStore();
    seedStore(store);
    const honda = [...store.inspections.values()].find((inspection) => inspection.vin === "1HGCV1F49LA129627");
    expect(honda).toBeTruthy();

    const passengerPhoto = [...store.photos.values()].find((photo) =>
      photo.inspectionId === honda?.id &&
      photo.objectKey === "sample-images/honda-accord-passenger-side"
    );
    expect(passengerPhoto).toBeTruthy();

    passengerPhoto!.storageKey = "https://carfax-img.vast.com/carfax/v2/866048677535386941/8/640x480";
    passengerPhoto!.thumbnailStorageKey = passengerPhoto!.storageKey;
    passengerPhoto!.detectedAngleConfidence = 0.82;
    passengerPhoto!.qualityStatus = "warning";

    expect(reconcileReferenceEvidence(store)).toBe(true);

    expect(passengerPhoto!.storageKey).toBe("https://carfax-img.vast.com/carfax/v2/866048677535386941/1/640x480");
    expect(passengerPhoto!.declaredAngle).toBe("passenger_side");
    expect(passengerPhoto!.detectedAngle).toBe("passenger_side");
    expect(passengerPhoto!.detectedAngleConfidence).toBe(0.94);
    expect(passengerPhoto!.qualityStatus).toBe("ok");
  });
});
