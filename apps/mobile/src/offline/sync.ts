import NetInfo from "@react-native-community/netinfo";
import { File, UploadType } from "expo-file-system";
import { mobileApi, MobileApiError } from "../api/client";
import { deviceIdentity } from "../deviceIdentity";
import type { MobileSession, UploadOperation, VehiclePhoto } from "../types";
import { updateUploadOperation, uploadOperations } from "./database";
import { nextAttempt, shouldAttempt } from "./retryPolicy";

type UploadIntent = {
  objectBucket: string;
  objectKey: string;
  uploadUrl: string | null;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
};

export type SyncSummary = {
  attempted: number;
  uploaded: number;
  blocked: number;
  failed: number;
};

async function uploadOne(operation: UploadOperation, session: MobileSession): Promise<"uploaded" | "blocked" | "failed"> {
  const file = new File(operation.fileUri);
  if (!file.exists) {
    await updateUploadOperation(operation.id, {
      status: "blocked",
      attempts: operation.attempts + 1,
      lastError: "The local photo file is no longer available.",
      nextAttemptAt: null
    });
    return "blocked";
  }
  const attempts = operation.attempts + 1;
  await updateUploadOperation(operation.id, { status: "uploading", attempts, lastError: null, nextAttemptAt: null });
  try {
    const intent = await mobileApi<UploadIntent>("/api/uploads/intent", session, {
      method: "POST",
      idempotencyKey: operation.id,
      body: JSON.stringify({
        inspectionId: operation.inspectionId,
        originalFilename: `${operation.declaredAngle}.jpg`,
        mimeType: "image/jpeg",
        byteSize: operation.byteSize,
        checksumSha256: operation.checksumSha256,
        operationId: operation.id,
        captureSource: "mobile"
      })
    });
    if (intent.uploadUrl) {
      const result = await file.upload(intent.uploadUrl, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        mimeType: "image/jpeg",
        headers: intent.requiredHeaders,
        sessionType: "background"
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`Object upload returned HTTP ${result.status}.`);
    }
    await updateUploadOperation(operation.id, { status: "confirming", attempts });
    const photo = await mobileApi<VehiclePhoto>(`/api/inspections/${operation.inspectionId}/photos/upload`, session, {
      method: "POST",
      idempotencyKey: operation.id,
      body: JSON.stringify({
        originalFilename: `${operation.declaredAngle}.jpg`,
        mimeType: "image/jpeg",
        declaredAngle: operation.declaredAngle,
        objectBucket: intent.objectBucket,
        objectKey: intent.objectKey,
        byteSize: operation.byteSize,
        checksumSha256: operation.checksumSha256,
        operationId: operation.id,
        capturedAt: operation.createdAt,
        deviceId: await deviceIdentity(),
        captureSource: "mobile"
      })
    });
    let analysisMessage: string | null = null;
    try {
      await mobileApi(`/api/photos/${photo.id}/analyze`, session, {
        method: "POST",
        idempotencyKey: `analyze:${operation.id}`,
        body: JSON.stringify({ idempotencyKey: `analyze:${operation.id}` })
      });
    } catch (error) {
      if (error instanceof MobileApiError && error.code === "COST_GUARD_REACHED") {
        analysisMessage = "Photo uploaded. Analysis is deferred because the monthly model allowance was reached.";
      } else {
        analysisMessage = "Photo uploaded. Analysis will be retried from the inspection workspace.";
      }
    }
    await updateUploadOperation(operation.id, {
      status: "uploaded",
      attempts,
      lastError: analysisMessage,
      nextAttemptAt: null,
      uploadedPhotoId: photo.id
    });
    return "uploaded";
  } catch (error) {
    const isWorkflowConflict = error instanceof MobileApiError
      && (error.code === "VERSION_CONFLICT" || error.status === 409 || error.status === 403);
    const status = isWorkflowConflict || attempts >= 5 ? "blocked" : "failed";
    await updateUploadOperation(operation.id, {
      status,
      attempts,
      lastError: error instanceof Error ? error.message : "Upload failed.",
      nextAttemptAt: status === "failed" ? nextAttempt(attempts) : null
    });
    return status;
  }
}

export async function syncUploadQueue(
  session: MobileSession,
  onProgress?: (operation: UploadOperation) => void
): Promise<SyncSummary> {
  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false) {
    return { attempted: 0, uploaded: 0, blocked: 0, failed: 0 };
  }
  const pending = (await uploadOperations()).filter(shouldAttempt);
  const summary: SyncSummary = { attempted: 0, uploaded: 0, blocked: 0, failed: 0 };
  for (const operation of pending) {
    onProgress?.(operation);
    summary.attempted += 1;
    const result = await uploadOne(operation, session);
    summary[result] += 1;
  }
  return summary;
}
