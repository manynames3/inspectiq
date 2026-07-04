import { existsSync } from "node:fs";
import path from "node:path";
import type { PhotoAngle } from "@inspectiq/shared";

export type SampleImage = {
  key: string;
  filename: string;
  label: string;
  angle: PhotoAngle;
  mimeType: string;
};

export const sampleImages: SampleImage[] = [
  { key: "front-clean", filename: "front-clean.jpg", label: "Front clean", angle: "front", mimeType: "image/jpeg" },
  { key: "rear-severe-damage", filename: "rear-severe-damage.jpg", label: "Rear damage", angle: "rear", mimeType: "image/jpeg" },
  { key: "odometer-64231", filename: "odometer-64231.jpg", label: "Odometer 64,231", angle: "odometer", mimeType: "image/jpeg" },
  { key: "vin-plate", filename: "vin-plate.jpg", label: "VIN/license plate", angle: "vin_plate", mimeType: "image/jpeg" },
  { key: "driver-side-scratch", filename: "driver-side-scratch.jpg", label: "Driver side scratch", angle: "driver_side", mimeType: "image/jpeg" },
  { key: "passenger-side-clean", filename: "passenger-side-clean.jpg", label: "Passenger side clean", angle: "passenger_side", mimeType: "image/jpeg" },
  { key: "interior-wear", filename: "interior-wear.jpg", label: "Interior wear", angle: "interior", mimeType: "image/jpeg" },
  { key: "engine-bay-clean", filename: "engine-bay-clean.jpg", label: "Engine bay clean", angle: "engine_bay", mimeType: "image/jpeg" },
  { key: "blurry-front", filename: "blurry-front.jpg", label: "Blurry front retake", angle: "front", mimeType: "image/jpeg" }
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

export function sampleImageDirectory(): string {
  const candidates = [
    process.env.SAMPLE_IMAGE_DIR,
    path.resolve(process.cwd(), "sample-images"),
    path.resolve(process.cwd(), "sample-data/images"),
    path.resolve(process.cwd(), "../../sample-data/images")
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 1];
}

export function sampleImageFilePath(filename: string): string {
  return path.join(sampleImageDirectory(), path.basename(filename));
}
