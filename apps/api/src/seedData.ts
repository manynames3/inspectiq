import { findSampleImageByObjectKey, sampleBundles, sampleImages, type SampleImage } from "./sampleImages.js";
import type { Actor, DamageItem, VehiclePhoto } from "./domain.js";
import { MemoryStore } from "./store.js";
import type { PhotoAngle, VisionOutput } from "@inspectiq/shared";

const systemActor: Actor = { id: "queue-import", name: "Queue Import", role: "admin" };
export const identitySourceName = "Reference identity capture";
export const identitySourceLicense = "System-created reference card used when source media does not include a readable VIN or odometer close-up.";

export function identityDataUrl(title: string, value: string): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">`,
    `<rect width="640" height="360" fill="#e8eef6"/>`,
    `<rect x="54" y="92" width="532" height="176" rx="18" fill="#f8fafc" stroke="#334155" stroke-width="5"/>`,
    `<text x="320" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#0f172a">${title}</text>`,
    `<text x="320" y="214" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="800" fill="#111827">${value}</text>`,
    `</svg>`
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function seedImageQuality(overrides: Partial<VisionOutput["imageQuality"]> = {}): VisionOutput["imageQuality"] {
  return {
    grade: "pass",
    blurScore: 0.96,
    exposureScore: 0.94,
    framingScore: 0.95,
    resolutionScore: 0.97,
    occlusionRisk: 0.04,
    retakeRequired: false,
    notes: [],
    ...overrides
  };
}

function confidenceForAngle(angle: PhotoAngle | null | undefined): number {
  if (angle === "odometer") return 0.98;
  if (angle === "vin_plate") return 0.97;
  if (angle === "front") return 0.95;
  if (angle === "engine_bay") return 0.92;
  if (angle === "interior") return 0.91;
  return 0.94;
}

function referenceVisionOutput(input: {
  angle: PhotoAngle;
  storageKey: string;
  referenceAngleConfidence?: number;
  referenceQualityGrade?: "pass" | "review" | "retake";
  referenceRetakeRequired?: boolean;
  referenceQualityWarnings?: string[];
  referenceQualityNotes?: string[];
}): VisionOutput {
  const isBlurryRetake = input.storageKey.includes("blurry-front");
  const extractedText: VisionOutput["extractedText"] = {};

  if (isBlurryRetake) {
    return {
      photoAngle: "front",
      confidence: 0.58,
      imageQuality: seedImageQuality({
        grade: "retake",
        blurScore: 0.42,
        exposureScore: 0.51,
        framingScore: 0.82,
        resolutionScore: 0.72,
        occlusionRisk: 0.08,
        retakeRequired: true,
        notes: ["Blur and low light reduce buyer trust; retake before CR release."]
      }),
      qualityWarnings: ["Image appears blurry or low-light; retake recommended before final report."],
      detectedDamageCandidates: [],
      extractedText,
      humanReviewRequired: true
    };
  }

  const qualityWarnings = input.referenceQualityWarnings ?? [];
  const qualityGrade = input.referenceQualityGrade ?? (input.angle === "interior" ? "review" : "pass");
  return {
    photoAngle: input.angle,
    confidence: input.referenceAngleConfidence ?? confidenceForAngle(input.angle),
    imageQuality: seedImageQuality({
      grade: qualityGrade,
      retakeRequired: input.referenceRetakeRequired ?? qualityGrade === "retake",
      notes: input.referenceQualityNotes ?? [`Imported ${input.angle.replaceAll("_", " ")} image matched the required capture slot.`]
    }),
    qualityWarnings,
    detectedDamageCandidates: [],
    extractedText,
    humanReviewRequired: qualityWarnings.length > 0 || input.angle === "vin_plate" || input.angle === "odometer"
  };
}

function qualityStatusFor(output: VisionOutput): VehiclePhoto["qualityStatus"] {
  if (output.imageQuality.grade === "retake" || output.imageQuality.retakeRequired) return "fail";
  if (output.imageQuality.grade === "review" || output.qualityWarnings.length > 0) return "warning";
  return "ok";
}

