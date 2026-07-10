import type { CaptureQuality } from "../types";

export function captureQualityFromSignals(input: {
  width: number;
  height: number;
  brightness: number;
  sharpness: number;
  darkRatio: number;
  brightRatio: number;
}): CaptureQuality {
  const resolutionOk = input.width >= 1280 && input.height >= 720;
  const exposureStatus = input.brightness < 0.2 || input.darkRatio > 0.45
    ? "dark"
    : input.brightness > 0.86 || input.brightRatio > 0.45
      ? "bright"
      : "good";
  const blurStatus = input.sharpness < 0.09 ? "review" : "good";
  const guidance: string[] = [];
  if (!resolutionOk) guidance.push("Move closer and capture at a higher resolution.");
  if (exposureStatus === "dark") guidance.push("Add light or move out of deep shadow.");
  if (exposureStatus === "bright") guidance.push("Reduce glare and keep direct light behind the camera.");
  if (blurStatus === "review") guidance.push("Hold steady, tap the subject to focus, and retake.");
  return {
    width: input.width,
    height: input.height,
    brightness: input.brightness,
    sharpness: input.sharpness,
    resolutionOk,
    exposureStatus,
    blurStatus,
    retakeRequired: !resolutionOk || exposureStatus !== "good" || blurStatus !== "good",
    guidance
  };
}
