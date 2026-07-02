import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./stateMachine.js";

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

