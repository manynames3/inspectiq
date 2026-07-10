import { toByteArray } from "base64-js";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import jpeg from "jpeg-js";
import type { RequiredPhotoAngle } from "@inspectiq/shared";
import type { CaptureQuality, UploadOperation } from "../types";
import { captureQualityFromSignals } from "./qualityPolicy";

function luminance(red: number, green: number, blue: number): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function pixelMetrics(base64: string): { brightness: number; sharpness: number; darkRatio: number; brightRatio: number } {
  const decoded = jpeg.decode(toByteArray(base64), { useTArray: true, formatAsRGBA: true });
  const step = Math.max(2, Math.floor(Math.min(decoded.width, decoded.height) / 120));
  let count = 0;
  let brightnessTotal = 0;
  let dark = 0;
  let bright = 0;
  let sharpnessTotal = 0;
  let sharpnessCount = 0;
  const at = (x: number, y: number): number => {
    const offset = (y * decoded.width + x) * 4;
    return luminance(decoded.data[offset], decoded.data[offset + 1], decoded.data[offset + 2]);
  };
  for (let y = step; y < decoded.height - step; y += step) {
    for (let x = step; x < decoded.width - step; x += step) {
      const center = at(x, y);
      brightnessTotal += center;
      if (center < 0.08) dark += 1;
      if (center > 0.94) bright += 1;
      count += 1;
      const laplacian = Math.abs(4 * center - at(x - step, y) - at(x + step, y) - at(x, y - step) - at(x, y + step));
      sharpnessTotal += laplacian;
      sharpnessCount += 1;
    }
  }
  const brightness = count ? brightnessTotal / count : 0;
  const darkRatio = count ? dark / count : 1;
  const brightRatio = count ? bright / count : 0;
  const sharpness = sharpnessCount ? sharpnessTotal / sharpnessCount : 0;
  return {
    brightness,
    sharpness,
    darkRatio,
    brightRatio
  };
}

export async function evaluateCapture(uri: string, width: number, height: number): Promise<CaptureQuality> {
  const previewContext = ImageManipulator.manipulate(uri);
  if (width > 640) previewContext.resize({ width: 640 });
  const preview = await (await previewContext.renderAsync()).saveAsync({
    base64: true,
    compress: 0.7,
    format: SaveFormat.JPEG
  });
  if (!preview.base64) throw new Error("Could not create a local quality preview.");
  return captureQualityFromSignals({
    width,
    height,
    ...pixelMetrics(preview.base64)
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function prepareCapture(input: {
  sourceUri: string;
  sourceWidth: number;
  sourceHeight: number;
  inspectionId: string;
  angle: RequiredPhotoAngle;
  operationId: string;
}): Promise<UploadOperation> {
  const quality = await evaluateCapture(input.sourceUri, input.sourceWidth, input.sourceHeight);
  const context = ImageManipulator.manipulate(input.sourceUri);
  if (input.sourceWidth > 2048) context.resize({ width: 2048 });
  const normalized = await (await context.renderAsync()).saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  const directory = new Directory(Paths.document, "inspectiq", "captures", input.inspectionId);
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, `${input.operationId}-${input.angle}.jpg`);
  await new File(normalized.uri).copy(destination);
  const bytes = await destination.bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return {
    id: input.operationId,
    inspectionId: input.inspectionId,
    declaredAngle: input.angle,
    fileUri: destination.uri,
    checksumSha256: bytesToHex(new Uint8Array(digest)),
    byteSize: destination.size,
    width: normalized.width,
    height: normalized.height,
    quality,
    status: quality.retakeRequired ? "blocked" : "queued",
    attempts: 0,
    lastError: quality.retakeRequired ? quality.guidance.join(" ") : null,
    nextAttemptAt: null,
    createdAt: new Date().toISOString(),
    uploadedPhotoId: null
  };
}
