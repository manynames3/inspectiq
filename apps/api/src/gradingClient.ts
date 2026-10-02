import { GradingOutputSchema, type GradingInput, type GradingOutput } from "@inspectiq/shared";

function clampGrade(value: number): number {
  return Math.round(Math.max(0, Math.min(5, value)) * 10) / 10;
}

export function gradeConditionLocally(input: GradingInput): GradingOutput {
  const deductions = input.damageItems.map((item) => {
    const amount = item.severity === "severe"
      ? 0.9
      : item.severity === "moderate"
        ? 0.45
        : item.severity === "minor"
          ? 0.15
          : 0.3;
    return {
      reason: `${item.severity} ${item.damageType} on ${item.location}`.replaceAll("_", " "),
      amount
    };
  });
  const totalDeduction = deductions.reduce((sum, item) => sum + item.amount, 0);
  const suggestedGrade = clampGrade(5 - totalDeduction);
  const evidenceBlockers = input.requiredPhotoCompletion < 1
    ? ["Required inspection photographs are incomplete"]
    : [];

  return GradingOutputSchema.parse({
    suggestedGrade,
    conditionGradeBeforeRecon: suggestedGrade,
    evidenceBlockers,
    explanation: {
      baseGrade: 5,
      deductions
    },
    gradingVersion: "inspectiq-reference-grade-v2-local-fallback"
  });
}

export async function gradeCondition(input: GradingInput): Promise<GradingOutput> {
  const serviceUrl = process.env.GRADING_SERVICE_URL;
  if (serviceUrl) {
    try {
      const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/grade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(2500)
      });
      if (response.ok) {
        return GradingOutputSchema.parse(await response.json());
      }
    } catch {
      // The in-process rules preserve workflow continuity if the optional service is unavailable.
    }
  }
  return gradeConditionLocally(input);
}
