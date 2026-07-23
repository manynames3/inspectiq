import type { ConditionGrade } from "./types.js";

type RuntimeConditionGrade = Partial<ConditionGrade> & {
  score?: unknown;
};

export type ConditionGradeView = {
  value: number;
  reviewState: "approved" | "suggested" | "legacy";
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function conditionGradeView(
  grade: ConditionGrade | null | undefined
): ConditionGradeView | null {
  if (!grade) return null;

  const runtimeGrade = grade as RuntimeConditionGrade;
  const approvedGrade = finiteNumber(runtimeGrade.approvedGrade);
  if (approvedGrade != null) {
    return { value: approvedGrade, reviewState: "approved" };
  }

  const suggestedGrade = finiteNumber(runtimeGrade.suggestedGrade);
  if (suggestedGrade != null) {
    return { value: suggestedGrade, reviewState: "suggested" };
  }

  const legacyScore = finiteNumber(runtimeGrade.score);
  if (legacyScore != null) {
    return {
      value: Math.max(0, Math.min(5, legacyScore / 20)),
      reviewState: "legacy"
    };
  }

  return null;
}

export function formatConditionGrade(
  grade: ConditionGrade | null | undefined,
  includeReviewState = false
): string {
  const view = conditionGradeView(grade);
  if (!view) return "Grade unavailable";

  const state = includeReviewState
    ? view.reviewState === "approved"
      ? ""
      : view.reviewState === "suggested"
        ? " suggested"
        : " migrated"
    : "";

  return `${view.value.toFixed(1)} / 5.0${state}`;
}
