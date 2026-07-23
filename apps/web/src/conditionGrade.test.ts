import { describe, expect, it } from "vitest";
import { conditionGradeView, formatConditionGrade } from "./conditionGrade.js";
import type { ConditionGrade } from "./types.js";

function grade(overrides: Partial<ConditionGrade> = {}): ConditionGrade {
  return {
    id: "grade-1",
    inspectionId: "inspection-1",
    suggestedGrade: 4.2,
    approvedGrade: null,
    conditionGradeBeforeRecon: 4.2,
    estimatedGradeAfterRecon: 4.2,
    reviewedBy: null,
    overrideReason: null,
    evidenceBlockers: [],
    explanationJson: {},
    gradingVersion: "reference-v1",
    version: 1,
    createdAt: "2026-07-23T00:00:00.000Z",
    reviewedAt: null,
    ...overrides
  };
}

describe("condition grade display", () => {
  it("prefers the reviewer-approved reference grade", () => {
    expect(conditionGradeView(grade({ approvedGrade: 4.5 }))).toEqual({
      value: 4.5,
      reviewState: "approved"
    });
    expect(formatConditionGrade(grade({ approvedGrade: 4.5 }), true)).toBe("4.5 / 5.0 approved");
  });

  it("labels an unapproved grade as suggested", () => {
    expect(formatConditionGrade(grade(), true)).toBe("4.2 / 5.0 suggested");
  });

  it("converts a legacy 100-point score without rendering undefined", () => {
    const legacyGrade = { score: 76 } as unknown as ConditionGrade;

    expect(conditionGradeView(legacyGrade)).toEqual({
      value: 3.8,
      reviewState: "legacy"
    });
    expect(formatConditionGrade(legacyGrade, true)).toBe("3.8 / 5.0 migrated");
  });

  it("returns an explicit unavailable state for malformed data", () => {
    expect(formatConditionGrade({} as ConditionGrade)).toBe("Grade unavailable");
    expect(formatConditionGrade(null)).toBe("Grade unavailable");
  });
});
