import { GradingOutputSchema, type GradingInput, type GradingOutput } from "@inspectiq/shared";

function localGrade(input: GradingInput): GradingOutput {
  const deductions = input.damageItems.map((item) => {
    const severityPoints = item.severity === "severe" ? 18 : item.severity === "moderate" ? 9 : item.severity === "minor" ? 3 : 5;
    return {
      reason: `${item.severity} ${item.damageType} on ${item.location}`.replaceAll("_", " "),
      points: severityPoints
    };
  });
  const missingRatio = Math.max(0, 1 - input.requiredPhotoCompletion);
  const completionPenalty = Math.round(missingRatio * 24);
  const mileageAdjustment = input.vehicle.mileage > 120000 ? 10 : input.vehicle.mileage > 90000 ? 7 : input.vehicle.mileage > 60000 ? 4 : input.vehicle.mileage > 30000 ? 2 : 0;
  const currentYear = new Date().getFullYear();
  const ageAdjustment = Math.max(0, Math.min(8, Math.floor((currentYear - input.vehicle.year) / 3)));
  const total = deductions.reduce((sum, item) => sum + item.points, 0) + completionPenalty + mileageAdjustment + ageAdjustment;
  const score = Math.max(0, Math.min(100, 100 - total));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  return GradingOutputSchema.parse({
    score,
    grade,
    explanation: {
      baseScore: 100,
      deductions,
      completionPenalty,
      mileageAdjustment,
      ageAdjustment
    },
    gradingVersion: "grading-rules-v1-local-fallback"
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
      // Local inspection review remains usable if the Java service is not running.
    }
  }
  return localGrade(input);
}
