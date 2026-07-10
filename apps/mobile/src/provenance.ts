import type { InspectionBundle, VisionSuggestion } from "./types";

export function isReferenceProvider(provider: string | null | undefined) {
  return provider === "referenceManifestProvider" || provider === "referenceImportProvider" || provider === "seededImportProvider";
}

export function suggestionUsesReferenceMapping(bundle: InspectionBundle, suggestion: VisionSuggestion) {
  const latest = bundle.photoAnalysisResults
    ?.filter((analysis) => analysis.photoId === suggestion.photoId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  return isReferenceProvider(latest?.provider);
}
