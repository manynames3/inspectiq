import { getVisionProvider } from "./visionProvider.js";
import type { Actor, PhotoAnalysisResult, VisionSuggestion } from "./domain.js";
import type { MemoryStore } from "./store.js";
import { reserveBedrockUsage } from "./operationsStore.js";
import { emitMetric } from "./metrics.js";

export type ImageAnalysisRunResult = {
  job: ReturnType<MemoryStore["imageAnalysisJobsForInspection"]>[number] | undefined;
  analysis: PhotoAnalysisResult;
  suggestions: VisionSuggestion[];
};

export async function runImageAnalysisJob(store: MemoryStore, jobId: string, actor: Actor): Promise<ImageAnalysisRunResult> {
  const job = store.imageAnalysisJobs.get(jobId);
  if (!job) throw new Error(`Unknown image analysis job ${jobId}.`);
  const photo = store.getPhoto(job.photoId);

  if (job.status !== "running") {
    store.startImageAnalysisJob(job.id, actor);
  }

  const provider = getVisionProvider();
  try {
    if (provider.name.toLowerCase().includes("bedrock")) {
      await reserveBedrockUsage("imageAnalyses", job.idempotencyKey ?? job.id);
    }
    const result = await provider.analyze({
      filename: photo.originalFilename,
      storageKey: photo.storageKey,
      objectBucket: photo.objectBucket,
      objectKey: photo.objectKey,
      mimeType: photo.mimeType,
      declaredAngle: photo.declaredAngle
    });
    const analysis = store.saveAnalysis(photo, {
      provider: provider.name,
      promptVersion: provider.promptVersion,
      raw: result.raw,
      validated: result.validated,
      metadata: result.metadata,
      jobId: job.id,
      force: job.idempotencyKey?.startsWith("force:") ?? false
    }, actor);
    return {
      job: store.imageAnalysisJobs.get(job.id),
      analysis,
      suggestions: store.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "";
    const errorMessage = error instanceof Error ? error.message : "Unknown analysis failure.";
    if (/throttl/i.test(`${errorName} ${errorMessage}`)) {
      emitMetric("BedrockThrottles", 1, { Operation: "ImageAnalysis" });
    }
    const analysis = store.failAnalysis(
      photo,
      provider.name,
      provider.promptVersion,
      errorMessage,
      actor,
      job.id
    );
    return {
      job: store.imageAnalysisJobs.get(job.id),
      analysis,
      suggestions: store.listSuggestions(photo.inspectionId).filter((suggestion) => suggestion.photoId === photo.id)
    };
  }
}
