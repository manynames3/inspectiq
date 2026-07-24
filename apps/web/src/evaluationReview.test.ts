import { describe, expect, it } from "vitest";
import type { Actor, InspectionBundle, VisionSuggestion } from "./types.js";
import {
  applyEvaluationReview,
  applyEvaluationState,
  clearEvaluationReview,
  evaluationReviewStorageKey,
  recordEvaluationReview
} from "./evaluationReview.js";

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

const actor: Actor = { id: "evaluation-reviewer", name: "Evaluation Reviewer", role: "reviewer" };
const suggestion: VisionSuggestion = {
  id: "suggestion-1",
  inspectionId: "inspection-1",
  photoId: "photo-1",
  suggestionType: "damage_candidate",
  suggestedValueJson: {
    location: "front bumper",
    damageType: "dent",
    severityEstimate: "moderate"
  },
  confidence: 0.91,
  explanation: "Dent visible on the front bumper.",
  status: "pending",
  version: 1
};

function bundle(): InspectionBundle {
  return {
    inspection: { id: "inspection-1" } as InspectionBundle["inspection"],
    photos: [],
    imageAnalysisJobs: [],
    suggestions: [suggestion],
    damageItems: [],
    conditionGrade: null,
    aiReportJob: null,
    aiReportDraft: null,
    finalReport: null,
    auditEvents: [],
    readinessIssues: [],
    buyerVisibleReady: false
  };
}

describe("evaluation review session state", () => {
  it("applies a session-only decision without changing the source suggestion", () => {
    const storage = fakeStorage();
    recordEvaluationReview(storage, actor, suggestion, "accepted");

    expect(applyEvaluationReview(storage, "inspection-1", [suggestion])[0]).toMatchObject({
      status: "accepted",
      reviewedBy: "Evaluation Reviewer"
    });
    expect(suggestion.status).toBe("pending");
  });

  it("materializes accepted damage for the evaluation Damage view", () => {
    const storage = fakeStorage();
    recordEvaluationReview(storage, actor, suggestion, "accepted");

    const next = applyEvaluationState(storage, bundle());
    expect(next.damageItems).toEqual([
      expect.objectContaining({
        id: "evaluation-damage-suggestion-suggestion-1",
        location: "front bumper",
        source: "evaluation_preview"
      })
    ]);
  });

  it("stores edited values and clears decisions without deleting manual preview damage", () => {
    const storage = fakeStorage();
    recordEvaluationReview(storage, actor, suggestion, "edited", {
      suggestedValue: { ...suggestion.suggestedValueJson, location: "front-left bumper" },
      explanation: "Location corrected by reviewer."
    });

    expect(applyEvaluationReview(storage, "inspection-1", [suggestion])[0]).toMatchObject({
      status: "edited",
      suggestedValueJson: expect.objectContaining({ location: "front-left bumper" })
    });

    clearEvaluationReview(storage, "inspection-1");
    expect(storage.getItem(evaluationReviewStorageKey("inspection-1"))).toBeNull();
    expect(applyEvaluationReview(storage, "inspection-1", [suggestion])[0].status).toBe("pending");
  });

  it("ignores malformed stored decisions", () => {
    const storage = fakeStorage();
    storage.setItem(evaluationReviewStorageKey("inspection-1"), JSON.stringify([
      { suggestionId: "suggestion-1", status: "approved" }
    ]));

    expect(applyEvaluationReview(storage, "inspection-1", [suggestion])[0]).toBe(suggestion);
  });
});
