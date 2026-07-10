import type { UploadOperation } from "../types";
import { nextAttempt, shouldAttempt } from "./retryPolicy";

function operation(patch: Partial<UploadOperation> = {}): UploadOperation {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    inspectionId: "22222222-2222-4222-8222-222222222222",
    declaredAngle: "front",
    fileUri: "file:///capture.jpg",
    checksumSha256: "a".repeat(64),
    byteSize: 1024,
    width: 1600,
    height: 1200,
    quality: { width: 1600, height: 1200, brightness: 0.5, sharpness: 0.2, resolutionOk: true, exposureStatus: "good", blurStatus: "good", retakeRequired: false, guidance: [] },
    status: "queued",
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    createdAt: "2026-07-09T12:00:00.000Z",
    uploadedPhotoId: null,
    ...patch
  };
}

describe("offline retry policy", () => {
  it("queues a new operation immediately", () => expect(shouldAttempt(operation(), 1000)).toBe(true));
  it("does not retry completed or explicitly blocked operations", () => {
    expect(shouldAttempt(operation({ status: "uploaded" }))).toBe(false);
    expect(shouldAttempt(operation({ status: "blocked" }))).toBe(false);
  });
  it("stops after five bounded attempts", () => expect(shouldAttempt(operation({ status: "failed", attempts: 5 }))).toBe(false));
  it("uses bounded exponential backoff", () => {
    expect(nextAttempt(1, 0)).toBe("1970-01-01T00:00:02.000Z");
    expect(nextAttempt(20, 0)).toBe("1970-01-01T00:05:00.000Z");
  });
});
