import { estimateTotalRepairRange, requiredPhotoAngles } from "@inspectiq/shared";
import type { InspectionBundle } from "./types.js";

export type MarketplaceReadiness = {
  crStatus: "CR ready" | "CR blocked";
  vdpStatus: "VDP ready" | "Needs final report" | "Needs evidence";
  buyerVisibility: "Buyer-visible" | "Held for review";
  arbitrationRisk: "Low" | "Moderate" | "High";
  reconditioningEstimate: string;
  blockers: string[];
};

export function deriveMarketplaceReadiness(bundle: InspectionBundle): MarketplaceReadiness {
  const acceptedAngles = new Set(
    bundle.suggestions
      .filter((suggestion) => suggestion.suggestionType === "photo_angle" && suggestion.status === "accepted")
      .map((suggestion) => String(suggestion.suggestedValueJson?.photoAngle ?? ""))
  );
  const missingAngles = requiredPhotoAngles.filter((angle) => !acceptedAngles.has(angle));
  const pendingSuggestions = bundle.suggestions.filter((suggestion) => suggestion.status === "pending" || suggestion.status === "edited");
  const pendingDamage = pendingSuggestions.some((suggestion) => suggestion.suggestionType === "damage_candidate");
  const qualityIssues = bundle.photos.filter((photo) => photo.qualityStatus === "warning" || photo.qualityStatus === "fail").length;
  const severeDamage = bundle.damageItems.some((item) => item.severity === "severe");
  const repairEstimate = estimateTotalRepairRange(bundle.damageItems);
  const blockers = [
    ...missingAngles.map((angle) => `Missing ${angle.replaceAll("_", " ")} angle`),
    ...(bundle.conditionGrade ? [] : ["Condition grade not calculated"]),
    ...(bundle.finalReport?.finalizedAt ? [] : ["Reviewer has not finalized the condition report"]),
    ...(pendingDamage ? ["Damage suggestion still needs reviewer decision"] : []),
    ...(qualityIssues > 0 ? [`${qualityIssues} image quality issue${qualityIssues === 1 ? "" : "s"} need review`] : [])
  ];
  const crReady = missingAngles.length === 0 && Boolean(bundle.conditionGrade) && !pendingDamage && qualityIssues === 0;
  const vdpReady = crReady && Boolean(bundle.finalReport?.finalizedAt);

  return {
    crStatus: crReady ? "CR ready" : "CR blocked",
    vdpStatus: missingAngles.length > 0 ? "Needs evidence" : vdpReady ? "VDP ready" : "Needs final report",
    buyerVisibility: vdpReady ? "Buyer-visible" : "Held for review",
    arbitrationRisk: severeDamage ? "High" : bundle.damageItems.length > 0 || pendingDamage || qualityIssues > 0 ? "Moderate" : "Low",
    reconditioningEstimate: repairEstimate?.label ?? "No confirmed recon",
    blockers
  };
}
