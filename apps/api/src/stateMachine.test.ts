import { describe, expect, it } from "vitest";
import {
  assertBusinessTransition,
  assertTransition,
  canBusinessTransition,
  canTransition,
  inspectionWorkflowTransitions,
  reconAuthorizationTransitions,
  saleReadinessTransitions,
  workOrderTransitions
} from "./stateMachine.js";

describe("inspection state machine", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("DRAFT", "NEEDS_PHOTOS")).toBe(true);
    expect(canTransition("NEEDS_PHOTOS", "READY_FOR_GRADING")).toBe(true);
    expect(canTransition("READY_FOR_GRADING", "GRADED")).toBe(true);
    expect(canTransition("GRADED", "AI_DRAFT_PENDING")).toBe(true);
    expect(canTransition("AI_DRAFT_PENDING", "AI_DRAFTED")).toBe(true);
    expect(canTransition("AI_DRAFTED", "FINALIZED")).toBe(true);
  });

  it("blocks invalid shortcuts", () => {
    expect(() => assertTransition("DRAFT", "FINALIZED")).toThrow(/Invalid inspection status transition/);
    expect(canTransition("FINALIZED", "NEEDS_PHOTOS")).toBe(false);
  });
});

describe("business workflow state machines", () => {
  it("keeps inspection progress separate from AI and report jobs", () => {
    expect(canBusinessTransition(inspectionWorkflowTransitions, "ASSIGNED", "CAPTURE_IN_PROGRESS")).toBe(true);
    expect(canBusinessTransition(inspectionWorkflowTransitions, "CAPTURE_IN_PROGRESS", "REVIEW_READY")).toBe(true);
    expect(canBusinessTransition(inspectionWorkflowTransitions, "REVIEW_READY", "CR_PUBLISHED")).toBe(true);
    expect(() => assertBusinessTransition("inspection", inspectionWorkflowTransitions, "ASSIGNED", "CR_PUBLISHED"))
      .toThrow(/Invalid inspection transition/);
  });

  it("requires authorization before executable work and supports reauthorization", () => {
    expect(canBusinessTransition(reconAuthorizationTransitions, "ESTIMATE_PENDING", "AUTHORIZATION_PENDING")).toBe(true);
    expect(canBusinessTransition(reconAuthorizationTransitions, "AUTHORIZATION_PENDING", "PARTIALLY_AUTHORIZED")).toBe(true);
    expect(canBusinessTransition(reconAuthorizationTransitions, "AUTHORIZED", "REAUTHORIZATION_REQUIRED")).toBe(true);
    expect(canBusinessTransition(workOrderTransitions, "QUEUED", "IN_PROGRESS")).toBe(true);
    expect(canBusinessTransition(workOrderTransitions, "QC_REQUIRED", "IN_PROGRESS")).toBe(true);
    expect(canBusinessTransition(workOrderTransitions, "QC_REQUIRED", "COMPLETED")).toBe(true);
    expect(canBusinessTransition(workOrderTransitions, "QUEUED", "COMPLETED")).toBe(false);
  });

  it("allows sale readiness to be revoked when a blocker returns", () => {
    expect(canBusinessTransition(saleReadinessTransitions, "BLOCKED", "READY")).toBe(true);
    expect(canBusinessTransition(saleReadinessTransitions, "READY", "BLOCKED")).toBe(true);
  });
});
