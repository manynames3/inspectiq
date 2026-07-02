import type { PhotoAngle } from "@inspectiq/shared";

export type SampleImage = {
  key: string;
  filename: string;
  label: string;
  angle: PhotoAngle;
  mimeType: string;
};

export const sampleImages: SampleImage[] = [
  { key: "front-clean", filename: "front-clean.svg", label: "Front clean", angle: "front", mimeType: "image/svg+xml" },
  { key: "rear-severe-damage", filename: "rear-severe-damage.svg", label: "Rear severe damage", angle: "rear", mimeType: "image/svg+xml" },
  { key: "odometer-64231", filename: "odometer-64231.svg", label: "Odometer 64,231", angle: "odometer", mimeType: "image/svg+xml" },
  { key: "vin-plate", filename: "vin-plate.svg", label: "VIN plate", angle: "vin_plate", mimeType: "image/svg+xml" },
  { key: "driver-side-scratch", filename: "driver-side-scratch.svg", label: "Driver side scratch", angle: "driver_side", mimeType: "image/svg+xml" },
  { key: "passenger-side-clean", filename: "passenger-side-clean.svg", label: "Passenger side clean", angle: "passenger_side", mimeType: "image/svg+xml" },
  { key: "interior-wear", filename: "interior-wear.svg", label: "Interior wear", angle: "interior", mimeType: "image/svg+xml" },
  { key: "engine-bay-clean", filename: "engine-bay-clean.svg", label: "Engine bay clean", angle: "engine_bay", mimeType: "image/svg+xml" },
  { key: "blurry-front", filename: "blurry-front.svg", label: "Blurry front retake", angle: "front", mimeType: "image/svg+xml" }
];

export const sampleBundles: Record<string, string[]> = {
  "complete-clean-set": [
    "front-clean",
    "rear-severe-damage",
    "odometer-64231",
    "vin-plate",
    "driver-side-scratch",
    "passenger-side-clean",
    "interior-wear",
    "engine-bay-clean"
  ]
};

export function findSampleImage(sampleKey: string): SampleImage | undefined {
  return sampleImages.find((sample) => sample.key === sampleKey);
}

