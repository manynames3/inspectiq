import type { PhotoAnalysisResult, VehiclePhoto } from "./types.js";

export function isReferenceProvider(provider: string | null | undefined) {
  return provider === "referenceManifestProvider" || provider === "referenceImportProvider" || provider === "seededImportProvider";
}

export function isReferenceEvidence(photo: VehiclePhoto, analysis?: PhotoAnalysisResult) {
  return analysis ? isReferenceProvider(analysis.provider) : photo.captureSource === "reference";
}

export function analysisProviderLabel(analysis: PhotoAnalysisResult | undefined) {
  if (!analysis) return null;
  if (analysis.provider === "bedrockVisionProvider") return analysis.modelId ? `Bedrock · ${analysis.modelId}` : "Bedrock";
  if (isReferenceProvider(analysis.provider)) return "Reference manifest";
  if (analysis.provider === "localVisionProvider") return "Local evaluator";
  return "Analysis provider";
}
