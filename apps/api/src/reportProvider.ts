import { AiReportOutputSchema, type AiReportOutput } from "@inspectiq/shared";
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
  promptVersion: "inspection-report-v1",
  async generate(input) {
    const defects = input.damageItems.map((item) => `${item.severity} ${item.damageType.replaceAll("_", " ")} at ${item.location}`);
    const hasMissing = input.missingEvidence.length > 0;
    const lowConfidence = input.grade.score < 70 || hasMissing;
    const raw: AiReportOutput = {
      summary: `${input.inspection.year} ${input.inspection.make} ${input.inspection.model} ${input.inspection.trim} graded ${input.grade.grade} with a condition score of ${input.grade.score}.`,
      notableDefects: defects.length > 0 ? defects : ["No confirmed damage items were recorded."],
      missingEvidence: input.missingEvidence,
      recommendedDisclosure: defects.length > 0
        ? "Disclose confirmed damage items and retain reviewer confirmation before sale or arbitration use."
        : "Disclose that the condition grade is based on the confirmed photo set and human-reviewed inspection facts.",
      confidence: hasMissing ? 0.68 : lowConfidence ? 0.74 : 0.9,
      humanReviewRequired: hasMissing || input.grade.score < 75 || input.damageItems.some((item) => item.severity === "severe"),
      reasoningSummary: "Draft uses confirmed inspection facts, the calculated condition grade, and missing-evidence checks. Reviewer approval is required before finalization."
    };
    return {
      raw,
      validated: AiReportOutputSchema.parse(raw)
    };
  }
};

export const bedrockClaudeReportProvider: ReportProvider = {
  name: "bedrockClaudeReportProvider",
  promptVersion: "inspection-report-v1",
  async generate() {
    throw new Error("Bedrock Claude report provider is configured but not implemented for local credentials.");
  }
};

export function getReportProvider(): ReportProvider {
  return process.env.REPORT_PROVIDER === "bedrock" ? bedrockClaudeReportProvider : mockReportProvider;
}
