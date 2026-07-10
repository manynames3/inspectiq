import { requiredPhotoAngles } from "@inspectiq/shared";
import { describe, expect, it } from "vitest";
import { deriveMarketplaceReadiness, formatReportReadiness } from "./marketplaceReadiness.js";
import type { InspectionBundle, VisionSuggestion } from "./types.js";

function acceptedAngleSuggestions(): VisionSuggestion[] {
  return requiredPhotoAngles.map((angle, index) => ({
    id: `angle-${angle}`,
    inspectionId: "inspection-1",
    photoId: `photo-${index}`,
    suggestionType: "photo_angle",
    suggestedValueJson: { photoAngle: angle },
    confidence: 0.95,
    explanation: `Detected ${angle}.`,
    status: "accepted",
    version: 1
  }));
}

function baseBundle(extraSuggestions: VisionSuggestion[] = []): InspectionBundle {
  return {
    inspection: {
      id: "inspection-1",
      vin: "SYNTHVIN24E2E9003",
      year: 2024,
      make: "Hyundai",
      model: "Tucson",
      trim: "SEL",
      mileage: 14250,
      exteriorColor: "Gray",
      sellerSource: "Wholesale offsite lane",
      inspectorName: "John Smith",
      status: "FINALIZED",
      completenessPercentage: 100,
      updatedAt: "2026-07-03T18:00:00.000Z",
      finalizedAt: "2026-07-03T18:00:00.000Z"
    },
    photos: requiredPhotoAngles.map((angle, index) => ({
      id: `photo-${index}`,
      inspectionId: "inspection-1",
      storageKey: `/sample-images/${angle}.png`,
      objectBucket: "inspectiq-test",
      objectKey: `sample-images/${angle}.png`,
      thumbnailStorageKey: `/sample-images/${angle}.png`,
      byteSize: 120000,
      checksumSha256: null,
      originalFilename: `${angle}.png`,
      mimeType: "image/png",
      sourceName: null,
      sourceUrl: null,
      sourceLicense: null,
      uploadStatus: "uploaded",
      declaredAngle: angle,
      detectedAngle: angle,
      detectedAngleConfidence: 0.95,
      qualityStatus: "warning",
      analysisStatus: "completed"
    })),
    imageAnalysisJobs: [],
    suggestions: [...acceptedAngleSuggestions(), ...extraSuggestions],
    damageItems: [],
    conditionGrade: {
      id: "grade-1",
      score: 84,
      grade: "B",
      explanationJson: {},
      gradingVersion: "local-test"
    },
    aiReportJob: null,
    aiReportDraft: null,
    finalReport: {
      id: "report-1",
      reportBody: "Final condition report.",
      finalizedBy: "review-lead",
      finalizedAt: "2026-07-03T18:00:00.000Z",
      version: 1,
      approvalStatus: "finalized",
      reviewerComment: "Evidence reviewed.",
      approvedBy: "review-lead",
      approvedAt: "2026-07-03T17:55:00.000Z"
    },
    auditEvents: [],
    readinessIssues: [],
    buyerVisibleReady: true
  };
}

describe("deriveMarketplaceReadiness", () => {
  it("does not block a finalized CR for already-reviewed quality warnings", () => {
    const readiness = deriveMarketplaceReadiness(baseBundle([{
      id: "quality-1",
      inspectionId: "inspection-1",
      photoId: "photo-0",
      suggestionType: "quality_warning",
      suggestedValueJson: { warning: "Image appears blurry; reviewer accepted as usable." },
      confidence: 0.88,
      explanation: "Reviewer accepted image quality as sufficient.",
      status: "accepted",
      version: 1
    }]));

    expect(readiness.crStatus).toBe("CR ready");
    expect(readiness.vdpStatus).toBe("VDP ready");
    expect(readiness.blockers).toEqual([]);
    expect(formatReportReadiness(readiness)).toMatchObject({
      label: "Ready for report",
      detail: "Buyer release complete",
      className: "inline-ready"
    });
  });

  it("keeps CR blocked while a quality warning is unresolved", () => {
    const readiness = deriveMarketplaceReadiness(baseBundle([{
      id: "quality-1",
      inspectionId: "inspection-1",
      photoId: "photo-0",
      suggestionType: "quality_warning",
      suggestedValueJson: { warning: "Image appears blurry; retake recommended." },
      confidence: 0.88,
      explanation: "Image quality warning needs reviewer decision.",
      status: "pending",
      version: 1
    }]));

    expect(readiness.crStatus).toBe("CR blocked");
    expect(readiness.vdpStatus).toBe("Needs review");
    expect(readiness.blockers).toContain("1 image quality issue need review");
    expect(formatReportReadiness(readiness)).toMatchObject({
      label: "Report not ready",
      detail: "Needs review decisions",
      className: "inline-watch"
    });
  });

  it("formats grade and final report blockers in end-user language", () => {
    const readiness = deriveMarketplaceReadiness({
      ...baseBundle(),
      conditionGrade: null,
      finalReport: null,
      readinessIssues: []
    });

    expect(readiness.crStatus).toBe("CR blocked");
    expect(formatReportReadiness(readiness)).toMatchObject({
      label: "Report not ready",
      detail: "Needs grade and final report"
    });
  });
});
