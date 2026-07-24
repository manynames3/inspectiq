import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  AiReportOutputSchema,
  estimateTotalRepairRange,
  type AiReportOutput,
  type ConditionReportSection
} from "@inspectiq/shared";
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

export function visualConditionSections(input: {
  missingEvidence: string[];
  damageItems: DamageItem[];
}): ConditionReportSection[] {
  const damageObservations = input.damageItems.length > 0
    ? input.damageItems.map((item) => `${item.severity} ${item.damageType.replaceAll("_", " ")} at ${item.location}: ${item.notes || "Reviewer-confirmed finding."}`)
    : ["No damage line items were confirmed during human review."];
  const evidenceStatus = input.missingEvidence.length === 0 ? "VERIFIED" as const : "REQUIRES_REVIEW" as const;
  return [
    { key: "VIN_VERIFICATION", title: "VIN verification", status: evidenceStatus, observations: ["VIN evidence is part of the required capture set; compare it with intake metadata before publication."] },
    { key: "ODOMETER_VERIFICATION", title: "Odometer verification", status: evidenceStatus, observations: ["Odometer evidence is part of the required capture set; compare it with intake metadata before publication."] },
    { key: "EXTERIOR_CONDITION", title: "Exterior condition", status: input.damageItems.length ? "OBSERVED" : "NOT_OBSERVED", observations: damageObservations },
    { key: "INTERIOR_CONDITION", title: "Interior condition", status: "REQUIRES_REVIEW", observations: ["Use the interior evidence and reviewer notes; no additional fact is inferred by report generation."] },
    { key: "STRUCTURAL_OBSERVATIONS", title: "Structural observations", status: "NOT_APPLICABLE", observations: ["A visual condition report is not a structural or mechanical certification inspection."] },
    { key: "DAMAGE_LINE_ITEMS", title: "Damage line items", status: input.damageItems.length ? "VERIFIED" : "NOT_OBSERVED", observations: damageObservations },
    { key: "TIRES_AND_TREAD", title: "Tires and tread", status: "NOT_APPLICABLE", observations: ["Tread measurements were not supplied in this visual condition-report input."] },
    { key: "WHEELS", title: "Wheels", status: "REQUIRES_REVIEW", observations: ["Record wheel observations only when supported by inspected evidence."] },
    { key: "WINDSHIELD_AND_GLASS", title: "Windshield and glass", status: "REQUIRES_REVIEW", observations: ["Record glass observations only when supported by inspected evidence."] },
    { key: "KEYS", title: "Keys", status: "NOT_APPLICABLE", observations: ["Key count was not supplied in this visual condition-report input."] },
    { key: "WARNING_LIGHTS", title: "Warning lights", status: "REQUIRES_REVIEW", observations: ["Review instrument-cluster evidence; no warning-light state is inferred automatically."] },
    { key: "DIAGNOSTIC_TROUBLE_CODES", title: "Diagnostic trouble codes", status: "NOT_APPLICABLE", observations: ["Diagnostic scanning requires a mechanical or certification inspection."] },
    { key: "PRIOR_PAINT_OR_REPAIR", title: "Prior paint or repair", status: "NOT_APPLICABLE", observations: ["No paint-depth or repair-history measurement was supplied."] },
    { key: "ODOR", title: "Odor", status: "NOT_APPLICABLE", observations: ["Odor requires an in-person observation."] },
    { key: "EMISSIONS", title: "Emissions status", status: "NOT_APPLICABLE", observations: ["Emissions testing is outside this visual condition report."] },
    { key: "AIR_CONDITIONING", title: "Air conditioning", status: "NOT_APPLICABLE", observations: ["Functional HVAC testing was not part of this visual condition report."] },
    { key: "SRS_AIRBAG", title: "SRS and airbag indicators", status: "REQUIRES_REVIEW", observations: ["Record SRS observations only when supported by instrument-cluster evidence or a qualified inspection."] },
    { key: "FLOOD_INDICATORS", title: "Flood indicators", status: "NOT_APPLICABLE", observations: ["No qualified flood inspection was supplied."] },
    { key: "REVIEWER_NOTES", title: "Reviewer notes", status: "REQUIRES_REVIEW", observations: ["A human reviewer must approve the report and add any required context."] },
    { key: "ANNOUNCEMENTS_AND_DISCLOSURES", title: "Announcements and disclosures", status: "REQUIRES_REVIEW", observations: ["Consignor disclosures must reflect confirmed facts and declined optional recon. ADAS diagnosis is referred to a qualified third party."] }
  ];
}

