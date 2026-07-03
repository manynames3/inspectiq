import type { InspectionStatus } from "@inspectiq/shared";

const labels: Record<InspectionStatus, string> = {
  DRAFT: "Draft",
  NEEDS_PHOTOS: "Needs photos",
  READY_FOR_GRADING: "Ready for grading",
  GRADED: "Graded",
  AI_DRAFT_PENDING: "Draft pending",
  AI_DRAFTED: "Report drafted",
  HUMAN_REVIEW_REQUIRED: "Human review",
  FINALIZED: "Finalized",
  REPORT_FAILED: "Report failed"
};

export function statusLabel(status: InspectionStatus): string {
  return labels[status];
}

export function StatusPill({ status }: { status: InspectionStatus }) {
  return <span className={`status-pill status-${status.toLowerCase().replaceAll("_", "-")}`}>{statusLabel(status)}</span>;
}