function setIfChanged<T extends keyof VehiclePhoto>(photo: VehiclePhoto, key: T, value: VehiclePhoto[T]): boolean {
  if (photo[key] === value) return false;
  photo[key] = value;
  return true;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isReferenceEvidencePhoto(photo: VehiclePhoto, sample: SampleImage): boolean {
  if (photo.objectBucket === "inspectiq-sample-images") return true;
  if (photo.objectKey?.includes("/reference-evidence/")) return true;
  if (photo.sourceUrl && sample.sourceUrl && photo.sourceUrl === sample.sourceUrl) return true;
  return Boolean(photo.sourceName && sample.sourceName && photo.sourceName === sample.sourceName);
}

function findReferenceSampleForPhoto(photo: VehiclePhoto): SampleImage | undefined {
  const objectKeySample = findSampleImageByObjectKey(photo.objectKey);
  if (objectKeySample) return objectKeySample;

  const filenameSample = sampleImages.find((sample) => sample.filename === photo.originalFilename);
  if (filenameSample && isReferenceEvidencePhoto(photo, filenameSample)) return filenameSample;

  return undefined;
}

export function reconcileReferenceEvidence(store: MemoryStore): boolean {
  let changed = false;
  for (const photo of store.photos.values()) {
    const sample = findReferenceSampleForPhoto(photo);
    if (!sample) continue;

    const storageKey = sample.storageKey ?? `/sample-images/${sample.filename}`;
    const photoAnalyses = [...store.analyses.values()].filter((analysis) => analysis.photoId === photo.id);
    const hasModelAnalysis = photoAnalyses.some((analysis) =>
      analysis.provider !== "referenceManifestProvider" &&
      analysis.provider !== "referenceImportProvider" &&
      analysis.provider !== "seededImportProvider"
    );
    const output = referenceVisionOutput({
      angle: sample.angle,
      storageKey,
      referenceAngleConfidence: sample.referenceAngleConfidence,
      referenceQualityGrade: sample.referenceQualityGrade,
      referenceRetakeRequired: sample.referenceRetakeRequired,
      referenceQualityWarnings: sample.referenceQualityWarnings,
      referenceQualityNotes: sample.referenceQualityNotes
    });

    changed = setIfChanged(photo, "storageKey", storageKey) || changed;
    changed = setIfChanged(photo, "thumbnailStorageKey", storageKey) || changed;
    changed = setIfChanged(photo, "originalFilename", sample.filename) || changed;
    changed = setIfChanged(photo, "mimeType", sample.mimeType) || changed;
    changed = setIfChanged(photo, "sourceName", sample.sourceName ?? null) || changed;
    changed = setIfChanged(photo, "sourceUrl", sample.sourceUrl ?? null) || changed;
    changed = setIfChanged(photo, "sourceLicense", sample.sourceLicense ?? null) || changed;
    changed = setIfChanged(photo, "declaredAngle", sample.angle) || changed;
    changed = setIfChanged(photo, "captureSource", "reference") || changed;
    if (!hasModelAnalysis) {
      changed = setIfChanged(photo, "detectedAngle", output.photoAngle) || changed;
      changed = setIfChanged(photo, "detectedAngleConfidence", output.confidence) || changed;
      changed = setIfChanged(photo, "qualityStatus", qualityStatusFor(output)) || changed;
      changed = setIfChanged(photo, "analysisStatus", "completed") || changed;
    }

    for (const analysis of photoAnalyses) {
      if (analysis.photoId !== photo.id || analysis.status !== "completed") continue;
      const rawSource = typeof analysis.rawModelOutputJson === "object" && analysis.rawModelOutputJson !== null && "source" in analysis.rawModelOutputJson
        ? String((analysis.rawModelOutputJson as { source?: unknown }).source ?? "")
        : "";
      const isReferenceAnalysis = analysis.provider === "referenceManifestProvider" ||
        analysis.provider === "referenceImportProvider" ||
        analysis.provider === "seededImportProvider" ||
        rawSource === "reference-import" ||
        rawSource === "reference-manifest";
      if (!isReferenceAnalysis) continue;
      const raw = {
        source: "reference-manifest",
        filename: sample.filename,
        angle: sample.angle
      };
      if (analysis.provider !== "referenceManifestProvider") {
        analysis.provider = "referenceManifestProvider";
        changed = true;
      }
      if (analysis.promptVersion !== "reference-manifest-v1") {
        analysis.promptVersion = "reference-manifest-v1";
        changed = true;
      }
      if (!sameJson(analysis.rawModelOutputJson, raw)) {
        analysis.rawModelOutputJson = raw;
        changed = true;
      }
      if (!sameJson(analysis.validatedOutputJson, output)) {
        analysis.validatedOutputJson = output;
        changed = true;
      }
      if (analysis.confidence !== output.confidence) {
        analysis.confidence = output.confidence;
        changed = true;
      }
    }

    for (const suggestion of store.suggestions.values()) {
      if (hasModelAnalysis || suggestion.photoId !== photo.id || suggestion.suggestionType !== "photo_angle") continue;
      const suggestedValue = { photoAngle: output.photoAngle };
      const explanation = `Reference manifest maps this image to the ${output.photoAngle} checklist slot. Reviewer confirmation required.`;
      if (!sameJson(suggestion.suggestedValueJson, suggestedValue)) {
        suggestion.suggestedValueJson = suggestedValue;
        changed = true;
      }
      if (suggestion.confidence !== output.confidence) {
        suggestion.confidence = output.confidence;
        changed = true;
      }
      if (suggestion.explanation !== explanation) {
        suggestion.explanation = explanation;
        changed = true;
      }
    }

    for (const warning of hasModelAnalysis ? [] : output.qualityWarnings) {
      const existing = [...store.suggestions.values()].find((suggestion) =>
        suggestion.photoId === photo.id &&
        suggestion.suggestionType === "quality_warning" &&
        JSON.stringify((suggestion.suggestedValueJson as { warning?: unknown })?.warning) === JSON.stringify(warning)
      );
      if (!existing) {
        store.createSuggestion({
          inspectionId: photo.inspectionId,
          photoId: photo.id,
          suggestionType: "quality_warning",
          suggestedValueJson: { warning, imageQuality: output.imageQuality },
          confidence: Math.min(output.confidence, 0.75),
          explanation: `Reference-source QA note: ${warning} Reviewer confirmation required.`
        });
        changed = true;
      }
    }
  }
  changed = removeUnsupportedReferenceClaims(store) || changed;
  changed = removeReferenceMetadataOcrClaims(store) || changed;
  return changed;
}

function analyzeImportedPhoto(store: MemoryStore, input: {
  inspectionId: string;
  photoId: string;
  storageKey: string;
  originalFilename: string;
  angle: PhotoAngle;
}, actor: Actor): void {
  const photo = store.getPhoto(input.photoId);
  const sample = sampleImages.find((item) => item.filename === input.originalFilename);
  store.saveReferenceMapping(photo, {
    raw: {
      source: "reference-manifest",
      filename: input.originalFilename,
      angle: input.angle
    },
    validated: referenceVisionOutput({
      angle: input.angle,
      storageKey: input.storageKey,
      referenceAngleConfidence: sample?.referenceAngleConfidence,
      referenceQualityGrade: sample?.referenceQualityGrade,
      referenceRetakeRequired: sample?.referenceRetakeRequired,
      referenceQualityWarnings: sample?.referenceQualityWarnings,
      referenceQualityNotes: sample?.referenceQualityNotes
    })
  }, actor);

  const angleSuggestion = store.listSuggestions(input.inspectionId)
    .filter((suggestion) =>
      suggestion.photoId === input.photoId &&
      suggestion.suggestionType === "photo_angle" &&
      suggestion.status === "pending"
    )
    .at(-1);
  if (angleSuggestion) store.acceptSuggestion(angleSuggestion.id, actor);
}

type ReferenceReportState = "draft_human_review" | "finalized";

type ReferenceInspectionInput = {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  mileage: number;
  exteriorColor: string;
  sellerSource: string;
  inspectorName: string;
  sampleKeys: string[];
  reportState?: ReferenceReportState;
};

type ReferenceGrade = {
  id: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
};

type ReferenceReportOutput = {
  summary: string;
  notableDefects: string[];
  missingEvidence: string[];
  recommendedDisclosure: string;
  confidence: number;
  humanReviewRequired: boolean;
  reasoningSummary: string;
};

function titleDamage(item: DamageItem): string {
  return `${item.severity} ${item.damageType.replaceAll("_", " ")} at ${item.location}`;
}

function referenceReportOutput(input: ReferenceInspectionInput, grade: ReferenceGrade, damageItems: DamageItem[], humanReviewRequired: boolean): ReferenceReportOutput {
  const defects = damageItems.map(titleDamage);
  const vehicle = `${input.year} ${input.make} ${input.model} ${input.trim}`.trim();
  return {
    summary: `${vehicle} graded ${grade.grade} with a condition score of ${grade.score}. ${humanReviewRequired ? "Reviewer approval is required before buyer-visible release." : "Buyer-ready condition report is finalized for release."}`,
    notableDefects: defects.length > 0 ? defects : ["No confirmed damage items were recorded."],
    missingEvidence: [],
    recommendedDisclosure: defects.length > 0
      ? `Disclose confirmed damage before buyer-visible release: ${defects.join("; ")}.`
      : "Condition report is based on complete required photo evidence and reviewer-confirmed facts.",
    confidence: humanReviewRequired ? 0.82 : 0.93,
    humanReviewRequired,
    reasoningSummary: "Review used required photo evidence, confirmed damage items, condition grade, disclosure checks, and buyer-visible release status."
  };
}

function referenceReportBody(output: ReferenceReportOutput): string {
  return [
    `Summary: ${output.summary}`,
    "",
    "Notable defects:",
    ...output.notableDefects.map((item) => `- ${item}`),
    "",
    "Missing evidence:",
    ...(output.missingEvidence.length ? output.missingEvidence.map((item) => `- ${item}`) : ["- None"]),
    "",
    `Recommended disclosure: ${output.recommendedDisclosure}`,
    "",
    `Review rationale: ${output.reasoningSummary}`
  ].join("\n");
}

const unsupportedReferenceClaims = [
  {
    vin: "1FMCU9H6XNUB81389",
    filename: "2022-ford-escape-driver-side.jpg",
    location: "Driver-side front door",
    damageType: "scratch",
    severity: "minor",
    notes: "Reviewer confirmed a light scratch on the driver-side front door from uploaded side evidence."
  },
  {
    vin: "KNMAT2MV6KP514068",
    filename: "2019-nissan-rogue-rear.jpg",
    location: "Rear bumper",
    damageType: "dent",
    severity: "moderate",
    notes: "Reviewer confirmed rear bumper deformation visible in the rear evidence image."
  },
  {
    vin: "1HGCV1F49LA129627",
    filename: "2020-honda-accord-rear.jpg",
    location: "rear bumper",
    damageType: "dent",
    severity: "moderate",
    notes: "Source listing photo appears to show rear bumper deformation; reviewer confirmation required."
  }
] as const;

function repairReferenceReport(store: MemoryStore, inspectionId: string): void {
  const inspection = store.getInspection(inspectionId);
  const grade = store.latestGrade(inspection.id);
  if (grade && typeof grade.explanationJson === "object" && grade.explanationJson !== null) {
    const explanation = grade.explanationJson as { deductions?: Array<{ reason?: string }> };
    if (Array.isArray(explanation.deductions)) {
      const unsupportedReasons = unsupportedReferenceClaims.map((claim) => `${claim.damageType} at ${claim.location}`.toLowerCase());
      explanation.deductions = explanation.deductions.filter((deduction) => {
        const reason = deduction.reason?.toLowerCase() ?? "";
        return !unsupportedReasons.some((unsupportedReason) => reason.includes(unsupportedReason));
      });
    }
  }

  if (grade) {
    const input: ReferenceInspectionInput = {
      vin: inspection.vin,
      year: inspection.year,
      make: inspection.make,
      model: inspection.model,
      trim: inspection.trim,
      mileage: inspection.mileage,
      exteriorColor: inspection.exteriorColor,
      sellerSource: inspection.sellerSource,
      inspectorName: "John Smith",
      sampleKeys: []
    };
    const humanReviewRequired = store.latestReportDraft(inspection.id)?.humanReviewRequired ?? false;
    const output = referenceReportOutput(input, grade, store.listDamage(inspection.id), humanReviewRequired);
    const reportBody = referenceReportBody(output);

    for (const draft of store.reportDrafts.values()) {
      if (draft.inspectionId !== inspection.id) continue;
      draft.outputJson = output;
      draft.inputSummaryJson = {
        ...(typeof draft.inputSummaryJson === "object" && draft.inputSummaryJson !== null ? draft.inputSummaryJson : {}),
        damageItemCount: store.listDamage(inspection.id).length
      };
      draft.confidence = output.confidence;
      draft.humanReviewRequired = output.humanReviewRequired;
    }
    for (const report of store.finalReports.values()) {
      if (report.inspectionId === inspection.id) report.reportBody = reportBody;
    }
    for (const version of store.reportVersions.values()) {
      if (version.inspectionId === inspection.id) version.reportBody = reportBody;
    }
  }

}

function removeUnsupportedReferenceClaims(store: MemoryStore): boolean {
  let changed = false;
  for (const claim of unsupportedReferenceClaims) {
    const inspection = [...store.inspections.values()].find((item) => item.vin === claim.vin);
    if (!inspection) continue;
    const matchingPhotoIds = new Set(
      store.listPhotos(inspection.id)
        .filter((photo) => photo.originalFilename === claim.filename)
        .map((photo) => photo.id)
    );
    const removedDamageIds: string[] = [];
    for (const item of store.listDamage(inspection.id)) {
      if (
        item.source === "vision_suggestion" &&
        matchingPhotoIds.has(item.photoId ?? "") &&
        item.location.toLowerCase() === claim.location.toLowerCase() &&
        item.damageType === claim.damageType &&
        item.severity === claim.severity &&
        item.notes === claim.notes
      ) {
        store.damageItems.delete(item.id);
        removedDamageIds.push(item.id);
      }
    }

    const removedSuggestionIds: string[] = [];
    for (const suggestion of store.listSuggestions(inspection.id)) {
      if (suggestion.suggestionType !== "damage_candidate" || !matchingPhotoIds.has(suggestion.photoId)) continue;
      const value = suggestion.suggestedValueJson as { location?: unknown; damageType?: unknown; severityEstimate?: unknown; explanation?: unknown };
      if (
        String(value.location ?? "").toLowerCase() === claim.location.toLowerCase() &&
        value.damageType === claim.damageType &&
        value.severityEstimate === claim.severity &&
        value.explanation === claim.notes
      ) {
        store.suggestions.delete(suggestion.id);
        removedSuggestionIds.push(suggestion.id);
      }
    }

    if (removedDamageIds.length === 0 && removedSuggestionIds.length === 0) continue;
    if (removedDamageIds.length > 0) repairReferenceReport(store, inspection.id);
    store.addAudit(inspection.id, systemActor, "reference_evidence.corrected", {
      correction: "unsupported_damage_removed",
      removedDamageItemIds: removedDamageIds,
      removedSuggestionIds,
      sourceFilename: claim.filename,
      reason: "The vehicle-specific source image does not visibly support this damage claim."
    });
    changed = true;
  }
  return changed;
}

function removeReferenceMetadataOcrClaims(store: MemoryStore): boolean {
  let changed = false;
  for (const photo of store.photos.values()) {
    if (photo.captureSource !== "reference") continue;
    const analyses = [...store.analyses.values()].filter((analysis) => analysis.photoId === photo.id);
    const hasModelAnalysis = analyses.some((analysis) => analysis.provider !== "referenceManifestProvider" && analysis.provider !== "referenceImportProvider");
    if (hasModelAnalysis) continue;

    const removedSuggestionIds: string[] = [];
    for (const suggestion of store.suggestions.values()) {
      if (suggestion.photoId !== photo.id || suggestion.suggestionType !== "extracted_text") continue;
      store.suggestions.delete(suggestion.id);
      removedSuggestionIds.push(suggestion.id);
    }
    if (removedSuggestionIds.length === 0) continue;
    for (const verification of store.identityVerifications.values()) {
      if (removedSuggestionIds.includes(verification.sourceSuggestionId)) {
        store.identityVerifications.delete(verification.id);
      }
    }
    store.addAudit(photo.inspectionId, systemActor, "reference_evidence.corrected", {
      correction: "metadata_ocr_claim_removed",
      photoId: photo.id,
      removedSuggestionIds,
      reason: "VIN and odometer values from reference metadata must not be presented as image OCR."
    });
    changed = true;
  }
  return changed;
}

function acceptAllOpenSuggestions(store: MemoryStore, inspectionId: string, actor: Actor): void {
  for (const suggestion of store.listSuggestions(inspectionId)) {
    if (suggestion.status === "pending" || suggestion.status === "edited") {
      store.acceptSuggestion(suggestion.id, actor);
    }
  }
}

function createReferenceReport(store: MemoryStore, input: ReferenceInspectionInput, inspectionId: string, actor: Actor): void {
  if (!input.reportState) return;
  if (input.reportState === "finalized") {
    acceptAllOpenSuggestions(store, inspectionId, actor);
  }

  const damageItems = store.listDamage(inspectionId);
  const isHumanReview = input.reportState === "draft_human_review";
  const grade = store.saveGrade(inspectionId, {
    score: isHumanReview ? 82 : 94,
    grade: isHumanReview ? "B" : "A",
    explanationJson: {
      baseScore: 100,
      deductions: damageItems.map((item) => ({
        reason: titleDamage(item),
        points: item.severity === "moderate" ? 9 : item.severity === "minor" ? 3 : 5
      })),
      completionPenalty: 0,
      mileageAdjustment: isHumanReview ? 7 : 2,
      ageAdjustment: isHumanReview ? 2 : 1
    },
    gradingVersion: "reference-grading-v1"
  }, actor);

  const job = store.createReportJob(inspectionId, `reference-report-${input.vin}`, actor);
  store.markJobRunning(job.id);
  const output = referenceReportOutput(input, grade, damageItems, isHumanReview);
  store.completeReportJob(job.id, {
    inspectionId,
    jobId: job.id,
    provider: "referenceReportProvider",
    promptVersion: "reference-report-v1",
    inputSummaryJson: {
      gradeId: grade.id,
      damageItemCount: damageItems.length,
      missingEvidence: store.missingRequiredEvidence(inspectionId)
    },
    outputJson: output,
    confidence: output.confidence,
    humanReviewRequired: output.humanReviewRequired,
    validationStatus: "valid"
  }, referenceReportBody(output), actor);

  if (input.reportState === "finalized") {
    const report = store.latestFinalReport(inspectionId);
    if (report) {
      const approved = store.approveReport(report.id, actor, report.version, "Reference report reviewed against the complete evidence set.");
      store.finalizeReport(approved.id, actor, approved.version);
    }
  }
}

export function seedStore(store: MemoryStore): void {
  store.reset();
  const inspector = store.addUser({ id: "inspector-john-smith", name: "John Smith", role: "inspector" });
  const maria = store.addUser({ id: "inspector-maria-lee", name: "Maria Lee", role: "inspector" });
  const gateOps = store.addUser({ id: "inspector-gate-ops", name: "Gate Ops", role: "inspector" });
  const reviewer = store.addUser({ id: "review-lead", name: "Review Lead", role: "reviewer" });
  const reviewerActor: Actor = { id: reviewer.id, name: reviewer.name, role: reviewer.role };
  const inspectorActors: Record<string, Actor> = {
    "John Smith": { id: inspector.id, name: inspector.name, role: inspector.role },
    "Maria Lee": { id: maria.id, name: maria.name, role: maria.role },
    "Gate Ops": { id: gateOps.id, name: gateOps.name, role: gateOps.role }
  };

  const referenceInspections: ReferenceInspectionInput[] = [
    {
      vin: "5NMJF3DE5RH407769",
      year: 2024,
      make: "Hyundai",
      model: "Tucson",
      trim: "SEL",
      mileage: 22687,
      exteriorColor: "Gray",
      sellerSource: "Dealer listing intake",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["hyundai-tucson-sel-set"]
    },
    {
      vin: "4T1G11AK0MU520503",
      year: 2021,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      mileage: 106611,
      exteriorColor: "Super White",
      sellerSource: "Dealer listing intake",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["toyota-camry-se-set"]
    },
    {
      vin: "1HGCV1F49LA129627",
      year: 2020,
      make: "Honda",
      model: "Accord",
      trim: "EX",
      mileage: 79037,
      exteriorColor: "Gray",
      sellerSource: "Dealer trade-in lane",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["honda-accord-ex-set"]
    },
    {
      vin: "1FMCU9H6XNUB81389",
      year: 2022,
      make: "Ford",
      model: "Escape",
      trim: "SEL",
      mileage: 31992,
      exteriorColor: "Iced Blue Silver Metallic",
      sellerSource: "Dealer listing intake",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["ford-escape-sel-set"],
      reportState: "finalized"
    },
    {
      vin: "KNMAT2MV6KP514068",
      year: 2019,
      make: "Nissan",
      model: "Rogue",
      trim: "SV",
      mileage: 91168,
      exteriorColor: "Caspian Blue Metallic",
      sellerSource: "Dealer listing intake",
      inspectorName: "Maria Lee",
      sampleKeys: sampleBundles["nissan-rogue-sv-set"],
      reportState: "draft_human_review"
    },
    {
      vin: "4S4BTAFC8P3204430",
      year: 2023,
      make: "Subaru",
      model: "Outback",
      trim: "Premium",
      mileage: 49129,
      exteriorColor: "Blue",
      sellerSource: "Dealer listing intake",
      inspectorName: "John Smith",
      sampleKeys: sampleBundles["subaru-outback-premium-set"]
    }
  ];

  for (const input of referenceInspections) {
    const actor = inspectorActors[input.inspectorName] ?? inspectorActors["John Smith"];
    const inspection = store.createInspection(input, actor);
    const importSamples = input.sampleKeys.flatMap((sampleKey) => {
      const sample = sampleImages.find((item) => item.key === sampleKey);
      return sample ? [sample] : [];
    });
    const importedAngles = new Set(importSamples.map((sample) => sample.angle));

    for (const sample of importSamples) {
      const storageKey = sample.storageKey ?? `/sample-images/${sample.filename}`;
      const photo = store.addPhoto({
        inspectionId: inspection.id,
        storageKey,
        objectBucket: "inspectiq-sample-images",
        objectKey: `sample-images/${sample.key}`,
        thumbnailStorageKey: storageKey,
        byteSize: null,
        checksumSha256: null,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
        sourceName: sample.sourceName ?? null,
        sourceUrl: sample.sourceUrl ?? null,
        sourceLicense: sample.sourceLicense ?? null,
        uploadedBy: actor.id,
        declaredAngle: sample.angle,
        captureSource: "reference"
      }, actor);
      analyzeImportedPhoto(store, {
        inspectionId: inspection.id,
        photoId: photo.id,
        storageKey,
        originalFilename: sample.filename,
        angle: sample.angle
      }, reviewerActor);
    }

    if (!importedAngles.has("vin_plate")) {
      const vinPhoto = store.addPhoto({
        inspectionId: inspection.id,
        storageKey: identityDataUrl("VIN PLATE", input.vin),
        objectBucket: null,
        objectKey: null,
        thumbnailStorageKey: null,
        byteSize: null,
        checksumSha256: null,
        originalFilename: `vin-plate-${input.vin}.svg`,
        mimeType: "image/svg+xml",
        sourceName: identitySourceName,
        sourceUrl: null,
        sourceLicense: identitySourceLicense,
        uploadedBy: actor.id,
        declaredAngle: "vin_plate",
        captureSource: "reference"
      }, actor);
      analyzeImportedPhoto(store, {
        inspectionId: inspection.id,
        photoId: vinPhoto.id,
        storageKey: vinPhoto.storageKey,
        originalFilename: vinPhoto.originalFilename,
        angle: "vin_plate"
      }, reviewerActor);
    }

    if (!importedAngles.has("odometer")) {
      const odometerPhoto = store.addPhoto({
        inspectionId: inspection.id,
        storageKey: identityDataUrl("ODOMETER", input.mileage.toLocaleString()),
        objectBucket: null,
        objectKey: null,
        thumbnailStorageKey: null,
        byteSize: null,
        checksumSha256: null,
        originalFilename: `odometer-${input.mileage}.svg`,
        mimeType: "image/svg+xml",
        sourceName: identitySourceName,
        sourceUrl: null,
        sourceLicense: identitySourceLicense,
        uploadedBy: actor.id,
        declaredAngle: "odometer",
        captureSource: "reference"
      }, actor);
      analyzeImportedPhoto(store, {
        inspectionId: inspection.id,
        photoId: odometerPhoto.id,
        storageKey: odometerPhoto.storageKey,
        originalFilename: odometerPhoto.originalFilename,
        angle: "odometer"
      }, reviewerActor);
    }

    createReferenceReport(store, input, inspection.id, reviewerActor);
  }

  store.addAudit([...store.inspections.values()][0].id, systemActor, "inspection.queue.loaded", {
    inspections: store.inspections.size,
    note: "Initial inspection queue loaded."
  });
}
