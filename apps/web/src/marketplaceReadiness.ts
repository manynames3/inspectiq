import { estimateTotalRepairRange, requiredPhotoAngles } from "@inspectiq/shared";
import type { InspectionBundle } from "./types.js";

export type MarketplaceReadiness = {
  crStatus: "CR ready" | "CR blocked";
  vdpStatus: "VDP ready" | "Needs final report" | "Needs evidence" | "Needs review";
  buyerVisibility: "Buyer-visible" | "Held for review";
  arbitrationRisk: "Low" | "Moderate" | "High";
  reconditioningEstimate: string;
  blockers: string[];
};

export type ReportReadinessDisplay = {
  label: "Ready for report" | "Report not ready";
  detail: string;
  className: "inline-ready" | "inline-watch";
};

function formatList(items: string[]): string {
  if (items.length === 0) return "open blockers";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function formatReportReadiness(readiness: MarketplaceReadiness): ReportReadinessDisplay {
  if (readiness.crStatus === "CR ready") {
    return {
      label: "Ready for report",
      detail: readiness.vdpStatus === "VDP ready" ? "Buyer release complete" : "Evidence, review, and grade complete",
      className: "inline-ready"
    };
  }

  const blockerText = readiness.blockers.join(" ").toLowerCase();
  const needsReview = blockerText.match(/suggestion|human review|missing .* angle|quality|failed|retake|angle/);
  const nextSteps = [
    needsReview ? "review decisions" : null,
    !needsReview && blockerText.match(/missing|evidence/) ? "photo evidence" : null,
    blockerText.includes("grade") ? "grade" : null,
    blockerText.match(/final report|finalized|released/) ? "final report" : null,
  ].filter((step): step is string => Boolean(step));
  const uniqueSteps = Array.from(new Set(nextSteps));

  return {
    label: "Report not ready",
    detail: `Needs ${formatList(uniqueSteps)}`,
    className: "inline-watch"
  };
}

export function deriveMarketplaceReadiness(bundle: InspectionBundle): MarketplaceReadiness {
  const acceptedAngles = new Set(
    bundle.suggestions
      .filter((suggestion) => suggestion.suggestionType === "photo_angle" && suggestion.status === "accepted")
      .map((suggestion) => String(suggestion.suggestedValueJson?.photoAngle ?? ""))
  );
  const missingAngles = requiredPhotoAngles.filter((angle) => !acceptedAngles.has(angle));
  const pendingSuggestions = bundle.suggestions.filter((suggestion) => suggestion.status === "pending" || suggestion.status === "edited");
  const pendingDamage = pendingSuggestions.some((suggestion) => suggestion.suggestionType === "damage_candidate");
  const pendingQualityWarnings = pendingSuggestions.filter((suggestion) => suggestion.suggestionType === "quality_warning").length;
  const failedAnalyses = bundle.photos.filter((photo) => photo.qualityStatus === "fail" || photo.analysisStatus === "failed").length;
  const unresolvedQualityIssues = pendingQualityWarnings + failedAnalyses;
  const backendBlockers = bundle.readinessIssues?.filter((issue) => issue.severity === "blocker") ?? [];
  const severeDamage = bundle.damageItems.some((item) => item.severity === "severe");
  const repairEstimate = estimateTotalRepairRange(bundle.damageItems);
  const derivedBlockers = [
    ...missingAngles.map((angle) => `Missing ${angle.replaceAll("_", " ")} angle`),
    ...(bundle.conditionGrade ? [] : ["Condition grade not calculated"]),
    ...(bundle.finalReport?.finalizedAt ? [] : ["Reviewer has not finalized the condition report"]),
    ...(pendingDamage ? ["Damage suggestion still needs reviewer decision"] : []),
    ...(unresolvedQualityIssues > 0 ? [`${unresolvedQualityIssues} image quality issue${unresolvedQualityIssues === 1 ? "" : "s"} need review`] : [])
  ];
  const blockers = backendBlockers.length > 0 ? backendBlockers.map((issue) => issue.label) : derivedBlockers;
  const crReady = backendBlockers.every((issue) => issue.type === "final_report_missing") && missingAngles.length === 0 && Boolean(bundle.conditionGrade) && !pendingDamage && unresolvedQualityIssues === 0;
  const locallyVdpReady = crReady && Boolean(bundle.finalReport?.finalizedAt);
  const vdpReady = (bundle.readinessIssues?.length ?? 0) > 0
    ? Boolean(bundle.buyerVisibleReady)
    : locallyVdpReady;

  return {
    crStatus: crReady ? "CR ready" : "CR blocked",
    vdpStatus: missingAngles.length > 0
      ? "Needs evidence"
      : vdpReady
        ? "VDP ready"
        : bundle.finalReport?.finalizedAt
          ? "Needs review"
          : "Needs final report",
    buyerVisibility: vdpReady ? "Buyer-visible" : "Held for review",
    arbitrationRisk: severeDamage ? "High" : bundle.damageItems.length > 0 || pendingDamage || unresolvedQualityIssues > 0 ? "Moderate" : "Low",
    reconditioningEstimate: repairEstimate?.label ?? "No confirmed recon",
    blockers
  };
}
