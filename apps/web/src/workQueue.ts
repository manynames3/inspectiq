import type { Inspection } from "./types.js";

export function inspectionNextStep(inspection: Inspection): string {
  if (inspection.status === "FINALIZED") return "View released report";
  if (inspection.status === "REPORT_FAILED") return "Recover report draft";
  if (inspection.completenessPercentage < 100) return "Complete photo evidence";
  if (inspection.readinessIssueCount) return `Resolve ${inspection.readinessIssueCount} exceptions`;
  if (inspection.humanReviewFlag || inspection.status === "HUMAN_REVIEW_REQUIRED") return "Review evidence";
  if (inspection.status === "READY_FOR_GRADING") return "Review condition grade";
  return "Continue report review";
}

export function inspectionPriority(inspection: Inspection): number {
  if (inspection.status === "FINALIZED") return 0;
  if (inspection.status === "REPORT_FAILED") return 4;
  if (inspection.humanReviewFlag || inspection.readinessIssueCount) return 3;
  if (inspection.completenessPercentage < 100) return 2;
  return 1;
}
