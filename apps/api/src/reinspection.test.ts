import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { ReinspectionRequestSchema } from "@inspectiq/shared";
import type { Actor } from "./domain.js";
import { MemoryStore } from "./store.js";
import { reconcileReconOperations, reconcileReferenceEvidence, seedStore } from "./seedData.js";

const reviewer: Actor = { id: "reinspection-reviewer", name: "Reinspection Reviewer", role: "reviewer" };

function fixture() {
  const store = new MemoryStore();
  seedStore(store);
  const source = [...store.inspections.values()].find((inspection) => inspection.vin === "1FMCU9H6XNUB81389")!;
  const report = store.latestFinalReport(source.id)!;
  const input = { operationId: crypto.randomUUID(), reason: "Recapture and review this vehicle under the current evidence policy.", expectedReportVersion: report.version };
  return { store, source, report, input };
}

describe("audited reinspection", () => {
  beforeEach(() => { vi.stubEnv("INSPECTIQ_FIXED_NOW", "2026-10-13T12:00:00.000Z"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("creates a metadata-only draft with audited lineage without changing historical facts", () => {
    const { store, source, report, input } = fixture();
    const sourceBytes = JSON.stringify(source);
    const reportBytes = JSON.stringify(report);
    const versionsBytes = JSON.stringify(store.reportVersionsFor(report.id));
    const evidenceBytes = JSON.stringify(store.bundle(source.id).photos);
    const historicalAudit = JSON.stringify(store.auditForInspection(source.id));
    const workBytes = JSON.stringify(store.recon.operationsRecord(source.id, reviewer));
    const { inspection, reused } = store.createReinspection(source.id, input, reviewer);

    expect(reused).toBe(false);
    expect(inspection.id).not.toBe(source.id);
    expect(inspection).toMatchObject({
      vin: source.vin, year: source.year, make: source.make, model: source.model,
      trim: source.trim, mileage: source.mileage, exteriorColor: source.exteriorColor,
      sellerSource: source.sellerSource, inspectorName: source.inspectorName,
      assignedToUserId: source.assignedToUserId, createdBy: reviewer.id,
      status: "DRAFT", completenessPercentage: 0, version: 1, finalizedAt: null,
      reinspectionSourceInspectionId: source.id, reinspectionSourceReportId: report.id,
      reinspectionSourceReportVersion: report.version, reinspectionReason: input.reason,
      reinspectionOperationId: input.operationId
    });
    const replacement = store.bundle(inspection.id);
    for (const key of ["photos", "photoAnalysisResults", "imageAnalysisJobs", "suggestions", "damageItems", "identityVerifications"] as const) expect(replacement[key]).toEqual([]);
    for (const key of ["conditionGrade", "aiReportJob", "aiReportDraft", "finalReport"] as const) expect(replacement[key]).toBeNull();
    expect(replacement.requiresReinspection).toBe(false);
    expect(store.recon.intakeForInspection(inspection.id)).toBeNull();
    expect(store.recon.recommendationsForInspection(inspection.id)).toEqual([]);
    expect(store.recon.authorizationsForInspection(inspection.id)).toEqual([]);
    expect(store.recon.workOrdersForInspection(inspection.id)).toEqual([]);
    expect(JSON.stringify(source)).toBe(sourceBytes);
    expect(JSON.stringify(report)).toBe(reportBytes);
    expect(JSON.stringify(store.reportVersionsFor(report.id))).toBe(versionsBytes);
    expect(JSON.stringify(store.bundle(source.id).photos)).toBe(evidenceBytes);
    expect(JSON.stringify(store.recon.operationsRecord(source.id, reviewer))).toBe(workBytes);
    const lineage = store.auditForInspection(source.id).at(-1)!;
    expect(JSON.stringify(store.auditForInspection(source.id).slice(0, -1))).toBe(historicalAudit);
    expect(lineage).toMatchObject({ eventType: "inspection.reinspection_requested", detailsJson: {
      sourceInspectionId: source.id, sourceReportId: report.id, sourceReportVersion: report.version,
      replacementInspectionId: inspection.id, operationId: input.operationId, reason: input.reason, actor: reviewer
    } });
    expect(replacement.auditEvents.some((event) => event.eventType === "inspection.reinspection_created")).toBe(true);
  });

  it("reuses the original operation without overwriting subsequent replacement work", () => {
    const { store, source, input } = fixture();
    const first = store.createReinspection(source.id, input, reviewer).inspection;
    store.patchInspection(first.id, { mileage: first.mileage + 1 }, reviewer);
    const bytes = JSON.stringify(store.bundle(first.id));
    const count = store.inspections.size;
    const retry = store.createReinspection(source.id, { ...input, operationId: input.operationId.toUpperCase() }, reviewer);
    expect(retry).toEqual({ inspection: first, reused: true });
    expect(store.inspections.size).toBe(count);
    expect(JSON.stringify(store.bundle(first.id))).toBe(bytes);
    expect(() => store.createReinspection(source.id, { ...input, reason: "A different reason must not reuse the same operation." }, reviewer)).toThrow(/different request/);
    expect(() => store.createReinspection(source.id, { ...input, expectedReportVersion: input.expectedReportVersion + 1 }, reviewer)).toThrow(/changed after it was loaded/);
  });

  it("requires finalized historical records, exact report versions, role permission, and source scope", () => {
    const { store, source, report, input } = fixture();
    for (const role of ["recon_coordinator", "consignor_approver", "technician"] as const) {
      expect(() => store.createReinspection(source.id, input, { ...reviewer, role })).toThrow(/role cannot/);
    }
    expect(() => store.createReinspection(source.id, input, { id: "unassigned", name: "Unassigned Inspector", role: "inspector" })).toThrow(/assigned to another/);
    expect(() => store.createReinspection(source.id, input, { ...reviewer, id: "evaluation-reviewer" })).toThrow(/read-only/);
    expect(() => store.createReinspection(source.id, { ...input, expectedReportVersion: input.expectedReportVersion + 1 }, reviewer)).toThrow(/changed after it was loaded/);
    const finalizedAt = report.finalizedAt;
    report.finalizedAt = null;
    expect(() => store.createReinspection(source.id, input, reviewer)).toThrow(/finalized inspection and report/);
    report.finalizedAt = finalizedAt;
    source.status = "DRAFT";
    expect(() => store.createReinspection(source.id, input, reviewer)).toThrow(/finalized inspection and report/);
  });

  it("marks legacy finalized reports for reinspection without trusting missing fingerprints", () => {
    const { store, source, report, input } = fixture();
    expect(store.bundle(source.id).requiresReinspection).toBe(false);
    const grade = store.latestGrade(source.id)!;
    const draft = store.latestReportDraft(source.id)!;
    delete (grade.explanationJson as Record<string, unknown>).gradeEvidenceFingerprint;
    delete (draft.inputSummaryJson as Record<string, unknown>).sourceFingerprint;
    const reportBytes = JSON.stringify(report);
    expect(store.bundle(source.id).requiresReinspection).toBe(true);
    expect(store.buyerVisibleReady(source.id)).toBe(false);
    const replacement = store.createReinspection(source.id, input, reviewer).inspection;
    expect(store.bundle(source.id).requiresReinspection).toBe(true);
    expect(store.bundle(replacement.id).requiresReinspection).toBe(false);
    expect(JSON.stringify(report)).toBe(reportBytes);
  });

  it("never synthesizes facility, sale, or recon records for reinspection descendants", () => {
    const { store, source, input } = fixture();
    const replacement = store.createReinspection(source.id, input, reviewer).inspection;
    expect(reconcileReconOperations(store)).toBe(false);
    store.transition(replacement.id, "NEEDS_PHOTOS", reviewer, "inspection.status_changed");
    expect(reconcileReconOperations(store)).toBe(false);
    store.recon.reset();
    expect(reconcileReconOperations(store)).toBe(true);
    expect(store.recon.intakeForInspection(replacement.id)).toBeNull();
    expect([...store.inspectionAssignments.values()].filter((record) => record.inspectionId === replacement.id)).toEqual([]);
    expect(store.recon.saleAssignmentForInspection(replacement.id)).toBeNull();
    expect(store.recon.workOrdersForInspection(replacement.id)).toEqual([]);
  });

  it("discloses historical exports without rewriting published report or approval history", () => {
    const { store, source, report } = fixture();
    expect(store.buyerReportExport(report.id).body).not.toContain("HISTORICAL PUBLISHED REPORT");
    delete (store.latestGrade(source.id)!.explanationJson as Record<string, unknown>).gradeEvidenceFingerprint;
    delete (store.latestReportDraft(source.id)!.inputSummaryJson as Record<string, unknown>).sourceFingerprint;
    const inspectionBytes = JSON.stringify(source);
    const reportBytes = JSON.stringify(report);
    const versionsBytes = JSON.stringify(store.reportVersionsFor(report.id));
    const exported = store.buyerReportExport(report.id);
    expect(exported.body).toContain("HISTORICAL PUBLISHED REPORT — REINSPECTION REQUIRED");
    expect(exported.body).toContain("Not certified under the current condition-report quality-control policy.");
    expect(exported.body).toContain("A fresh inspection and human review are required before a new buyer-visible release.");
    expect(exported.body).toContain(report.reportBody);
    expect(exported.body).toContain(`Report Version: ${report.version}`);
    expect(JSON.stringify(source)).toBe(inspectionBytes);
    expect(JSON.stringify(report)).toBe(reportBytes);
    expect(JSON.stringify(store.reportVersionsFor(report.id))).toBe(versionsBytes);
  });

  it("never repairs finalized reference history or independently captured reinspection facts on startup", () => {
    const { store, source, report, input } = fixture();
    const sourcePhoto = store.listPhotos(source.id).find((photo) => photo.declaredAngle === "driver_side")!;
    sourcePhoto.storageKey = "https://historical.example/original-evidence.jpg";
    sourcePhoto.detectedAngle = "front";
    sourcePhoto.detectedAngleConfidence = 0.11;
    sourcePhoto.qualityStatus = "warning";
    const analysis = [...store.analyses.values()].find((record) => record.photoId === sourcePhoto.id)!;
    analysis.provider = "referenceImportProvider";
    analysis.promptVersion = "historical-reference-v0";
    analysis.rawModelOutputJson = { source: "reference-import", historical: true };
    const grade = store.latestGrade(source.id)!;
    grade.explanationJson = { deductions: [{ reason: "minor scratch at Driver-side front door", amount: 0.15 }] };
    report.reportBody = "Original historical disclosure: minor scratch at Driver-side front door.";
    for (const version of store.reportVersionsFor(report.id)) version.reportBody = `Historical approval version ${version.version}: keep this text.`;
    store.damageItems.set("historical-ford-scratch", {
      id: "historical-ford-scratch", inspectionId: source.id, photoId: sourcePhoto.id,
      location: "Driver-side front door", damageType: "scratch", severity: "minor",
      notes: "Reviewer confirmed a light scratch on the driver-side front door from uploaded side evidence.",
      source: "vision_suggestion", confirmedBy: reviewer.id, idempotencyKey: null,
      createdAt: source.createdAt, updatedAt: source.updatedAt
    });
    const historicOcr = store.createSuggestion({ inspectionId: source.id, photoId: sourcePhoto.id, suggestionType: "extracted_text", suggestedValueJson: { vin: source.vin }, confidence: 0.7, explanation: "Historical OCR decision." });
    historicOcr.status = "accepted";
    store.identityVerifications.set("historical-vin-review", { id: "historical-vin-review", inspectionId: source.id, photoId: sourcePhoto.id, field: "vin", value: source.vin, sourceSuggestionId: historicOcr.id, verifiedBy: reviewer.id, verifiedAt: source.createdAt });
    store.createSuggestion({ inspectionId: source.id, photoId: sourcePhoto.id, suggestionType: "quality_warning", suggestedValueJson: { warning: "Historical quality warning." }, confidence: 0.5, explanation: "Historical warning." });
    const angle = store.listSuggestions(source.id).find((suggestion) => suggestion.photoId === sourcePhoto.id && suggestion.suggestionType === "photo_angle")!;
    store.suggestions.set("historical-duplicate-angle", { ...angle, id: "historical-duplicate-angle", status: "pending" });
    const replacement = store.createReinspection(source.id, input, reviewer).inspection;
    const freshPhoto = store.addPhoto({ inspectionId: replacement.id, storageKey: "https://current.example/independent-photo.jpg", originalFilename: sourcePhoto.originalFilename, mimeType: "image/jpeg", captureSource: "reference", sourceName: sourcePhoto.sourceName, sourceUrl: sourcePhoto.sourceUrl, uploadedBy: reviewer.id, declaredAngle: "driver_side" }, reviewer);
    const freshSuggestion = store.createSuggestion({ inspectionId: replacement.id, photoId: freshPhoto.id, suggestionType: "quality_warning", suggestedValueJson: { warning: "Fresh inspector warning; not a manifest claim." }, confidence: 0.5, explanation: "Keep new reviewer facts separate." });
    store.suggestions.set("fresh-duplicate-warning", { ...freshSuggestion, id: "fresh-duplicate-warning" });
    const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const sourceBytes = fingerprint(store.bundle(source.id));
    const sourceVersions = JSON.stringify(store.reportVersionsFor(report.id));
    const analysisBytes = JSON.stringify(analysis);
    const replacementBytes = fingerprint(store.bundle(replacement.id));

    reconcileReferenceEvidence(store);
    expect(fingerprint(store.bundle(source.id))).toBe(sourceBytes);
    expect(JSON.stringify(store.reportVersionsFor(report.id))).toBe(sourceVersions);
    expect(JSON.stringify(analysis)).toBe(analysisBytes);
    expect(fingerprint(store.bundle(replacement.id))).toBe(replacementBytes);
    expect((grade.explanationJson as { deductions: unknown[] }).deductions).toHaveLength(1);
  });

  it.each([false, true])("never bootstraps recon or changes a finalized original missing an intake (empty recon=%s)", (empty) => {
    const { store, source, report } = fixture();
    const existingRecon = JSON.stringify(store.recon.operationsRecord(source.id, reviewer));
    expect(reconcileReconOperations(store)).toBe(false);
    expect(JSON.stringify(store.recon.operationsRecord(source.id, reviewer))).toBe(existingRecon);
    if (empty) {
      store.recon.reset();
    } else {
      const intake = store.recon.intakeForInspection(source.id)!;
      store.vehicleIntakes.delete(intake.id);
    }
    const sourceBytes = JSON.stringify(source);
    const reportBytes = JSON.stringify(report);
    const workBytes = JSON.stringify(store.recon.workOrdersForInspection(source.id));
    const assignmentBytes = JSON.stringify([...store.inspectionAssignments.values()].filter((assignment) => assignment.inspectionId === source.id));
    const auditBytes = JSON.stringify(store.auditForInspection(source.id));

    reconcileReconOperations(store);
    expect(store.recon.intakeForInspection(source.id)).toBeNull();
    expect(JSON.stringify(source)).toBe(sourceBytes);
    expect(JSON.stringify(report)).toBe(reportBytes);
    expect(JSON.stringify(store.recon.workOrdersForInspection(source.id))).toBe(workBytes);
    expect(JSON.stringify([...store.inspectionAssignments.values()].filter((assignment) => assignment.inspectionId === source.id))).toBe(assignmentBytes);
    expect(JSON.stringify(store.auditForInspection(source.id))).toBe(auditBytes);
  });

  it("validates the reason, operation UUID, and positive report version without accepting extra edits", () => {
    const { input } = fixture();
    for (const invalid of [
      { ...input, reason: "short" }, { ...input, reason: "x".repeat(1001) },
      { ...input, operationId: "not-a-uuid" }, { ...input, expectedReportVersion: 0 },
      { ...input, expectedReportVersion: 1.5 }, { ...input, status: "FINALIZED" }
    ]) expect(ReinspectionRequestSchema.safeParse(invalid).success).toBe(false);
  });
});
