import type {
  InspectionStatus,
  InspectionWorkflowStatus,
  ReconAuthorizationStatus,
  SaleReadinessStatus,
  WorkOrderStatus
} from "@inspectiq/shared";
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

export const inspectionWorkflowTransitions: Record<InspectionWorkflowStatus, InspectionWorkflowStatus[]> = {
  ASSIGNED: ["CAPTURE_IN_PROGRESS"],
  CAPTURE_IN_PROGRESS: ["REVIEW_READY", "RETAKE_REQUIRED"],
  REVIEW_READY: ["RETAKE_REQUIRED", "CR_PUBLISHED"],
  RETAKE_REQUIRED: ["CAPTURE_IN_PROGRESS"],
  CR_PUBLISHED: []
};

export const reconAuthorizationTransitions: Record<ReconAuthorizationStatus, ReconAuthorizationStatus[]> = {
  ESTIMATE_PENDING: ["AUTHORIZATION_PENDING"],
  AUTHORIZATION_PENDING: ["AUTHORIZED", "PARTIALLY_AUTHORIZED", "DECLINED"],
  AUTHORIZED: ["REAUTHORIZATION_REQUIRED"],
  PARTIALLY_AUTHORIZED: ["REAUTHORIZATION_REQUIRED"],
  DECLINED: [],
  REAUTHORIZATION_REQUIRED: ["AUTHORIZED", "PARTIALLY_AUTHORIZED", "DECLINED"]
};

export const workOrderTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  QUEUED: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["BLOCKED", "QC_REQUIRED"],
  BLOCKED: ["IN_PROGRESS"],
  QC_REQUIRED: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: []
};

export const saleReadinessTransitions: Record<SaleReadinessStatus, SaleReadinessStatus[]> = {
  BLOCKED: ["READY"],
  READY: ["BLOCKED", "SCHEDULED"],
  SCHEDULED: ["BLOCKED", "READY"]
};

export function canBusinessTransition<T extends string>(
  transitions: Record<T, T[]>,
  from: T,
  to: T
): boolean {
  return from === to || transitions[from].includes(to);
}

export function assertBusinessTransition<T extends string>(
  workflow: string,
  transitions: Record<T, T[]>,
  from: T,
  to: T
): void {
  if (canBusinessTransition(transitions, from, to)) return;
  throw conflict(`Invalid ${workflow} transition: ${from} -> ${to}.`, {
    workflow,
    from,
    to,
    allowed: transitions[from]
  });
}
