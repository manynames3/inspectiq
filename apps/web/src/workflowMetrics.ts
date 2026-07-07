import type { Inspection } from "./types.js";

const reviewQueueStatuses = new Set([
  "READY_FOR_GRADING",
  "GRADED",
  "AI_DRAFT_PENDING",
  "AI_DRAFTED",
  "HUMAN_REVIEW_REQUIRED",
  "REPORT_FAILED"
]);

export function isCaptureQueueInspection(inspection: Inspection): boolean {
  return inspection.status === "DRAFT" ||
    inspection.status === "NEEDS_PHOTOS" ||
    inspection.completenessPercentage < 100;
}

export function isReviewQueueInspection(inspection: Inspection): boolean {
  return reviewQueueStatuses.has(inspection.status) ||
    (inspection.status !== "FINALIZED" && Boolean(inspection.humanReviewFlag));
}

export function isOverdueInspection(inspection: Inspection): boolean {
  return inspection.status === "REPORT_FAILED" ||
    (inspection.status !== "FINALIZED" && Boolean(inspection.humanReviewFlag));
}

export function inspectionNeedsWork(inspection: Inspection): boolean {
  return inspection.status !== "FINALIZED" ||
    Boolean(inspection.humanReviewFlag) ||
    inspection.buyerVisibleReady === false ||
    (inspection.readinessIssueCount ?? 0) > 0;
}

export function summarizeWorkflowMetrics(inspections: Inspection[]) {
  const requests = inspections.length;
  const inReview = inspections.filter(isReviewQueueInspection).length;
  const overdue = inspections.filter(isOverdueInspection).length;
  const systemAllGood = inspections.every((inspection) => inspection.status !== "REPORT_FAILED");

  return {
    requests,
    inReview,
    overdue,
    system: systemAllGood ? "All good" : "Needs attention"
  };
}
