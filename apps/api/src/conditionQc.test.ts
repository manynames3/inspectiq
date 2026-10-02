import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { requiredPhotoAngles } from "@inspectiq/shared";
import { MemoryStore } from "./store.js";
import { assessConditionQc } from "./conditionQc.js";
import { visualConditionSections } from "./reportProvider.js";
import type { Actor } from "./domain.js";

const reviewer: Actor = { id: "reviewer", name: "Independent Reviewer", role: "reviewer" };
function setup() {
  const store = new MemoryStore();
  const inspection = store.createInspection({ vin: "1FMCU9H6XNUB81389", year: 2022, make: "Ford", model: "Escape", trim: "SEL", mileage: 31992, exteriorColor: "Blue", sellerSource: "Owner", inspectorName: reviewer.name }, reviewer);
  return { store, inspection };
}
function addViews(store: MemoryStore, inspectionId: string) {
  return requiredPhotoAngles.map((angle, index) => {
    const photo = store.addPhoto({ inspectionId, storageKey: `/test/${angle}.jpg`, originalFilename: `${angle}.jpg`, mimeType: "image/jpeg", uploadedBy: reviewer.id, declaredAngle: angle, checksumSha256: index.toString(16).repeat(64) }, reviewer);
    photo.analysisStatus = "completed"; photo.qualityStatus = "ok";
    return photo;
  });
}
describe("condition-report QC", () => {
  it("never verifies identity from metadata or a complete checklist", () => {
    const { store, inspection } = setup();
    addViews(store, inspection.id);
    const qc = store.conditionQc(inspection.id);
    expect(qc.identity.vin.status).toBe("unable_to_verify");
    expect(qc.identity.odometer.status).toBe("unable_to_verify");
    expect(qc.objectiveBlockerCount).toBe(0);
    expect(qc.publicationReady).toBe(false);
    expect(visualConditionSections({ missingEvidence: [], damageItems: [], conditionQc: qc }).find((s) => s.key === "VIN_VERIFICATION")?.status).toBe("REQUIRES_REVIEW");
  });
  it("normalizes mileage but keeps mismatched VIN explicit", () => {
    const { store, inspection } = setup();
    const photos = addViews(store, inspection.id);
    for (const field of ["vin", "odometer"] as const) {
      store.upsertIdentityVerification({ inspectionId: inspection.id, photoId: photos.find((p) => p.declaredAngle === (field === "vin" ? "vin_plate" : "odometer"))!.id, field, value: field === "vin" ? "1HGCV1F49LA129627" : "031,992", sourceSuggestionId: randomUUID(), verifiedBy: reviewer.id }, reviewer);
    }
    expect(store.conditionQc(inspection.id).identity.vin.status).toBe("discrepancy");
    expect(store.conditionQc(inspection.id).identity.odometer.status).toBe("verified");
  });
  it("refuses synthetic identity cards as vehicle verification", () => {
    const { store, inspection } = setup();
    const photo = addViews(store, inspection.id).find((p) => p.declaredAngle === "vin_plate")!;
    photo.sourceName = "Reference identity capture";
    store.upsertIdentityVerification({ inspectionId: inspection.id, photoId: photo.id, field: "vin", value: inspection.vin, sourceSuggestionId: randomUUID(), verifiedBy: reviewer.id }, reviewer);
    expect(store.conditionQc(inspection.id).identity.vin.status).toBe("unable_to_verify");
  });
  it("blocks objective missing coverage and incomplete uploads without overrides", () => {
    const { store, inspection } = setup();
    const issue = store.conditionQc(inspection.id).issues.find((i) => i.category === "coverage")!;
    expect(() => store.reviewConditionQc(inspection.id, { issueId: issue.id, fingerprint: issue.fingerprint, decision: "overridden", reason: "Skip required evidence for this vehicle." }, reviewer)).toThrow(/cannot be overridden/);
    const photo = addViews(store, inspection.id)[0]; photo.uploadStatus = "pending";
    expect(store.conditionQc(inspection.id).issues.find((i) => i.id === `analysis:${photo.id}`)?.objective).toBe(true);
  });
  it("audits acknowledgments without upgrading identity and rejects stale evidence", () => {
    const { store, inspection } = setup();
    const issue = store.conditionQc(inspection.id).issues.find((i) => i.id === "identity:vin")!;
    store.reviewConditionQc(inspection.id, { issueId: issue.id, fingerprint: issue.fingerprint, decision: "reviewed", reason: "VIN is unreadable; explicitly disclose unable to verify." }, reviewer);
    expect(store.conditionQc(inspection.id).issues.find((i) => i.id === issue.id)?.status).toBe("reviewed");
    expect(store.conditionQc(inspection.id).identity.vin.status).toBe("unable_to_verify");
    inspection.vin = "1HGCV1F49LA129627";
    expect(store.conditionQc(inspection.id).issues.find((i) => i.id === issue.id)?.status).toBe("open");
    expect(() => store.reviewConditionQc(inspection.id, { issueId: issue.id, fingerprint: issue.fingerprint, decision: "reviewed", reason: "Attempt to reuse a stale review decision." }, reviewer)).toThrow(/Evidence changed/);
  });
  it("detects duplicate files even when checksum encodings differ", () => {
    const { store, inspection } = setup();
    const photos = addViews(store, inspection.id);
    photos[1].checksumSha256 = Buffer.from(photos[0].checksumSha256!, "hex").toString("base64");
    expect(store.conditionQc(inspection.id).issues.find((i) => i.category === "duplicate")?.photoIds).toHaveLength(2);
  });
  it("keeps model quality judgments reviewable separately from objective coverage", () => {
    const { store, inspection } = setup();
    const photo = addViews(store, inspection.id)[0]; photo.qualityStatus = "fail";
    const qc = store.conditionQc(inspection.id);
    expect(qc.issues.find((i) => i.id === `quality:${photo.id}`)?.objective).toBe(false);
    expect(qc.issues.some((i) => i.id === "coverage:front")).toBe(false);
  });
  it("records checklist notes idempotently and builds an attributed draft without photos", () => {
    const { store, inspection } = setup();
    const input = { area: "glass" as const, outcome: "damage_observed" as const, notes: "Windshield crack seen during in-person inspection.", photoId: null, operationId: randomUUID() };
    const first = store.recordInspectorObservation(inspection.id, input, reviewer);
    expect(store.recordInspectorObservation(inspection.id, input, reviewer).id).toBe(first.id);
    const qc = store.conditionQc(inspection.id);
    expect(qc.observations).toHaveLength(1);
    expect(qc.draftSections?.find((s) => s.key === "WINDSHIELD_AND_GLASS")?.observations.join(" ")).toContain(input.notes);
    expect(qc.issues.some((i) => i.id === `observation:${first.id}`)).toBe(true);
  });
  it("refuses damage and note evidence belonging to another inspection", () => {
    const { store, inspection } = setup();
    const other = store.createInspection({ ...inspection, inspectorName: reviewer.name }, reviewer);
    const photo = addViews(store, other.id)[0];
    expect(() => store.addDamage({ inspectionId: inspection.id, photoId: photo.id, location: "bumper", damageType: "dent", severity: "minor", notes: "", source: "manual" }, reviewer)).toThrow(/belong/);
    expect(() => store.recordInspectorObservation(inspection.id, { area: "exterior", outcome: "damage_observed", notes: "Wrong vehicle", photoId: photo.id, operationId: randomUUID() }, reviewer)).toThrow(/belong/);
  });
  it("keeps fingerprints stable across array/object ordering after persistence", () => {
    const { store, inspection } = setup(); addViews(store, inspection.id);
    const input = store.bundle(inspection.id);
    const original = assessConditionQc(input).sourceFingerprint;
    input.photos.reverse(); input.suggestions.reverse(); input.auditEvents.reverse();
    expect(assessConditionQc(input).sourceFingerprint).toBe(original);
  });
  it("invalidates grades when structured damage changes", () => {
    const { store, inspection } = setup();
    store.saveGrade(inspection.id, { suggestedGrade: 4.8, conditionGradeBeforeRecon: 4.8, evidenceBlockers: [], explanationJson: {}, gradingVersion: "test-only" }, reviewer);
    expect(store.isGradeCurrent(inspection.id)).toBe(true);
    store.addDamage({ inspectionId: inspection.id, location: "hood", damageType: "dent", severity: "severe", notes: "In-person observation", source: "manual" }, reviewer);
    expect(store.isGradeCurrent(inspection.id)).toBe(false);
    expect(() => store.approveGrade(inspection.id, 4.8, null, reviewer)).toThrow(/Recalculate/);
  });
});
