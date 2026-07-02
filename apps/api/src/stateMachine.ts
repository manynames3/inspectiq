import type { InspectionStatus } from "@inspectiq/shared";
import { conflict } from "./errors.js";

export const allowedTransitions: Record<InspectionStatus, InspectionStatus[]> = {
  DRAFT: ["NEEDS_PHOTOS", "READY_FOR_GRADING"],
  NEEDS_PHOTOS: ["READY_FOR_GRADING"],
  READY_FOR_GRADING: ["GRADED"],
  GRADED: ["AI_DRAFT_PENDING"],
  AI_DRAFT_PENDING: ["AI_DRAFTED", "HUMAN_REVIEW_REQUIRED", "REPORT_FAILED"],
  AI_DRAFTED: ["HUMAN_REVIEW_REQUIRED", "FINALIZED"],
  HUMAN_REVIEW_REQUIRED: ["FINALIZED", "AI_DRAFT_PENDING"],
  REPORT_FAILED: ["AI_DRAFT_PENDING"],
  FINALIZED: []
};

export function canTransition(from: InspectionStatus, to: InspectionStatus): boolean {
  return from === to || allowedTransitions[from].includes(to);
}

export function assertTransition(from: InspectionStatus, to: InspectionStatus): void {
  if (!canTransition(from, to)) {
    throw conflict(`Invalid inspection status transition: ${from} -> ${to}.`, {
      from,
      to,
      allowed: allowedTransitions[from]
    });
  }
}

