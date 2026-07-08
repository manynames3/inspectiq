import { findSampleImageByObjectKey, sampleBundles, sampleImages } from "./sampleImages.js";
import type { Actor, DamageItem, VehiclePhoto } from "./domain.js";
import { MemoryStore } from "./store.js";
import type { DamageSeverity, DamageType, PhotoAngle, VisionOutput } from "@inspectiq/shared";

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
  vin: string;
  mileage: number;
}): VisionOutput {
  const isBlurryRetake = input.storageKey.includes("blurry-front");
  const extractedText: VisionOutput["extractedText"] = {};
  if (input.angle === "vin_plate") extractedText.vin = input.vin;
  if (input.angle === "odometer") extractedText.odometer = String(input.mileage);

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

  return {
    photoAngle: input.angle,
    confidence: confidenceForAngle(input.angle),
    imageQuality: seedImageQuality({
      grade: input.angle === "interior" ? "review" : "pass",
      notes: [`Imported ${input.angle.replaceAll("_", " ")} image matched the required capture slot.`]
    }),
    qualityWarnings: [],
    detectedDamageCandidates: [],
    extractedText,
    humanReviewRequired: input.angle === "vin_plate" || input.angle === "odometer"
  };
}

function setIfChanged<T extends keyof VehiclePhoto>(photo: VehiclePhoto, key: T, value: VehiclePhoto[T]): boolean {
  if (photo[key] === value) return false;
  photo[key] = value;
  return true;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reconcileReferenceEvidence(store: MemoryStore): boolean {
  let changed = false;
  for (const photo of store.photos.values()) {
    if (photo.objectBucket !== "inspectiq-sample-images") continue;
    const sample = findSampleImageByObjectKey(photo.objectKey);
    if (!sample) continue;

    const inspection = store.inspections.get(photo.inspectionId);
    const storageKey = sample.storageKey ?? `/sample-images/${sample.filename}`;
    const output = referenceVisionOutput({
      angle: sample.angle,
      storageKey,
      vin: inspection?.vin ?? "",
      mileage: inspection?.mileage ?? 0
    });

    changed = setIfChanged(photo, "storageKey", storageKey) || changed;
    changed = setIfChanged(photo, "thumbnailStorageKey", storageKey) || changed;
    changed = setIfChanged(photo, "originalFilename", sample.filename) || changed;
    changed = setIfChanged(photo, "mimeType", sample.mimeType) || changed;
    changed = setIfChanged(photo, "sourceName", sample.sourceName ?? null) || changed;
    changed = setIfChanged(photo, "sourceUrl", sample.sourceUrl ?? null) || changed;
    changed = setIfChanged(photo, "sourceLicense", sample.sourceLicense ?? null) || changed;
    changed = setIfChanged(photo, "declaredAngle", sample.angle) || changed;
    changed = setIfChanged(photo, "detectedAngle", output.photoAngle) || changed;
    changed = setIfChanged(photo, "detectedAngleConfidence", output.confidence) || changed;
    changed = setIfChanged(photo, "qualityStatus", output.qualityWarnings.length > 0 ? "warning" : "ok") || changed;
    changed = setIfChanged(photo, "analysisStatus", "completed") || changed;

    for (const analysis of store.analyses.values()) {
      if (analysis.photoId !== photo.id || analysis.status !== "completed") continue;
      const raw = {
        source: "reference-import",
        filename: sample.filename,
        angle: sample.angle
      };
      if (analysis.provider !== "referenceImportProvider") {
        analysis.provider = "referenceImportProvider";
        changed = true;
      }
      if (analysis.promptVersion !== "photo-import-v1") {
        analysis.promptVersion = "photo-import-v1";
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
      if (suggestion.photoId !== photo.id || suggestion.suggestionType !== "photo_angle") continue;
      const suggestedValue = { photoAngle: output.photoAngle };
      const explanation = `Likely photo angle: ${output.photoAngle}. Reviewer confirmation required.`;
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
  }
  return changed;
}

function analyzeImportedPhoto(store: MemoryStore, input: {
  inspectionId: string;
  photoId: string;
  storageKey: string;
  originalFilename: string;
  angle: PhotoAngle;
  vin: string;
  mileage: number;
}, actor: Actor): void {
  const photo = store.getPhoto(input.photoId);
  store.saveAnalysis(photo, {
    provider: "referenceImportProvider",
    promptVersion: "photo-import-v1",
    raw: {
      source: "reference-import",
      filename: input.originalFilename,
      angle: input.angle
    },
    validated: referenceVisionOutput({
      angle: input.angle,
      storageKey: input.storageKey,
      vin: input.vin,
      mileage: input.mileage
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

type ReferenceConfirmedDamage = {
  angle: PhotoAngle;
  location: string;
  damageType: DamageType;
  severity: DamageSeverity;
  notes: string;
};

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
  confirmedDamage?: ReferenceConfirmedDamage[];
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
    if (report) store.finalizeReport(report.id, actor);
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
      confirmedDamage: [
        {
          angle: "driver_side",
          location: "Driver-side front door",
          damageType: "scratch",
          severity: "minor",
          notes: "Reviewer confirmed a light scratch on the driver-side front door from uploaded side evidence."
        }
      ],
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
      confirmedDamage: [
        {
          angle: "rear",
          location: "Rear bumper",
          damageType: "dent",
          severity: "moderate",
          notes: "Reviewer confirmed rear bumper deformation visible in the rear evidence image."
        }
      ],
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
    const photoByAngle = new Map<PhotoAngle, string>();
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
        declaredAngle: sample.angle
      }, actor);
      photoByAngle.set(sample.angle, photo.id);
      analyzeImportedPhoto(store, {
        inspectionId: inspection.id,
        photoId: photo.id,
        storageKey,
        originalFilename: sample.filename,
        angle: sample.angle,
        vin: input.vin,
        mileage: input.mileage
      }, actor);
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
        declaredAngle: "vin_plate"
      }, actor);
      photoByAngle.set("vin_plate", vinPhoto.id);
      analyzeImportedPhoto(store, {
        inspectionId: inspection.id,
        photoId: vinPhoto.id,
        storageKey: vinPhoto.storageKey,
        originalFilename: vinPhoto.originalFilename,
        angle: "vin_plate",
        vin: input.vin,
        mileage: input.mileage
      }, actor);
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
        declaredAngle: "odometer"
      }, actor);
      photoByAngle.set("odometer", odometerPhoto.id);
      analyzeImportedPhoto(store, {
        inspectionId: inspection.id,
        photoId: odometerPhoto.id,
        storageKey: odometerPhoto.storageKey,
        originalFilename: odometerPhoto.originalFilename,
        angle: "odometer",
        vin: input.vin,
        mileage: input.mileage
      }, actor);
    }

    for (const damage of input.confirmedDamage ?? []) {
      store.addDamage({
        inspectionId: inspection.id,
        photoId: photoByAngle.get(damage.angle) ?? null,
        location: damage.location,
        damageType: damage.damageType,
        severity: damage.severity,
        notes: damage.notes,
        source: "vision_suggestion",
        confirmedBy: reviewer.id
      }, reviewerActor);
    }

    createReferenceReport(store, input, inspection.id, reviewerActor);
  }

  store.addAudit([...store.inspections.values()][0].id, systemActor, "inspection.queue.loaded", {
    inspections: store.inspections.size,
    note: "Initial inspection queue loaded."
  });
}
