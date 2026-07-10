import { isReferenceProvider, suggestionUsesReferenceMapping } from "./provenance";
import type { InspectionBundle, VisionSuggestion } from "./types";

const suggestion = { id: "finding-1", photoId: "photo-1" } as VisionSuggestion;

describe("mobile evidence provenance", () => {
  it("shows manifest-backed findings as reference mappings", () => {
    const bundle = {
      photoAnalysisResults: [{ id: "analysis-1", photoId: "photo-1", provider: "referenceManifestProvider", modelId: null, confidence: 0.94, status: "completed", createdAt: "2026-07-10T00:00:00.000Z" }]
    } as InspectionBundle;
    expect(isReferenceProvider("referenceManifestProvider")).toBe(true);
    expect(suggestionUsesReferenceMapping(bundle, suggestion)).toBe(true);
  });

  it("uses a later Bedrock result instead of the older reference mapping", () => {
    const bundle = {
      photoAnalysisResults: [
        { id: "analysis-1", photoId: "photo-1", provider: "referenceManifestProvider", modelId: null, confidence: 0.94, status: "completed", createdAt: "2026-07-10T00:00:00.000Z" },
        { id: "analysis-2", photoId: "photo-1", provider: "bedrockVisionProvider", modelId: "model", confidence: 0.91, status: "completed", createdAt: "2026-07-10T00:01:00.000Z" }
      ]
    } as InspectionBundle;
    expect(suggestionUsesReferenceMapping(bundle, suggestion)).toBe(false);
  });
});
