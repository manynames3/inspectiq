import { describe, expect, it } from "vitest";
import { requiredPhotoAngles } from "@inspectiq/shared";
import { findSampleImage, sampleImages, samplePhotoSets } from "./sampleImages.js";
import { reconcileReferenceEvidence, seedStore } from "./seedData.js";
import { MemoryStore } from "./store.js";

describe("reference evidence reconciliation", () => {
  it("keeps each vehicle reference set mapped to one image per required angle", () => {
    for (const set of samplePhotoSets) {
      const angles = set.sampleKeys.map((sampleKey) => {
        const sample = findSampleImage(sampleKey);
        expect(sample, `Missing sample ${sampleKey} in ${set.key}`).toBeTruthy();
        return sample!.angle;
      });

      expect(new Set(angles).size, `${set.key} should not duplicate angle slots`).toBe(angles.length);
      expect([...angles].sort()).toEqual([...requiredPhotoAngles].sort());
    }
  });

  it("does not treat dealer-listing metadata as pixel-derived quality evidence", () => {
    const listingPhotos = sampleImages.filter((sample) =>
      sample.sourceLicense?.startsWith("External dealer listing URL")
    );

    expect(listingPhotos.length).toBeGreaterThan(0);
    for (const photo of listingPhotos) {
      expect(photo.referenceAngleConfidence, photo.filename).toBeUndefined();
      expect(photo.referenceQualityGrade, photo.filename).toBeUndefined();
      expect(photo.referenceRetakeRequired, photo.filename).toBeUndefined();
      expect(photo.referenceQualityWarnings, photo.filename).toBeUndefined();
      expect(photo.referenceQualityNotes, photo.filename).toBeUndefined();
    }
  });

  it("keeps the Honda Accord physical side views mapped to the correct source images", () => {
    expect(findSampleImage("honda-accord-driver-side")?.storageKey).toContain("/1/640x480");
    expect(findSampleImage("honda-accord-passenger-side")?.storageKey).toContain("/9/640x480");

    const store = new MemoryStore();
    seedStore(store);
    const honda = [...store.inspections.values()].find((inspection) => inspection.vin === "1HGCV1F49LA129627");
    expect(honda).toBeTruthy();

    const passengerPhoto = [...store.photos.values()].find((photo) =>
      photo.inspectionId === honda?.id &&
      photo.objectKey === "sample-images/honda-accord-passenger-side"
    );
    expect(passengerPhoto).toBeTruthy();

    passengerPhoto!.storageKey = "https://carfax-img.vast.com/carfax/v2/866048677535386941/1/640x480";
    passengerPhoto!.thumbnailStorageKey = passengerPhoto!.storageKey;
    passengerPhoto!.detectedAngleConfidence = 0.94;
    passengerPhoto!.qualityStatus = "ok";

    expect(reconcileReferenceEvidence(store)).toBe(true);

    expect(passengerPhoto!.storageKey).toBe("https://carfax-img.vast.com/carfax/v2/866048677535386941/9/640x480");
    expect(passengerPhoto!.declaredAngle).toBe("passenger_side");
    expect(passengerPhoto!.detectedAngle).toBe("passenger_side");
    expect(passengerPhoto!.detectedAngleConfidence).toBe(0.94);
    expect(passengerPhoto!.qualityStatus).toBe("ok");
  });

  it("keeps the Copart Acura source-scoped and leaves unavailable evidence missing", () => {
    expect(findSampleImage("acura-tlx-driver-side")?.storageKey).toContain("c4160fc96bc4400599b2861bc2ee2b4a_hrs.jpg");
    expect(findSampleImage("acura-tlx-passenger-side")?.storageKey).toContain("7e4aea6354e840688a04dbdc345350fe_hrs.jpg");
    expect(findSampleImage("acura-tlx-front-damage-detail")?.angle).toBe("driver_side");

    const store = new MemoryStore();
    seedStore(store);
    const acura = [...store.inspections.values()].find((inspection) => inspection.vin === "19UUB2F58FA******");
    expect(acura).toBeTruthy();

    const photos = store.listPhotos(acura!.id);
    expect(photos).toHaveLength(7);
    expect(photos.every((photo) =>
      photo.sourceName === "Copart lot 56620356" &&
      photo.sourceUrl === "https://www.copart.com/lot/56620356/salvage-2015-acura-tlx-tech-il-chicago-north"
    )).toBe(true);
    expect(store.missingRequiredEvidence(acura!.id).sort()).toEqual(["engine_bay", "vin_plate"]);
    expect(photos.some((photo) => photo.mimeType === "image/svg+xml")).toBe(false);
  });

  it("repairs stale uploaded reference-evidence rows from the current manifest", () => {
    const store = new MemoryStore();
    seedStore(store);
    const honda = [...store.inspections.values()].find((inspection) => inspection.vin === "1HGCV1F49LA129627");
    expect(honda).toBeTruthy();

    const driverPhoto = [...store.photos.values()].find((photo) =>
      photo.inspectionId === honda?.id &&
      photo.objectKey === "sample-images/honda-accord-driver-side"
    );
    const passengerPhoto = [...store.photos.values()].find((photo) =>
      photo.inspectionId === honda?.id &&
      photo.objectKey === "sample-images/honda-accord-passenger-side"
    );
    expect(driverPhoto).toBeTruthy();
    expect(passengerPhoto).toBeTruthy();

    driverPhoto!.objectBucket = "inspectiq-prod-images";
    driverPhoto!.objectKey = "uploads/reference-evidence/2020-honda-accord-1hgcv1f49la129627/driver-side-old.jpg";
    driverPhoto!.storageKey = "https://carfax-img.vast.com/carfax/v2/866048677535386941/1/640x480";
    driverPhoto!.thumbnailStorageKey = driverPhoto!.storageKey;
    driverPhoto!.detectedAngleConfidence = 0.97;

    passengerPhoto!.objectBucket = "inspectiq-prod-images";
    passengerPhoto!.objectKey = "uploads/reference-evidence/2020-honda-accord-1hgcv1f49la129627/passenger-side-old.jpg";
    passengerPhoto!.storageKey = "https://carfax-img.vast.com/carfax/v2/866048677535386941/8/640x480";
    passengerPhoto!.thumbnailStorageKey = passengerPhoto!.storageKey;
    passengerPhoto!.detectedAngleConfidence = 0.82;
    passengerPhoto!.qualityStatus = "warning";

    expect(reconcileReferenceEvidence(store)).toBe(true);

    expect(driverPhoto!.storageKey).toBe("s3://inspectiq-prod-images/uploads/reference-evidence/2020-honda-accord-1hgcv1f49la129627/driver-side-old.jpg");
    expect(driverPhoto!.declaredAngle).toBe("driver_side");
    expect(driverPhoto!.detectedAngle).toBe("driver_side");
    expect(driverPhoto!.detectedAngleConfidence).toBe(0.94);
    expect(driverPhoto!.qualityStatus).toBe("ok");

    expect(passengerPhoto!.storageKey).toBe("s3://inspectiq-prod-images/uploads/reference-evidence/2020-honda-accord-1hgcv1f49la129627/passenger-side-old.jpg");
    expect(passengerPhoto!.declaredAngle).toBe("passenger_side");
    expect(passengerPhoto!.detectedAngle).toBe("passenger_side");
    expect(passengerPhoto!.detectedAngleConfidence).toBe(0.94);
    expect(passengerPhoto!.qualityStatus).toBe("ok");
  });

  it("repairs stale Toyota Camry front reference evidence to the direct front image", () => {
    const store = new MemoryStore();
    seedStore(store);
    const camry = [...store.inspections.values()].find((inspection) => inspection.vin === "4T1G11AK0MU520503");
    expect(camry).toBeTruthy();

    const frontPhoto = [...store.photos.values()].find((photo) =>
      photo.inspectionId === camry?.id &&
      photo.objectKey === "sample-images/toyota-camry-front"
    );
    expect(frontPhoto).toBeTruthy();

    frontPhoto!.objectBucket = "inspectiq-prod-images";
    frontPhoto!.objectKey = "uploads/reference-evidence/2021-toyota-camry-4t1g11ak0mu520503/front-old.jpg";
    frontPhoto!.storageKey = "https://pictures.dealer.com/a/autonationhondaofrenton/1957/c7b577ac16141bbc1161d145810ad97cx.jpg";
    frontPhoto!.thumbnailStorageKey = frontPhoto!.storageKey;
    frontPhoto!.detectedAngleConfidence = 0.95;
    frontPhoto!.qualityStatus = "ok";
    const staleWarning = store.createSuggestion({
      inspectionId: camry!.id,
      photoId: frontPhoto!.id,
      suggestionType: "quality_warning",
      suggestedValueJson: {
        warning: "Front listing photo is a three-quarter angle; reviewer should request a direct front retake if buyer-facing standards require it.",
        imageQuality: {
          grade: "review",
          blurScore: 0.94,
          exposureScore: 0.92,
          framingScore: 0.84,
          resolutionScore: 0.93,
          occlusionRisk: 0.04,
          retakeRequired: false,
          notes: []
        }
      },
      confidence: 0.75,
      explanation: "Reference-source QA note requires reviewer confirmation."
    });
    store.acceptSuggestion(staleWarning.id, {
      id: "legacy-reviewer",
      name: "Legacy Reviewer",
      role: "reviewer"
    });

    expect(reconcileReferenceEvidence(store)).toBe(true);

    expect(frontPhoto!.storageKey).toBe("s3://inspectiq-prod-images/uploads/reference-evidence/2021-toyota-camry-4t1g11ak0mu520503/front-old.jpg");
    expect(frontPhoto!.declaredAngle).toBe("front");
    expect(frontPhoto!.detectedAngle).toBe("front");
    expect(frontPhoto!.detectedAngleConfidence).toBe(0.95);
    expect(frontPhoto!.qualityStatus).toBe("ok");
    expect(store.suggestions.has(staleWarning.id)).toBe(false);
    expect(store.auditForInspection(camry!.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "reference_evidence.corrected",
        detailsJson: expect.objectContaining({
          correction: "unsupported_quality_claim_removed",
          photoId: frontPhoto!.id,
          removedSuggestions: [
            expect.objectContaining({
              id: staleWarning.id,
              status: "accepted",
              reviewedBy: "legacy-reviewer"
            })
          ]
        })
      })
    ]));
  });

  it("does not confirm an unsupported scratch on the Ford Escape reference evidence", () => {
    const store = new MemoryStore();
    seedStore(store);
    const ford = [...store.inspections.values()].find((inspection) => inspection.vin === "1FMCU9H6XNUB81389");
    expect(ford).toBeTruthy();

    expect(store.listDamage(ford!.id)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        location: "Driver-side front door",
        damageType: "scratch"
      })
    ]));
    expect(store.latestFinalReport(ford!.id)?.reportBody).not.toContain("scratch");
  });

  it("does not create confirmed damage or OCR findings from reference metadata", () => {
    const store = new MemoryStore();
    seedStore(store);

    expect([...store.damageItems.values()]).toEqual([]);
    expect([...store.suggestions.values()].filter((suggestion) => suggestion.suggestionType === "extracted_text")).toEqual([]);
    expect([...store.photos.values()].every((photo) => photo.captureSource === "reference")).toBe(true);
    expect([...store.analyses.values()].every((analysis) => analysis.provider === "referenceManifestProvider")).toBe(true);
    expect([...store.auditEvents.values()].some((event) => event.eventType === "photo.analyzed")).toBe(false);
    expect([...store.auditEvents.values()].some((event) => event.eventType === "reference_evidence.mapped")).toBe(true);
  });

  it("repairs the exact unsupported Ford scratch in an already-persisted reference record", () => {
    const store = new MemoryStore();
    seedStore(store);
    const ford = [...store.inspections.values()].find((inspection) => inspection.vin === "1FMCU9H6XNUB81389")!;
    const driverPhoto = [...store.photos.values()].find((photo) =>
      photo.inspectionId === ford.id && photo.declaredAngle === "driver_side"
    )!;
    const report = store.latestFinalReport(ford.id)!;
    const timestamp = new Date().toISOString();

    store.damageItems.set("legacy-unsupported-ford-scratch", {
      id: "legacy-unsupported-ford-scratch",
      inspectionId: ford.id,
      photoId: driverPhoto.id,
      location: "Driver-side front door",
      damageType: "scratch",
      severity: "minor",
      notes: "Reviewer confirmed a light scratch on the driver-side front door from uploaded side evidence.",
      source: "vision_suggestion",
      confirmedBy: "review-lead",
      createdAt: timestamp,
      updatedAt: timestamp
    });
    report.reportBody = "Notable defects:\n- minor scratch at Driver-side front door";

    expect(reconcileReferenceEvidence(store)).toBe(true);
    expect(store.listDamage(ford.id)).toEqual([]);
    expect(report.reportBody).not.toContain("scratch");
    expect(store.auditForInspection(ford.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "reference_evidence.corrected",
        detailsJson: expect.objectContaining({ correction: "unsupported_damage_removed" })
      })
    ]));
  });

  it("removes unsupported Nissan and Honda claims without deleting the source photos", () => {
    const store = new MemoryStore();
    seedStore(store);
    const reviewer = { id: "review-lead", name: "Review Lead", role: "reviewer" as const };
    const nissan = [...store.inspections.values()].find((inspection) => inspection.vin === "KNMAT2MV6KP514068")!;
    const nissanRear = store.listPhotos(nissan.id).find((photo) => photo.originalFilename === "2019-nissan-rogue-rear.jpg")!;
    const honda = [...store.inspections.values()].find((inspection) => inspection.vin === "1HGCV1F49LA129627")!;
    const hondaRear = store.listPhotos(honda.id).find((photo) => photo.originalFilename === "2020-honda-accord-rear.jpg")!;
    const timestamp = new Date().toISOString();

    store.damageItems.set("legacy-nissan-dent", {
      id: "legacy-nissan-dent",
      inspectionId: nissan.id,
      photoId: nissanRear.id,
      location: "Rear bumper",
      damageType: "dent",
      severity: "moderate",
      notes: "Reviewer confirmed rear bumper deformation visible in the rear evidence image.",
      source: "vision_suggestion",
      confirmedBy: reviewer.id,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    const hondaSuggestion = store.createSuggestion({
      inspectionId: honda.id,
      photoId: hondaRear.id,
      suggestionType: "damage_candidate",
      suggestedValueJson: {
        location: "rear bumper",
        damageType: "dent",
        severityEstimate: "moderate",
        confidence: 0.87,
        explanation: "Source listing photo appears to show rear bumper deformation; reviewer confirmation required.",
        repairEstimateUsd: { min: 500, max: 1200, rationale: "Legacy reference fixture." },
        requiresHumanConfirmation: true
      },
      confidence: 0.87,
      explanation: "Source listing photo appears to show rear bumper deformation; reviewer confirmation required."
    });
    store.acceptSuggestion(hondaSuggestion.id, reviewer);

    expect(reconcileReferenceEvidence(store)).toBe(true);
    expect(store.listDamage(nissan.id)).toEqual([]);
    expect(store.listDamage(honda.id)).toEqual([]);
    expect(store.listSuggestions(honda.id).some((suggestion) => suggestion.id === hondaSuggestion.id)).toBe(false);
    expect(store.getPhoto(nissanRear.id).storageKey).toBeTruthy();
    expect(store.getPhoto(hondaRear.id).storageKey).toBeTruthy();
  });

  it("removes metadata-derived OCR claims but preserves a later model analysis", () => {
    const store = new MemoryStore();
    seedStore(store);
    const reviewer = { id: "review-lead", name: "Review Lead", role: "reviewer" as const };
    const toyota = [...store.inspections.values()].find((inspection) => inspection.vin === "4T1G11AK0MU520503")!;
    const odometer = store.listPhotos(toyota.id).find((photo) => photo.declaredAngle === "odometer")!;
    const metadataSuggestion = store.createSuggestion({
      inspectionId: toyota.id,
      photoId: odometer.id,
      suggestionType: "extracted_text",
      suggestedValueJson: { odometer: String(toyota.mileage) },
      confidence: 0.98,
      explanation: "Possible odometer or VIN text detected. Reviewer confirmation required before approval."
    });
    store.acceptSuggestion(metadataSuggestion.id, reviewer);

    expect(reconcileReferenceEvidence(store)).toBe(true);
    expect(store.listSuggestions(toyota.id).some((suggestion) => suggestion.id === metadataSuggestion.id)).toBe(false);
    expect(store.listIdentityVerifications(toyota.id)).toEqual([]);

    const modelResult = store.saveAnalysis(odometer, {
      provider: "bedrockVisionProvider",
      promptVersion: "photo-analysis-v2",
      raw: { source: "bedrock" },
      validated: {
        photoAngle: "odometer",
        confidence: 0.91,
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
        detectedDamageCandidates: [],
        extractedText: { odometer: String(toyota.mileage) },
        humanReviewRequired: true
      },
      force: true
    }, reviewer);

    reconcileReferenceEvidence(store);
    expect(store.analyses.get(modelResult.id)?.provider).toBe("bedrockVisionProvider");
    expect(store.getPhoto(odometer.id).detectedAngleConfidence).toBe(0.91);
    expect(store.listSuggestions(toyota.id).some((suggestion) => suggestion.suggestionType === "extracted_text")).toBe(true);
  });

  it("persists a successful model retry after a later schema failure", () => {
    const store = new MemoryStore();
    seedStore(store);
    const actor = { id: "operations-admin", name: "Operations Admin", role: "admin" as const };
    const acura = [...store.inspections.values()].find((inspection) => inspection.vin === "19UUB2F58FA******")!;
    const photo = store.listPhotos(acura.id).find((candidate) => candidate.originalFilename.includes("damage-detail"))!;
    const initialAnalysisCount = [...store.analyses.values()].filter((analysis) => analysis.photoId === photo.id).length;
    const output = (confidence: number) => ({
      photoAngle: "driver_side" as const,
      confidence,
      imageQuality: {
        grade: "review" as const,
        blurScore: 0.9,
        exposureScore: 0.82,
        framingScore: 0.8,
        resolutionScore: 0.9,
        occlusionRisk: 0.05,
        retakeRequired: false,
        notes: ["Front-left collision damage is visible."]
      },
      qualityWarnings: [],
      detectedDamageCandidates: [],
      extractedText: {},
      humanReviewRequired: true
    });

    const first = store.saveAnalysis(photo, {
      provider: "bedrockVisionProvider",
      promptVersion: "photo-analysis-v4",
      raw: { attempt: 1 },
      validated: output(0.91)
    }, actor);
    store.failAnalysis(photo, "bedrockVisionProvider", "photo-analysis-v4", "Schema validation failed.", actor);
    const recovered = store.saveAnalysis(photo, {
      provider: "bedrockVisionProvider",
      promptVersion: "photo-analysis-v4",
      raw: { attempt: 2 },
      validated: output(0.97)
    }, actor);

    expect(recovered.id).not.toBe(first.id);
    expect(photo.analysisStatus).toBe("completed");
    expect(photo.detectedAngleConfidence).toBe(0.97);
    expect([...store.analyses.values()].filter((analysis) => analysis.photoId === photo.id)).toHaveLength(initialAnalysisCount + 3);
  });

  it("reuses the same actionable finding when a photo is analyzed repeatedly", () => {
    const store = new MemoryStore();
    seedStore(store);
    const honda = [...store.inspections.values()].find((inspection) => inspection.vin === "1HGCV1F49LA129627")!;
    const passenger = store.listPhotos(honda.id).find((photo) => photo.declaredAngle === "passenger_side")!;
    const warning = store.createSuggestion({
      inspectionId: honda.id,
      photoId: passenger.id,
      suggestionType: "quality_warning",
      suggestedValueJson: {
        warning: "Passenger-side framing requires review.",
        imageQuality: {
          grade: "review",
          blurScore: 0.9,
          exposureScore: 0.9,
          framingScore: 0.72,
          resolutionScore: 0.9,
          occlusionRisk: 0.05,
          retakeRequired: false,
          notes: []
        }
      },
      confidence: 0.72,
      explanation: "Passenger-side framing requires review. Reviewer confirmation required."
    });
    const suggestionCount = store.listSuggestions(honda.id).length;
    const previousVersion = warning.version;

    const repeated = store.createSuggestion({
      inspectionId: honda.id,
      photoId: passenger.id,
      suggestionType: "quality_warning",
      suggestedValueJson: {
        warning: (warning.suggestedValueJson as { warning: string }).warning,
        imageQuality: {
          ...(warning.suggestedValueJson as { imageQuality: Record<string, unknown> }).imageQuality,
          framingScore: 0.93
        }
      },
      confidence: 0.74,
      explanation: warning.explanation
    });

    expect(repeated.id).toBe(warning.id);
    expect(repeated.version).toBe(previousVersion + 1);
    expect(store.listSuggestions(honda.id)).toHaveLength(suggestionCount);
  });

  it("supersedes stale pending findings when current model output no longer supports them", () => {
    const store = new MemoryStore();
    seedStore(store);
    const actor = { id: "bedrock-worker", name: "Bedrock Worker", role: "admin" as const };
    const reviewer = { id: "review-lead", name: "Review Lead", role: "reviewer" as const };
    const toyota = [...store.inspections.values()].find((inspection) => inspection.vin === "4T1G11AK0MU520503")!;
    const front = store.listPhotos(toyota.id).find((photo) => photo.declaredAngle === "front")!;
    const stalePending = store.createSuggestion({
      inspectionId: toyota.id,
      photoId: front.id,
      suggestionType: "quality_warning",
      suggestedValueJson: {
        warning: "Front listing photo is a three-quarter angle.",
        imageQuality: {
          grade: "review",
          blurScore: 0.9,
          exposureScore: 0.9,
          framingScore: 0.7,
          resolutionScore: 0.9,
          occlusionRisk: 0.05,
          retakeRequired: false,
          notes: []
        }
      },
      confidence: 0.72,
      explanation: "Front listing photo is a three-quarter angle. Reviewer confirmation required."
    });
    const reviewedFinding = store.createSuggestion({
      inspectionId: toyota.id,
      photoId: front.id,
      suggestionType: "quality_warning",
      suggestedValueJson: {
        warning: "Reviewer previously confirmed a separate glare concern.",
        imageQuality: {
          grade: "review",
          blurScore: 0.9,
          exposureScore: 0.7,
          framingScore: 0.9,
          resolutionScore: 0.9,
          occlusionRisk: 0.05,
          retakeRequired: false,
          notes: []
        }
      },
      confidence: 0.7,
      explanation: "Reviewer previously confirmed a separate glare concern."
    });
    store.rejectSuggestion(reviewedFinding.id, reviewer);

    store.saveAnalysis(front, {
      provider: "bedrockVisionProvider",
      promptVersion: "photo-analysis-v2",
      raw: { source: "bedrock" },
      validated: {
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
          notes: ["Centered direct-front evidence."]
        },
        qualityWarnings: [],
        detectedDamageCandidates: [],
        extractedText: {},
        humanReviewRequired: false
      },
      force: true
    }, actor);

    expect(store.suggestions.has(stalePending.id)).toBe(false);
    expect(store.suggestions.get(reviewedFinding.id)?.status).toBe("rejected");
    expect(front.qualityStatus).toBe("ok");
    expect(store.auditForInspection(toyota.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "suggestion.superseded",
        detailsJson: expect.objectContaining({
          photoId: front.id,
          removedSuggestionIds: expect.arrayContaining([stalePending.id]),
          provider: "bedrockVisionProvider"
        })
      })
    ]));
  });

  it("treats odometer readings with leading zeros as the same finding", () => {
    const store = new MemoryStore();
    seedStore(store);
    const honda = [...store.inspections.values()].find((inspection) => inspection.vin === "1HGCV1F49LA129627")!;
    const odometer = store.listPhotos(honda.id).find((photo) => photo.declaredAngle === "odometer")!;
    const first = store.createSuggestion({
      inspectionId: honda.id,
      photoId: odometer.id,
      suggestionType: "extracted_text",
      suggestedValueJson: { odometer: "079037" },
      confidence: 0.91,
      explanation: "Detected odometer reading. Reviewer confirmation required."
    });
    const repeated = store.createSuggestion({
      inspectionId: honda.id,
      photoId: odometer.id,
      suggestionType: "extracted_text",
      suggestedValueJson: { odometer: "79037" },
      confidence: 0.94,
      explanation: "Detected odometer reading. Reviewer confirmation required."
    });

    expect(repeated.id).toBe(first.id);
    expect(store.listSuggestions(honda.id).filter((suggestion) =>
      suggestion.photoId === odometer.id &&
      suggestion.suggestionType === "extracted_text"
    )).toHaveLength(1);
  });

  it("removes legacy duplicate review rows while retaining the completed decision", () => {
    const store = new MemoryStore();
    seedStore(store);
    const honda = [...store.inspections.values()].find((inspection) => inspection.vin === "1HGCV1F49LA129627")!;
    const front = store.listPhotos(honda.id).find((photo) => photo.declaredAngle === "front")!;
    const accepted = store.listSuggestions(honda.id).find((suggestion) =>
      suggestion.photoId === front.id &&
      suggestion.suggestionType === "photo_angle" &&
      suggestion.status === "accepted"
    )!;
    store.suggestions.set("legacy-duplicate-angle", {
      ...accepted,
      id: "legacy-duplicate-angle",
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      resolvedAt: null,
      createdAt: new Date(Date.parse(accepted.createdAt) + 60_000).toISOString(),
      version: 1
    });

    expect(reconcileReferenceEvidence(store)).toBe(true);
    const matching = store.listSuggestions(honda.id).filter((suggestion) =>
      suggestion.photoId === front.id &&
      suggestion.suggestionType === "photo_angle" &&
      JSON.stringify(suggestion.suggestedValueJson) === JSON.stringify(accepted.suggestedValueJson)
    );
    expect(matching).toEqual([expect.objectContaining({ id: accepted.id, status: "accepted" })]);
    expect(store.auditForInspection(honda.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "suggestion.duplicates_reconciled",
        detailsJson: expect.objectContaining({
          removedSuggestionIds: ["legacy-duplicate-angle"]
        })
      })
    ]));
  });
});
