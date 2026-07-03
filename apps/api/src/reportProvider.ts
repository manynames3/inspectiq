import { AiReportOutputSchema, estimateTotalRepairRange, type AiReportOutput } from "@inspectiq/shared";
import type { ConditionGrade, DamageItem, Inspection } from "./domain.js";

export type ReportProvider = {
  name: string;
  promptVersion: string;
  generate(input: {
    inspection: Inspection;
    grade: ConditionGrade;
    missingEvidence: string[];
    damageItems: DamageItem[];
  }): Promise<{ raw: unknown; validated: AiReportOutput }>;
};

export const mockReportProvider: ReportProvider = {
  name: "mockReportProvider",
  promptVersion: "inspection-report-v2",
  async generate(input) {
    const defects = input.damageItems.map((item) => `${item.severity} ${item.damageType.replaceAll("_", " ")} at ${item.location}`);
    const hasMissing = input.missingEvidence.length > 0;
    const lowConfidence = input.grade.score < 70 || hasMissing;
    const severeDamage = input.damageItems.some((item) => item.severity === "severe");
    const reconditioningEstimate = estimateTotalRepairRange(input.damageItems);
    const vdpStatus = hasMissing ? "Hold buyer-visible VDP until missing required angles are resolved." : "CR and buyer-visible VDP can be released after reviewer finalization.";
    const arbitrationRisk = severeDamage ? "High arbitration risk: severe confirmed damage requires explicit seller disclosure." : defects.length > 0 ? "Moderate arbitration risk: disclose confirmed cosmetic damage and estimate range." : "Low arbitration risk from confirmed inspection evidence.";
    const raw: AiReportOutput = {
      summary: `${input.inspection.year} ${input.inspection.make} ${input.inspection.model} ${input.inspection.trim} graded ${input.grade.grade} with a condition score of ${input.grade.score}. ${vdpStatus}`,
      notableDefects: defects.length > 0 ? defects : ["No confirmed damage items were recorded."],
      missingEvidence: input.missingEvidence,
      recommendedDisclosure: defects.length > 0
        ? `Seller disclosure should list confirmed damage, estimated reconditioning range ${reconditioningEstimate?.label ?? "Estimator review"}, and arbitration posture: ${arbitrationRisk}`
        : `Seller disclosure should state that the CR is based on confirmed photo evidence and human-reviewed facts. ${arbitrationRisk}`,
      confidence: hasMissing ? 0.68 : lowConfidence ? 0.74 : 0.9,
      humanReviewRequired: hasMissing || input.grade.score < 75 || severeDamage,
      reasoningSummary: `Draft uses confirmed inspection facts, the calculated condition grade, missing-evidence checks, and reconditioning estimate ${reconditioningEstimate?.label ?? "Estimator review"}. Reviewer approval is required before finalization.`
    };
    return {
      raw,
      validated: AiReportOutputSchema.parse(raw)
    };
  }
};

export const bedrockClaudeReportProvider: ReportProvider = {
  name: "bedrockClaudeReportProvider",
  promptVersion: "inspection-report-v2",
  async generate() {
    throw new Error("Bedrock Claude report provider is configured but not implemented for local credentials.");
  }
};

export function getReportProvider(): ReportProvider {
  return process.env.REPORT_PROVIDER === "bedrock" ? bedrockClaudeReportProvider : mockReportProvider;
}