export const localReportProvider: ReportProvider = {
  name: "localReportProvider",
  promptVersion: "inspection-report-v2",
  async generate(input) {
    const defects = input.damageItems.map((item) => `${item.severity} ${item.damageType.replaceAll("_", " ")} at ${item.location}`);
    const hasMissing = input.missingEvidence.length > 0;
    const referenceGrade = input.grade.approvedGrade ?? input.grade.suggestedGrade;
    const lowConditionGrade = referenceGrade < 2.5;
    const severeDamage = input.damageItems.some((item) => item.severity === "severe");
    const reconditioningEstimate = estimateTotalRepairRange(input.damageItems);
    const vdpStatus = hasMissing ? "Hold buyer-visible VDP until missing required angles are resolved." : "CR and buyer-visible VDP can be released after reviewer finalization.";
    const arbitrationRisk = severeDamage ? "High arbitration risk: severe confirmed damage requires explicit seller disclosure." : defects.length > 0 ? "Moderate arbitration risk: disclose confirmed cosmetic damage and estimate range." : "Low arbitration risk from confirmed inspection evidence.";
    const raw: AiReportOutput = {
      inspectionType: "VISUAL_CONDITION_REPORT",
      summary: `${input.inspection.year} ${input.inspection.make} ${input.inspection.model} ${input.inspection.trim} has an InspectIQ Reference Grade of ${referenceGrade.toFixed(1)} out of 5.0. ${vdpStatus}`,
      notableDefects: defects.length > 0 ? defects : ["No confirmed damage items were recorded."],
      missingEvidence: input.missingEvidence,
      recommendedDisclosure: defects.length > 0
        ? `Consignor disclosure should list confirmed damage, illustrative repair range ${reconditioningEstimate?.label ?? "Estimator review"}, and arbitration posture: ${arbitrationRisk}`
        : `Consignor disclosure should state that the CR is based on confirmed photo evidence and human-reviewed facts. ${arbitrationRisk}`,
      conditionReportSections: visualConditionSections(input),
      confidence: hasMissing ? 0.68 : lowConditionGrade ? 0.74 : 0.9,
      humanReviewRequired: hasMissing || lowConditionGrade || severeDamage,
      reasoningSummary: `Draft uses confirmed inspection facts, the reviewer-approved InspectIQ Reference Grade, missing-evidence checks, and illustrative repair estimate ${reconditioningEstimate?.label ?? "Estimator review"}. Reviewer approval is required before finalization.`
    };
    return {
      raw,
      validated: AiReportOutputSchema.parse(raw)
    };
  }
};

function normalizeReportOutput(candidate: unknown): AiReportOutput {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return AiReportOutputSchema.parse(candidate);
  }

  const output = { ...candidate } as Record<string, unknown>;
  if (typeof output.confidence === "number" && output.confidence > 1 && output.confidence <= 100) {
    output.confidence = output.confidence / 100;
  }

  return AiReportOutputSchema.parse(output);
}

export const bedrockClaudeReportProvider: ReportProvider = {
  name: "bedrockClaudeReportProvider",
  promptVersion: "inspection-report-v2",
  async generate(input) {
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
    const prompt = [
      "You draft automotive wholesale condition report summaries from confirmed facts only.",
      "Return only strict JSON with these keys:",
      "{ inspectionType: 'VISUAL_CONDITION_REPORT', summary: string, notableDefects: string[], missingEvidence: string[], recommendedDisclosure: string, confidence: number, humanReviewRequired: boolean, reasoningSummary: string }",
      "Do not invent damage, odometer, VIN, mechanical facts, seller claims, or inspection findings.",
      "Use buyer-ready wording. Do not mention schema, model, prompt, AI, JSON, or internal validation.",
      "Confidence must be a 0-1 decimal such as 0.84, never a percentage such as 84.",
      "",
      `Vehicle: ${input.inspection.year} ${input.inspection.make} ${input.inspection.model} ${input.inspection.trim}`,
      `VIN: ${input.inspection.vin}`,
      `Mileage: ${input.inspection.mileage}`,
      `InspectIQ Reference Grade: ${(input.grade.approvedGrade ?? input.grade.suggestedGrade).toFixed(1)} / 5.0`,
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
    try {
      const parsed = parseJsonObject(rawText);
      const validated = normalizeReportOutput(parsed);
      return {
        raw: { response, text: rawText, parsed },
        validated: AiReportOutputSchema.parse({
          ...validated,
          conditionReportSections: visualConditionSections(input)
        })
      };
    } catch (error) {
      const fallback = await localReportProvider.generate(input);
      return {
        raw: {
          response,
          text: rawText,
          fallbackReason: error instanceof Error ? error.message : "Bedrock response failed report validation.",
          fallback: fallback.raw
        },
        validated: fallback.validated
      };
    }
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
