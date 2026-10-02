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
  if (isReferenceProvider(analysis.provider)) return null;
  if (analysis.provider === "localVisionProvider") return "Local evaluator";
  return "Analysis provider";
}

export function operatorEvidenceExplanation(value: string) {
  return value
    .replace(
      /Reference manifest maps this image to the ([a-z0-9_-]+) checklist slot\./gi,
      (_, view: string) => `Photo is assigned to the ${view.replaceAll("_", " ")} required view.`
    )
    .replace(/Mapped from documented source metadata; no model quality score is claimed\./gi, "Photo is assigned to the required checklist view.")
    .replace(/\bReference manifest\b/gi, "Source photo")
    .replace(/\bImported evidence\b/gi, "Photo")
    .replace(/\breference image\b/gi, "photo")
    .replace(/\bsource image\b/gi, "photo");
}
