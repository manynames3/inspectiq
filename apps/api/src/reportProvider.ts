import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
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

export const localReportProvider: ReportProvider = {
  name: "localReportProvider",
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
  async generate(input) {
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
    const prompt = [
      "You draft automotive wholesale condition report summaries from confirmed facts only.",
      "Return only strict JSON with these keys:",
      "{ summary: string, notableDefects: string[], missingEvidence: string[], recommendedDisclosure: string, confidence: number, humanReviewRequired: boolean, reasoningSummary: string }",
      "Do not invent damage, odometer, VIN, mechanical facts, seller claims, or inspection findings.",
      "Use buyer-ready wording. Do not mention schema, model, prompt, AI, JSON, or internal validation.",
      "",
      `Vehicle: ${input.inspection.year} ${input.inspection.make} ${input.inspection.model} ${input.inspection.trim}`,
      `VIN: ${input.inspection.vin}`,
      `Mileage: ${input.inspection.mileage}`,
      `Grade: ${input.grade.grade} (${input.grade.score})`,
      `Missing evidence: ${input.missingEvidence.length ? input.missingEvidence.join(", ") : "none"}`,
      `Confirmed damage: ${input.damageItems.length ? input.damageItems.map((item) => `${item.severity} ${item.damageType} at ${item.location}${item.notes ? ` (${item.notes})` : ""}`).join("; ") : "none"}`
    ].join("\n");
    const response = await client.send(new ConverseCommand({
      modelId: process.env.BEDROCK_REPORT_MODEL_ID ?? process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6",
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: {
        maxTokens: 1200,
        temperature: 0
      }
    }));
    const rawText = response.output?.message?.content
      ?.map((block) => "text" in block && typeof block.text === "string" ? block.text : "")
      .join("\n")
      .trim() ?? "";
    const parsed = parseJsonObject(rawText);
    return {
      raw: { response, text: rawText, parsed },
      validated: AiReportOutputSchema.parse(parsed)
    };
  }
};

export function getReportProvider(): ReportProvider {
  return process.env.REPORT_PROVIDER === "bedrock" ? bedrockClaudeReportProvider : localReportProvider;
}

function parseJsonObject(text: string): unknown {
  const withoutFence = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Bedrock response did not include a JSON object.");
  }
  return JSON.parse(withoutFence.slice(start, end + 1));
}
