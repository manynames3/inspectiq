import { createHash } from "node:crypto";
import { InspectorObservationSchema, requiredPhotoAngles, type ConditionQcAssessment, type ConditionQcIssue, type InspectorObservation } from "@inspectiq/shared";
import type { InspectionBundle } from "./domain.js";

type Input = Pick<InspectionBundle, "inspection" | "photos" | "suggestions" | "damageItems" | "identityVerifications" | "auditEvents">;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
const vin = (value: string) => value.toUpperCase().replace(/\s/g, "");
const mileage = (value: string) => value.replace(/[,\s]/g, "");

export function inspectorObservations(events: Input["auditEvents"]): InspectorObservation[] {
  return events.filter((event) => event.eventType === "inspector.observation_recorded").flatMap((event) => {
    const parsed = InspectorObservationSchema.safeParse(event.detailsJson);
    return parsed.success ? [{ ...parsed.data, id: event.id, recordedBy: event.actor, recordedAt: event.createdAt }] : [];
  });
}

export function assessConditionQc(input: Input): ConditionQcAssessment {
  const { inspection, auditEvents } = input;
  const photos = byId(input.photos), suggestions = byId(input.suggestions), damageItems = byId(input.damageItems), identityVerifications = byId(input.identityVerifications);
  const observations = inspectorObservations(auditEvents);
  const issues: ConditionQcIssue[] = [];
  const add = (id: string, issue: Omit<ConditionQcIssue, "id" | "fingerprint" | "status">, evidence: unknown) => {
    issues.push({ id, ...issue, fingerprint: hash({ issue, evidence }), status: "open" });
  };
  const uploaded = photos.filter((photo) => photo.uploadStatus === "uploaded");
  const angleFor = (photo: Input["photos"][number]) => {
    const accepted = suggestions.find((s) => s.photoId === photo.id && s.suggestionType === "photo_angle" && s.status === "accepted");
    return accepted ? record(accepted.suggestedValueJson).photoAngle : photo.declaredAngle ?? photo.detectedAngle;
  };
  for (const angle of requiredPhotoAngles) {
    if (!uploaded.some((photo) => angleFor(photo) === angle)) {
      add(`coverage:${angle}`, { category: "coverage", title: `Capture ${angle.replaceAll("_", " ")}`, detail: "No uploaded photo covers this required view.", action: "Capture or import an image for this view; quality judgments require separate review.", photoIds: [], objective: true }, angle);
    }
  }
  for (const photo of photos) {
    if (photo.uploadStatus !== "uploaded" || photo.analysisStatus !== "completed") {
      add(`analysis:${photo.id}`, { category: "analysis", title: `Evidence not assessed: ${photo.originalFilename}`, detail: photo.uploadStatus !== "uploaded" ? "Upload is incomplete; this file cannot support a report." : "Analysis has not completed. No absence-of-damage conclusion can be made.", action: "Complete the upload, retry analysis, or replace the photo.", photoIds: [photo.id], objective: photo.uploadStatus !== "uploaded" }, { upload: photo.uploadStatus, analysis: photo.analysisStatus });
    }
    if (photo.qualityStatus === "fail") {
      const reviewedWarnings = suggestions.filter((s) => s.photoId === photo.id && s.suggestionType === "quality_warning");
      const replacement = uploaded.some((p) => p.id !== photo.id && angleFor(p) === angleFor(photo) && p.qualityStatus === "ok" && p.analysisStatus === "completed");
      const reasonedRejection = reviewedWarnings.some((s) => s.status === "rejected" && auditEvents.some((event) => {
        const decision = record(event.detailsJson);
        return event.eventType === "suggestion.rejected" && decision.suggestionId === s.id && typeof decision.reason === "string" && decision.reason.trim().length >= 10;
      }));
      if (!replacement && !reasonedRejection) add(`quality:${photo.id}`, { category: "quality", title: `Unable to assess ${photo.originalFilename}`, detail: "Photo quality does not support a reliable condition assessment.", action: "Request a targeted recapture or document a reviewer override.", photoIds: [photo.id], objective: false }, { quality: photo.qualityStatus, warnings: reviewedWarnings.map((s) => [s.id, s.status, s.version]) });
    }
  }
  const checksums = new Map<string, string[]>();
  for (const photo of uploaded) {
    if (!photo.checksumSha256) continue;
    const digest = /^[a-f0-9]{64}$/i.test(photo.checksumSha256) ? photo.checksumSha256.toLowerCase() : Buffer.from(photo.checksumSha256, "base64").toString("hex");
    checksums.set(digest, [...(checksums.get(digest) ?? []), photo.id]);
  }
  for (const [digest, photoIds] of checksums) {
    if (photoIds.length > 1) add(`duplicate:${digest}`, { category: "duplicate", title: "Identical photo uploaded more than once", detail: "These files have identical checksums. They do not establish independent vehicle coverage.", action: "Review the assigned views and replace incorrect duplicates, or explain intentional reuse.", photoIds, objective: false }, photoIds);
  }
  const identity = {} as ConditionQcAssessment["identity"];
  for (const field of ["vin", "odometer"] as const) {
    const expected = field === "vin" ? vin(inspection.vin) : String(inspection.mileage);
    const verified = identityVerifications.find((item) => item.field === field);
    const normalize = field === "vin" ? vin : mileage;
    const normalized = verified ? normalize(verified.value) : null;
    const observed = field === "odometer" && normalized && /^\d{1,6}$/.test(normalized) ? String(Number(normalized)) : normalized;
    const complete = observed != null && (field === "vin" ? /^[A-HJ-NPR-Z0-9]{17}$/.test(observed) : /^\d{1,6}$/.test(observed));
    const sourcePhoto = verified ? photos.find((p) => p.id === verified.photoId && p.uploadStatus === "uploaded" && p.sourceName !== "Reference identity capture") : null;
    const status = !complete || !sourcePhoto ? "unable_to_verify" : observed === expected ? "verified" : "discrepancy";
    identity[field] = { status, expected, observed, photoId: verified?.photoId ?? null };
    if (status !== "verified") add(`identity:${field}`, { category: "identity", title: `${field === "vin" ? "VIN" : "Mileage"}: ${status === "discrepancy" ? "discrepancy" : "unable to verify"}`, detail: observed ? `Intake: ${expected}. Reviewed evidence: ${observed}.` : "No complete, human-confirmed image reading is available. Vehicle metadata is not evidence verification.", action: "Check the intake record and image; correct the reading, recapture, or record an explicit limitation.", photoIds: verified ? [verified.photoId] : uploaded.filter((p) => angleFor(p) === (field === "vin" ? "vin_plate" : "odometer")).map((p) => p.id), objective: false }, identity[field]);
  }
  for (const suggestion of suggestions.filter((s) => s.status === "pending" || s.status === "edited")) {
    const low = suggestion.confidence < 0.85;
    add(`suggestion:${suggestion.id}`, { category: "review", title: `${low ? "Low certainty — " : ""}${suggestion.suggestionType.replaceAll("_", " ")}`, detail: suggestion.explanation, action: "Inspect the evidence, then confirm, correct, reject, or request recapture in the finding review panel.", photoIds: [suggestion.photoId], suggestionId: suggestion.id, objective: false }, { value: suggestion.suggestedValueJson, version: suggestion.version });
  }
  for (const item of damageItems) {
    if (item.photoId && uploaded.some((p) => p.id === item.photoId)) continue;
    add(`claim:${item.id}`, { category: "unsupported_claim", title: `Unlinked finding: ${item.location}`, detail: "This damage statement has no uploaded supporting photo. Preserve its inspector attribution; do not present it as photo-verified.", action: "Link supporting evidence or document why this is an in-person observation.", photoIds: [], objective: false }, item);
  }
  for (const observation of observations) {
    if (observation.outcome !== "damage_observed") continue;
    if (observation.photoId && uploaded.some((p) => p.id === observation.photoId)) {
      if (!damageItems.some((item) => item.photoId === observation.photoId)) add(`observation-line-item:${observation.id}`, { category: "unsupported_claim", title: `Checklist damage needs a line item: ${observation.area}`, detail: "This attributed observation is not included in the structured damage inputs used for grading.", action: "Add a confirmed damage line item or explicitly disclose why it is excluded from grading.", photoIds: [observation.photoId], objective: false }, { observation, damageItems });
      continue;
    }
    add(`observation:${observation.id}`, { category: "unsupported_claim", title: `Inspector observation without photo: ${observation.area}`, detail: observation.notes, action: "Add supporting evidence or acknowledge this as an attributed in-person observation.", photoIds: [], objective: false }, observation);
  }
  for (const event of auditEvents.filter((e) => e.eventType === "condition_qc.reviewed")) {
    const decision = record(event.detailsJson);
    const issue = issues.find((i) => i.id === decision.issueId && i.fingerprint === decision.fingerprint);
    if (!issue || issue.objective || issue.suggestionId) continue;
    if (decision.decision === "reviewed" || decision.decision === "overridden") {
      issue.status = decision.decision;
      issue.decision = { actor: event.actor, reason: String(decision.reason), decidedAt: event.createdAt };
    }
  }
  const open = issues.filter((i) => i.status === "open");
  return {
    sourceFingerprint: hash({ policy: "condition-qc-v1", intake: [inspection.vin, inspection.mileage, inspection.year, inspection.make, inspection.model, inspection.trim], photos: byId(photos).map((p) => [p.id, p.declaredAngle, p.detectedAngle, p.qualityStatus, p.uploadStatus, p.analysisStatus, p.checksumSha256, p.storageKey]), suggestions: byId(suggestions).map((s) => [s.id, s.version, s.status]), damageItems: byId(damageItems), identityVerifications: byId(identityVerifications), observations: byId(observations), evidenceEvents: byId(auditEvents.filter((e) => ["condition_qc.reviewed", "photo.analyzed", "photo.analysis_failed"].includes(e.eventType))).map((e) => e.id) }),
    issues, observations, identity, openCount: open.length,
    objectiveBlockerCount: open.filter((i) => i.objective).length,
    reviewRequiredCount: open.filter((i) => !i.objective).length,
    publicationReady: open.length === 0
  };
}
