import { describe, expect, it } from "vitest";
import { VisionOutputSchema } from "@inspectiq/shared";
import { buildBedrockVisionPrompt, detectImageFormat, localVisionProvider, normalizeVisionOutput, prepareBedrockOutput } from "./visionProvider.js";

describe("localVisionProvider", () => {
  it("does not let a declared checklist slot anchor the Bedrock angle classification", () => {
    const prompt = buildBedrockVisionPrompt({
      filename: "passenger-side.jpg",
      declaredAngle: "passenger_side"
    });

    expect(prompt).toContain("routing metadata, not visual evidence");
    expect(prompt).toContain("Classify the image pixels first");
    expect(prompt).toContain("front pointing left shows driver side; front pointing right shows passenger side");
    expect(prompt).toContain("If the physical side is ambiguous, return unknown");
    expect(prompt).not.toContain("use that value as photoAngle");
  });

  it("corrects a contradictory side label from explicit vehicle orientation", () => {
    const normalized = normalizeVisionOutput({
      photoAngle: "driver_side",
      confidence: 0.88,
      vehicleOrientation: {
        frontDirection: "right",
        confidence: 0.96,
        cues: ["Headlamps and front wheel are on the image right."]
      },
      imageQuality: {
        grade: "pass",
        blurScore: 0.9,
        exposureScore: 0.9,
        framingScore: 0.9,
        resolutionScore: 0.9,
        occlusionRisk: 0.05,
        retakeRequired: false,
        notes: ["Direct side profile."]
      },
      qualityWarnings: [],
      detectedDamageCandidates: [],
      extractedText: {},
      humanReviewRequired: false
    }, "passenger_side");

    expect(normalized.photoAngle).toBe("passenger_side");
    expect(normalized.confidence).toBe(0.85);
    expect(normalized.imageQuality.grade).toBe("review");
    expect(normalized.qualityWarnings).toEqual([
      "Side label corrected from vehicle front direction; confirm passenger side before release."
    ]);
    expect(normalized.humanReviewRequired).toBe(true);
  });

  it("does not retain high confidence when opposite side labels lack orientation evidence", () => {
    const normalized = normalizeVisionOutput({
      photoAngle: "driver_side",
      confidence: 0.88,
      imageQuality: {
        grade: "pass",
        blurScore: 0.9,
        exposureScore: 0.9,
        framingScore: 0.9,
        resolutionScore: 0.9,
        occlusionRisk: 0.05,
        retakeRequired: false,
        notes: ["Direct side profile."]
      },
      qualityWarnings: [],
      detectedDamageCandidates: [],
      extractedText: {},
      humanReviewRequired: false
    }, "passenger_side");

    expect(normalized.photoAngle).toBe("unknown");
    expect(normalized.confidence).toBe(0.49);
    expect(normalized.imageQuality.grade).toBe("review");
    expect(normalized.humanReviewRequired).toBe(true);
  });

  it("bounds orientation evidence before strict schema validation", () => {
    const prepared = prepareBedrockOutput({
      photoAngle: "passenger_side",
      confidence: 0.91,
      vehicleOrientation: {
        frontDirection: "right",
        confidence: 0.93,
        cues: [
          "Tail lamps are on the image left.",
          "Headlamps are on the image right.",
          "The front wheel is on the image right.",
          "This fourth model cue must be discarded."
        ]
      },
      imageQuality: {
        grade: "review",
        blurScore: 0.88,
        exposureScore: 0.82,
        framingScore: 0.75,
        resolutionScore: 0.87,
        occlusionRisk: 0.35,
        retakeRequired: false,
        notes: ["Direct side profile."]
      },
      qualityWarnings: ["Reviewer confirmation required."],
      detectedDamageCandidates: [],
      extractedText: {},
      humanReviewRequired: true
    });

    const parsed = VisionOutputSchema.parse(prepared);
    expect(parsed.vehicleOrientation?.cues).toHaveLength(3);
    expect(parsed.vehicleOrientation?.cues).not.toContain("This fourth model cue must be discarded.");
  });

  it("uses image bytes instead of stale MIME metadata", () => {
    const webpBytes = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50
    ]);
    const jpegBytes = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01
    ]);

    expect(detectImageFormat(webpBytes, "image/jpeg", "listing.jpg")).toBe("webp");
    expect(detectImageFormat(jpegBytes, "image/webp", "listing.webp")).toBe("jpeg");
  });

  it("routes internally contradictory direct-view output to review", () => {
    const normalized = normalizeVisionOutput({
      photoAngle: "front",
      confidence: 0.95,
      imageQuality: {
        grade: "pass",
        blurScore: 0.95,
        exposureScore: 0.93,
        framingScore: 0.9,
        resolutionScore: 0.92,
        occlusionRisk: 0.05,
        retakeRequired: false,
        notes: ["Clear, well-lit front 3/4 view of the vehicle."]
      },
      qualityWarnings: [],
      detectedDamageCandidates: [],
      extractedText: {},
      humanReviewRequired: false
    }, "front");

    expect(normalized.imageQuality.grade).toBe("review");
    expect(normalized.qualityWarnings).toEqual([
      "Model angle fields and description disagree; reviewer must confirm the required view."
    ]);
    expect(normalized.humanReviewRequired).toBe(true);
  });

  it("retains explicit review warnings even when a retake is not required", () => {
    const normalized = normalizeVisionOutput({
      photoAngle: "passenger_side",
      confidence: 0.82,
      imageQuality: {
        grade: "review",
        blurScore: 0.94,
        exposureScore: 0.92,
        framingScore: 0.72,
        resolutionScore: 0.93,
        occlusionRisk: 0.04,
        retakeRequired: false,
        notes: ["The view needs reviewer confirmation."]
      },
      qualityWarnings: ["Required side angle needs reviewer confirmation."],
      detectedDamageCandidates: [],
      extractedText: {},
      humanReviewRequired: true
    }, "passenger_side");

    expect(normalized.qualityWarnings).toEqual(["Required side angle needs reviewer confirmation."]);
    expect(normalized.humanReviewRequired).toBe(true);
  });

  it("filters marginal damage candidates below the production precision gate", () => {
    const normalized = normalizeVisionOutput({
      photoAngle: "rear",
      confidence: 0.9,
      imageQuality: {
        grade: "pass",
        blurScore: 0.9,
        exposureScore: 0.9,
        framingScore: 0.9,
        resolutionScore: 0.9,
        occlusionRisk: 0.05,
        retakeRequired: false,
        notes: []
      },
      qualityWarnings: [],
      detectedDamageCandidates: [{
        location: "rear bumper",
        damageType: "scratch",
        severityEstimate: "minor",
        confidence: 0.84,
        explanation: "Possible surface mark.",
        repairEstimateUsd: {
          min: 150,
          max: 300,
          rationale: "Preliminary cosmetic repair range."
        },
        requiresHumanConfirmation: true
      }],
      extractedText: {},
      humanReviewRequired: true
    }, "rear");

    expect(normalized.detectedDamageCandidates).toEqual([]);
  });

  it("does not invent damage from a clean Honda Accord listing photo", async () => {
    const result = await localVisionProvider.analyze({
      filename: "2020-honda-accord-rear.jpg",
      storageKey: "https://carfax-img.vast.com/carfax/v2/866048677535386941/3/640x480",
      declaredAngle: "rear"
    });

    expect(result.validated.photoAngle).toBe("rear");
    expect(result.validated.confidence).toBe(0.94);
    expect(result.validated.humanReviewRequired).toBe(false);
    expect(result.validated.detectedDamageCandidates).toEqual([]);
  });

  it("keeps the source-documented damage challenge fixture for evaluator coverage", async () => {
    const result = await localVisionProvider.analyze({
      filename: "skoda-roomster-rear-quarter-dent.jpg",
      storageKey: "/sample-images/skoda-roomster-rear-quarter-dent.jpg",
      declaredAngle: "rear"
    });

    expect(result.validated.detectedDamageCandidates).toEqual([
      expect.objectContaining({
        location: "rear bumper lower centre and passenger-side corner",
        damageType: "dent",
        severityEstimate: "moderate",
        repairEstimateUsd: {
          min: 500,
          max: 1200,
          rationale: "Policy range derived from the reviewed damage type and severity; raw model estimate is retained for audit."
        },
        requiresHumanConfirmation: true
      })
    ]);
  });

  it("does not treat the prior clean side-panel fixture as a scratch", async () => {
    const result = await localVisionProvider.analyze({
      filename: "passenger-side-clean.jpg",
      storageKey: "/sample-images/passenger-side-clean.jpg",
      declaredAngle: "passenger_side"
    });

    expect(result.validated.detectedDamageCandidates).toEqual([]);
  });

  it("keeps the source-documented interior wear case distinct from the clean interior control", async () => {
    const result = await localVisionProvider.analyze({
      filename: "interior-wear.jpg",
      storageKey: "/sample-images/interior-wear.jpg",
      declaredAngle: "interior"
    });

    expect(result.validated.detectedDamageCandidates).toEqual([
      expect.objectContaining({
        damageType: "interior_wear",
        severityEstimate: "moderate",
        requiresHumanConfirmation: true
      })
    ]);
  });
});
