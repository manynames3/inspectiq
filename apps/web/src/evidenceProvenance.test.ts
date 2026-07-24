import { describe, expect, it } from "vitest";
import { analysisProviderLabel, isReferenceEvidence, isReferenceProvider, operatorEvidenceExplanation } from "./evidenceProvenance.js";
import type { PhotoAnalysisResult, VehiclePhoto } from "./types.js";

function photo(captureSource: VehiclePhoto["captureSource"]): VehiclePhoto {
  return {
    id: "photo-1",
    inspectionId: "inspection-1",
    storageKey: "https://example.test/photo.jpg",
    objectBucket: null,
    objectKey: null,
    thumbnailStorageKey: null,
    byteSize: null,
    checksumSha256: null,
    originalFilename: "photo.jpg",
    mimeType: "image/jpeg",
    sourceName: "Dealer listing",
    sourceUrl: "https://example.test/listing",
    sourceLicense: "Source-documented reference",
    uploadStatus: "uploaded",
    declaredAngle: "driver_side",
    detectedAngle: "driver_side",
    detectedAngleConfidence: 0.94,
    qualityStatus: "ok",
    analysisStatus: "completed",
    captureSource
  };
}

function analysis(provider: string, modelId: string | null = null): PhotoAnalysisResult {
  return {
    id: "analysis-1",
    photoId: "photo-1",
    provider,
    promptVersion: "v1",
    confidence: 0.94,
    status: "completed",
    errorMessage: null,
    modelId,
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    estimatedCostUsd: null,
    schemaValid: true,
    fallbackUsed: false,
    failureCategory: null,
    createdAt: new Date().toISOString()
  };
}

describe("evidence provenance", () => {
  it("identifies reference manifest mappings without presenting them as AI", () => {
    const result = analysis("referenceManifestProvider");
    expect(isReferenceProvider(result.provider)).toBe(true);
    expect(isReferenceEvidence(photo("reference"), result)).toBe(true);
    expect(analysisProviderLabel(result)).toBe("Source photo");
  });

  it("lets a later Bedrock result supersede reference-source presentation", () => {
    const result = analysis("bedrockVisionProvider", "anthropic.claude-sonnet-4-6");
    expect(isReferenceEvidence(photo("reference"), result)).toBe(false);
    expect(analysisProviderLabel(result)).toBe("Bedrock · anthropic.claude-sonnet-4-6");
  });

  it("labels the deterministic provider without claiming a production model", () => {
    expect(analysisProviderLabel(analysis("localVisionProvider"))).toBe("Local evaluator");
  });

  it("converts implementation provenance into operator-facing evidence language", () => {
    expect(operatorEvidenceExplanation("Reference manifest maps this image to the driver_side checklist slot. Reviewer confirmation required."))
      .toBe("Photo is assigned to the driver side required view. Reviewer confirmation required.");
    expect(operatorEvidenceExplanation("Mapped from documented source metadata; no model quality score is claimed."))
      .toBe("Photo is assigned to the required checklist view.");
    expect(operatorEvidenceExplanation("Imported evidence is assigned to the passenger side required view."))
      .toBe("Photo is assigned to the passenger side required view.");
  });
});
