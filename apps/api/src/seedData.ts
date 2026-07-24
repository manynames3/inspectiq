import { findSampleImageByObjectKey, sampleBundles, sampleImages, type SampleImage } from "./sampleImages.js";
import type { Actor, DamageItem, VehiclePhoto } from "./domain.js";
import { MemoryStore } from "./store.js";
import type { AiReportOutput, PhotoAngle, VisionOutput } from "@inspectiq/shared";
import { visualConditionSections } from "./reportProvider.js";

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

    const sourceStorageKey = sample.storageKey ?? `/sample-images/${sample.filename}`;
    const storageKey = photo.objectBucket && photo.objectBucket !== "inspectiq-sample-images" && photo.objectKey
      ? `s3://${photo.objectBucket}/${photo.objectKey}`
      : sourceStorageKey;
    const photoAnalyses = [...store.analyses.values()].filter((analysis) => analysis.photoId === photo.id);
    const hasModelAnalysis = photoAnalyses.some((analysis) =>
      analysis.provider !== "referenceManifestProvider" &&
      analysis.provider !== "referenceImportProvider" &&
      analysis.provider !== "seededImportProvider"
    );
    const output = referenceVisionOutput({
      angle: sample.angle,
      storageKey: sourceStorageKey,
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
      const explanation = `Imported evidence is assigned to the ${output.photoAngle} required view. Reviewer confirmation required.`;
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

    if (!hasModelAnalysis) {
      const currentSuggestions = [{
        inspectionId: photo.inspectionId,
        photoId: photo.id,
        suggestionType: "photo_angle" as const,
        suggestedValueJson: { photoAngle: output.photoAngle },
        confidence: output.confidence,
        explanation: `Imported evidence is assigned to the ${output.photoAngle} required view. Reviewer confirmation required.`
      }, ...output.qualityWarnings.map((warning) => ({
        inspectionId: photo.inspectionId,
        photoId: photo.id,
        suggestionType: "quality_warning" as const,
        suggestedValueJson: { warning, imageQuality: output.imageQuality },
        confidence: Math.min(output.confidence, 0.75),
        explanation: `Reference-source QA note: ${warning} Reviewer confirmation required.`
      }))];
      changed = store.supersedePendingPhotoSuggestions(photo, currentSuggestions, systemActor, {
        provider: "referenceManifestProvider",
        promptVersion: "reference-manifest-v1"
      }).length > 0 || changed;
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
  changed = store.reconcileDuplicateSuggestions(systemActor) > 0 || changed;
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
  referenceGrade?: number;
};

type ReferenceGrade = {
  id: string;
  approvedGrade: number | null;
  suggestedGrade: number;
};

type ReferenceReportOutput = AiReportOutput;

function titleDamage(item: DamageItem): string {
  return `${item.severity} ${item.damageType.replaceAll("_", " ")} at ${item.location}`;
}

function referenceReportOutput(input: ReferenceInspectionInput, grade: ReferenceGrade, damageItems: DamageItem[], humanReviewRequired: boolean): ReferenceReportOutput {
  const defects = damageItems.map(titleDamage);
  const vehicle = `${input.year} ${input.make} ${input.model} ${input.trim}`.trim();
  return {
    inspectionType: "VISUAL_CONDITION_REPORT",
    summary: `${vehicle} has an InspectIQ Reference Grade of ${(grade.approvedGrade ?? grade.suggestedGrade).toFixed(1)} out of 5.0. ${humanReviewRequired ? "Reviewer approval is required before buyer-visible release." : "Buyer-ready condition report is finalized for release."}`,
    notableDefects: defects.length > 0 ? defects : ["No confirmed damage items were recorded."],
    missingEvidence: [],
    recommendedDisclosure: defects.length > 0
      ? `Disclose confirmed damage before buyer-visible release: ${defects.join("; ")}.`
      : "Condition report is based on complete required photo evidence and reviewer-confirmed facts.",
    conditionReportSections: visualConditionSections({ missingEvidence: [], damageItems }),
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
    "Condition report sections:",
    ...output.conditionReportSections.flatMap((section) => [
      `${section.title} [${section.status.replaceAll("_", " ")}]`,
      ...section.observations.map((observation) => `- ${observation}`)
    ]),
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
  const suggestedGrade = input.referenceGrade ?? (isHumanReview ? 4.1 : 4.7);
  const grade = store.saveGrade(inspectionId, {
    suggestedGrade,
    conditionGradeBeforeRecon: suggestedGrade,
    evidenceBlockers: [],
    explanationJson: {
      baseGrade: 5,
      deductions: damageItems.map((item) => ({
        reason: titleDamage(item),
        amount: item.severity === "moderate" ? 0.45 : item.severity === "minor" ? 0.15 : 0.3
      }))
    },
    gradingVersion: "inspectiq-reference-grade-v2-seed"
  }, actor);
  store.approveGrade(inspectionId, suggestedGrade, null, actor);

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
      sampleKeys: sampleBundles["honda-accord-ex-set"],
      reportState: "draft_human_review"
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
      reportState: "finalized",
      referenceGrade: 4.1
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

  reconcileReconOperations(store);
  store.addAudit([...store.inspections.values()][0].id, systemActor, "inspection.queue.loaded", {
    inspections: store.inspections.size,
    note: "Initial inspection queue loaded."
  });
}

function ensureSeedUser(
  store: MemoryStore,
  input: Parameters<MemoryStore["addUser"]>[0]
) {
  return store.users.get(input.id ?? "") ?? store.addUser(input);
}

function reconcileMissingReconIntakes(store: MemoryStore): boolean {
  const missing = [...store.inspections.values()]
    .filter((inspection) => !store.recon.intakeForInspection(inspection.id));
  if (missing.length === 0) return false;

  const account = [...store.consignorAccounts.values()]
    .find((candidate) => candidate.name === "Southeast Dealer Group");
  if (!account) return false;

  const inspector = ensureSeedUser(store, {
    id: "inspector-john-smith",
    name: "John Smith",
    role: "inspector"
  });
  const admin = ensureSeedUser(store, {
    id: "operations-admin",
    name: "Operations Admin",
    role: "admin"
  });
  const adminActor: Actor = { id: admin.id, name: admin.name, role: admin.role };
  const seedClock = Date.parse(process.env.INSPECTIQ_FIXED_NOW ?? new Date().toISOString());
  const existingCount = store.vehicleIntakes.size;

  missing.forEach((inspection, offset) => {
    const sequence = existingCount + offset;
    store.recon.createVehicleIntake({
      inspectionId: inspection.id,
      consignorAccountId: account.id,
      facility: "Atlanta Main",
      yardZone: `Z${Math.floor(sequence / 3) + 1}`,
      parkingSpace: `P-${String(sequence + 17).padStart(3, "0")}`,
      saleDateTime: new Date(seedClock + (24 + offset * 6) * 3_600_000).toISOString(),
      lane: `Lane ${sequence % 3 + 1}`,
      runNumber: String(120 + sequence),
      saleEventId: `ATL-${new Date(seedClock).toISOString().slice(0, 10)}`,
      inspectionType: "VISUAL_CONDITION_REPORT"
    }, adminActor);
    store.recon.assignInspection(
      inspection.id,
      inspection.assignedToUserId ?? inspector.id,
      new Date(seedClock + (2 + offset) * 3_600_000).toISOString(),
      adminActor
    );
    store.recon.transitionInspection(inspection.id, "CAPTURE_IN_PROGRESS", adminActor);
  });

  return true;
}

export function reconcileReconOperations(store: MemoryStore): boolean {
  if (store.inspections.size === 0) return false;
  if (store.vehicleIntakes.size > 0) return reconcileMissingReconIntakes(store);

  const inspector = ensureSeedUser(store, { id: "inspector-john-smith", name: "John Smith", role: "inspector" });
  const maria = ensureSeedUser(store, { id: "inspector-maria-lee", name: "Maria Lee", role: "inspector" });
  const gateOps = ensureSeedUser(store, { id: "inspector-gate-ops", name: "Gate Ops", role: "inspector" });
  const reviewer = ensureSeedUser(store, { id: "review-lead", name: "Review Lead", role: "reviewer" });
  const reconCoordinator = ensureSeedUser(store, {
    id: "recon-coordinator",
    name: "Alex Rivera",
    role: "recon_coordinator"
  });
  const consignorApprover = ensureSeedUser(store, {
    id: "consignor-approver-sdg",
    name: "Morgan Ellis",
    role: "consignor_approver"
  });
  const technician = ensureSeedUser(store, {
    id: "technician-body-01",
    name: "Sam Patel",
    role: "technician"
  });
  const admin = ensureSeedUser(store, { id: "operations-admin", name: "Operations Admin", role: "admin" });
  const reviewerActor: Actor = { id: reviewer.id, name: reviewer.name, role: reviewer.role };
  const reconActor: Actor = { id: reconCoordinator.id, name: reconCoordinator.name, role: reconCoordinator.role };
  const adminActor: Actor = { id: admin.id, name: admin.name, role: admin.role };
  const inspectorActors: Record<string, Actor> = {
    "John Smith": { id: inspector.id, name: inspector.name, role: inspector.role },
    "Maria Lee": { id: maria.id, name: maria.name, role: maria.role },
    "Gate Ops": { id: gateOps.id, name: gateOps.name, role: gateOps.role }
  };

  const southeastDealerGroup = store.recon.createConsignorAccount({
    name: "Southeast Dealer Group",
    accountType: "DEALERSHIP",
    authorizedUserIds: [consignorApprover.id]
  }, adminActor);
  const fleetRemarketing = store.recon.createConsignorAccount({
    name: "Fleet Remarketing Partners",
    accountType: "FLEET",
    authorizedUserIds: []
  }, adminActor);
  store.recon.createPolicy({
    consignorAccountId: southeastDealerGroup.id,
    name: "Managed retail-ready policy",
    approvalMode: "AUTO_APPROVE_UNDER_LIMIT",
    totalVehicleLimit: 1_500,
    serviceRules: {
      DETAIL: { enabled: true, automaticApprovalLimit: 250 },
      MECHANICAL: { enabled: true, automaticApprovalLimit: 400 },
      BODY: { enabled: true, automaticApprovalLimit: 500 },
      TIRE: { enabled: true, automaticApprovalLimit: 350 },
      GLASS: { enabled: true, automaticApprovalLimit: 300 },
      THIRD_PARTY: { enabled: false, automaticApprovalLimit: 0 }
    },
    costOverrunTolerance: 75
  }, adminActor);
  store.recon.createPolicy({
    consignorAccountId: fleetRemarketing.id,
    name: "Fleet approval required",
    approvalMode: "MANUAL",
    totalVehicleLimit: 1_000,
    serviceRules: {
      DETAIL: { enabled: true, automaticApprovalLimit: 0 },
      MECHANICAL: { enabled: true, automaticApprovalLimit: 0 },
      BODY: { enabled: true, automaticApprovalLimit: 0 },
      TIRE: { enabled: true, automaticApprovalLimit: 0 },
      GLASS: { enabled: true, automaticApprovalLimit: 0 },
      THIRD_PARTY: { enabled: true, automaticApprovalLimit: 0 }
    },
    costOverrunTolerance: 50
  }, adminActor);

  const seedClock = Date.parse(process.env.INSPECTIQ_FIXED_NOW ?? new Date().toISOString());
  const inspections = [...store.inspections.values()];
  const saleOffsetsHours = [48, 18, 30, 72, 5, 12];
  inspections.forEach((inspection, index) => {
    const fleetVehicle = inspection.vin === "4S4BTAFC8P3204430";
    const account = fleetVehicle ? fleetRemarketing : southeastDealerGroup;
    const saleOffsetHours = saleOffsetsHours[index] ?? 24 + index * 6;
    store.recon.createVehicleIntake({
      inspectionId: inspection.id,
      consignorAccountId: account.id,
      facility: fleetVehicle ? "Atlanta South" : "Atlanta Main",
      yardZone: `Z${Math.floor(index / 3) + 1}`,
      parkingSpace: `P-${String(index + 17).padStart(3, "0")}`,
      saleDateTime: new Date(seedClock + saleOffsetHours * 3_600_000).toISOString(),
      lane: `Lane ${index % 3 + 1}`,
      runNumber: String(120 + index),
      saleEventId: `ATL-${new Date(seedClock).toISOString().slice(0, 10)}`,
      inspectionType: "VISUAL_CONDITION_REPORT"
    }, adminActor);
    store.recon.assignInspection(
      inspection.id,
      inspectorActors[inspection.inspectorName]?.id ?? inspector.id,
      new Date(seedClock + (2 + index) * 3_600_000).toISOString(),
      adminActor
    );
  });

  const workflowByVin = new Map<string, Array<"CAPTURE_IN_PROGRESS" | "RETAKE_REQUIRED" | "REVIEW_READY" | "CR_PUBLISHED">>([
    ["5NMJF3DE5RH407769", ["CAPTURE_IN_PROGRESS"]],
    ["4T1G11AK0MU520503", ["CAPTURE_IN_PROGRESS", "RETAKE_REQUIRED"]],
    ["1HGCV1F49LA129627", ["CAPTURE_IN_PROGRESS", "REVIEW_READY"]],
    ["1FMCU9H6XNUB81389", ["CAPTURE_IN_PROGRESS", "REVIEW_READY", "CR_PUBLISHED"]],
    ["KNMAT2MV6KP514068", ["CAPTURE_IN_PROGRESS", "REVIEW_READY", "CR_PUBLISHED"]],
    ["4S4BTAFC8P3204430", ["CAPTURE_IN_PROGRESS"]]
  ]);
  for (const inspection of inspections) {
    const hasPublishedReport = Boolean(store.latestFinalReport(inspection.id)?.finalizedAt);
    const statuses = (workflowByVin.get(inspection.vin) ?? [])
      .filter((status) => status !== "CR_PUBLISHED" || hasPublishedReport);
    for (const status of statuses) {
      store.recon.transitionInspection(inspection.id, status, reviewerActor);
    }
  }

  const ford = inspections.find((inspection) => inspection.vin === "1FMCU9H6XNUB81389");
  const nissan = inspections.find((inspection) => inspection.vin === "KNMAT2MV6KP514068");
  if (!ford || !nissan) return true;
  const referenceReportsPublished = [ford, nissan]
    .every((inspection) => Boolean(store.latestFinalReport(inspection.id)?.finalizedAt));
  if (!referenceReportsPublished) return true;

  const fordRecommendations = [
    store.recon.createRecommendation(ford.id, {
      damageItemId: null,
      serviceType: "DETAIL",
      recommendedAction: "Complete exterior wash, interior vacuum, and sale-lane presentation.",
      estimatedCost: 175,
      estimatedDurationHours: 1.5,
      expectedGradeLift: 0.1,
      supportingPhotoIds: [],
      notes: "CR 4.7: presentation-only scope under the consignor's sale-prep policy; no repair finding is asserted."
    }, reconActor)
  ];
  store.recon.submitEstimate(ford.id, fordRecommendations.map((item) => item.id), reconActor);
  const firstWorkOrder = store.recon.workOrdersForInspection(ford.id)[0];
  if (firstWorkOrder) {
    store.recon.updateWorkOrder(firstWorkOrder.id, {
      action: "ASSIGN_TECHNICIAN",
      assignedTechnician: technician.id,
      expectedVersion: firstWorkOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(firstWorkOrder.id, {
      action: "START",
      expectedVersion: firstWorkOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(firstWorkOrder.id, {
      action: "SEND_TO_QC",
      expectedVersion: firstWorkOrder.version
    }, reconActor);
    store.recon.recordQualityControl(firstWorkOrder.id, {
      decision: "PASS",
      notes: "Authorized presentation work verified against the work-order scope.",
      expectedVersion: firstWorkOrder.version
    }, reviewerActor);
  }
  const nissanRecommendations = [
    store.recon.createRecommendation(nissan.id, {
      damageItemId: null,
      serviceType: "DETAIL",
      recommendedAction: "Complete the account-standard sale-presentation detail.",
      estimatedCost: 175,
      estimatedDurationHours: 1.5,
      expectedGradeLift: 0.1,
      supportingPhotoIds: [],
      notes: "CR 4.1: standard sale-presentation scope under the consignor's 4.0-4.4 policy band."
    }, reconActor),
    store.recon.createRecommendation(nissan.id, {
      damageItemId: null,
      serviceType: "MECHANICAL",
      recommendedAction: "Complete the high-mileage pre-sale condition verification before the sale run.",
      estimatedCost: 275,
      estimatedDurationHours: 1.5,
      expectedGradeLift: 0,
      supportingPhotoIds: [],
      notes: "CR 4.1 and 91,168 miles trigger verification only; no mechanical defect is asserted."
    }, reconActor)
  ];
  store.recon.submitEstimate(nissan.id, nissanRecommendations.map((recommendation) => recommendation.id), reconActor);

  const nissanOrders = store.recon.workOrdersForInspection(nissan.id);
  const nissanDetailOrder = nissanOrders.find((order) => order.serviceDepartment === "DETAIL");
  if (nissanDetailOrder) {
    store.recon.updateWorkOrder(nissanDetailOrder.id, {
      action: "ASSIGN_TECHNICIAN",
      assignedTechnician: technician.id,
      expectedVersion: nissanDetailOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(nissanDetailOrder.id, {
      action: "START",
      expectedVersion: nissanDetailOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(nissanDetailOrder.id, {
      action: "SEND_TO_QC",
      expectedVersion: nissanDetailOrder.version
    }, reconActor);
    store.recon.recordQualityControl(nissanDetailOrder.id, {
      decision: "PASS",
      notes: "Sale-presentation tasks were verified against the authorized scope.",
      expectedVersion: nissanDetailOrder.version
    }, reviewerActor);
  }

  const nissanMechanicalOrder = nissanOrders.find((order) => order.serviceDepartment === "MECHANICAL");
  if (nissanMechanicalOrder) {
    store.recon.updateWorkOrder(nissanMechanicalOrder.id, {
      action: "ASSIGN_TECHNICIAN",
      assignedTechnician: technician.id,
      expectedVersion: nissanMechanicalOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(nissanMechanicalOrder.id, {
      action: "START",
      expectedVersion: nissanMechanicalOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(nissanMechanicalOrder.id, {
      action: "REVISE_ESTIMATE",
      currentEstimatedCost: 425,
      expectedVersion: nissanMechanicalOrder.version
    }, reconActor);
  }

  return true;
}
