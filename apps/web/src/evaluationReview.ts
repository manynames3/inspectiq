import type { Actor, DamageItem, InspectionBundle, VisionSuggestion } from "./types.js";
import { loadEvaluationDamage, saveEvaluationDamage } from "./evaluationDamage.js";

type SessionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

type EvaluationReviewDecision = {
  suggestionId: string;
  status: "accepted" | "rejected" | "edited";
  suggestedValueJson?: unknown;
  explanation?: string;
  reviewedBy: string;
  reviewedAt: string;
};

const evaluationReviewStoragePrefix = "inspectiq:evaluation-review:v1";

export function evaluationReviewStorageKey(inspectionId: string) {
  return `${evaluationReviewStoragePrefix}:${inspectionId}`;
}

function isDecision(value: unknown): value is EvaluationReviewDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as Partial<EvaluationReviewDecision>;
  return typeof decision.suggestionId === "string"
    && (decision.status === "accepted" || decision.status === "rejected" || decision.status === "edited")
    && typeof decision.reviewedBy === "string"
    && typeof decision.reviewedAt === "string";
}

function loadDecisions(storage: SessionStorage, inspectionId: string): Record<string, EvaluationReviewDecision> {
  try {
    const value = storage.getItem(evaluationReviewStorageKey(inspectionId));
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return {};
    return Object.fromEntries(
      parsed.filter(isDecision).map((decision) => [decision.suggestionId, decision])
    );
  } catch {
    return {};
  }
}

function saveDecisions(
  storage: SessionStorage,
  inspectionId: string,
  decisions: Record<string, EvaluationReviewDecision>
) {
  try {
    const values = Object.values(decisions);
    if (values.length === 0) {
      storage.removeItem(evaluationReviewStorageKey(inspectionId));
      return;
    }
    storage.setItem(evaluationReviewStorageKey(inspectionId), JSON.stringify(values));
  } catch {
    // The in-memory evaluation state still works if session storage is unavailable.
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function damageFromSuggestion(suggestion: VisionSuggestion): DamageItem | null {
  if (suggestion.suggestionType !== "damage_candidate") return null;
  const value = asRecord(suggestion.suggestedValueJson);
  const location = String(value.location ?? "").trim();
  const damageType = String(value.damageType ?? "").trim();
  const severity = String(value.severityEstimate ?? value.severity ?? "").trim();
  if (!location || !damageType || !severity) return null;
  return {
    id: `evaluation-damage-suggestion-${suggestion.id}`,
    inspectionId: suggestion.inspectionId,
    photoId: suggestion.photoId,
    location,
    damageType,
    severity,
    notes: suggestion.explanation,
    source: "evaluation_preview"
  };
}

export function applyEvaluationReview(
  storage: SessionStorage,
  inspectionId: string,
  suggestions: VisionSuggestion[]
): VisionSuggestion[] {
  const decisions = loadDecisions(storage, inspectionId);
  return suggestions.map((suggestion) => {
    const decision = decisions[suggestion.id];
    if (!decision) return suggestion;
    return {
      ...suggestion,
      status: decision.status,
      suggestedValueJson: decision.suggestedValueJson ?? suggestion.suggestedValueJson,
      explanation: decision.explanation ?? suggestion.explanation,
      reviewedBy: decision.reviewedBy,
      reviewedAt: decision.reviewedAt,
      resolvedAt: decision.status === "edited" ? null : decision.reviewedAt
    };
  });
}

export function applyEvaluationState(
  storage: SessionStorage,
  bundle: InspectionBundle
): InspectionBundle {
  const suggestions = applyEvaluationReview(storage, bundle.inspection.id, bundle.suggestions);
  const previewDamage = loadEvaluationDamage(storage, bundle.inspection.id);
  const previewIds = new Set(previewDamage.map((item) => item.id));
  return {
    ...bundle,
    suggestions,
    damageItems: [
      ...bundle.damageItems.filter((item) => !previewIds.has(item.id)),
      ...previewDamage
    ]
  };
}

export function recordEvaluationReview(
  storage: SessionStorage,
  actor: Actor,
  suggestion: VisionSuggestion,
  status: EvaluationReviewDecision["status"],
  edit?: { suggestedValue: unknown; explanation?: string }
) {
  const reviewedAt = new Date().toISOString();
  const decisions = loadDecisions(storage, suggestion.inspectionId);
  decisions[suggestion.id] = {
    suggestionId: suggestion.id,
    status,
    suggestedValueJson: edit?.suggestedValue ?? suggestion.suggestedValueJson,
    explanation: edit?.explanation ?? suggestion.explanation,
    reviewedBy: actor.name,
    reviewedAt
  };
  saveDecisions(storage, suggestion.inspectionId, decisions);

  const previewId = `evaluation-damage-suggestion-${suggestion.id}`;
  const currentDamage = loadEvaluationDamage(storage, suggestion.inspectionId)
    .filter((item) => item.id !== previewId);
  if (status === "accepted") {
    const acceptedSuggestion = {
      ...suggestion,
      suggestedValueJson: edit?.suggestedValue ?? suggestion.suggestedValueJson,
      explanation: edit?.explanation ?? suggestion.explanation
    };
    const damage = damageFromSuggestion(acceptedSuggestion);
    if (damage) currentDamage.push(damage);
  }
  saveEvaluationDamage(storage, suggestion.inspectionId, currentDamage);
}

export function clearEvaluationReview(storage: SessionStorage, inspectionId: string) {
  const decisions = loadDecisions(storage, inspectionId);
  const decisionIds = new Set(Object.keys(decisions).map((id) => `evaluation-damage-suggestion-${id}`));
  saveEvaluationDamage(
    storage,
    inspectionId,
    loadEvaluationDamage(storage, inspectionId).filter((item) => !decisionIds.has(item.id))
  );
  storage.removeItem(evaluationReviewStorageKey(inspectionId));
}
