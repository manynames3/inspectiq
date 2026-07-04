import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import { estimateDamageRepairCost } from "@inspectiq/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../App.js";
import type { VisionSuggestion } from "../types.js";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

type SuggestionRow = {
  record: InspectionReviewRecord;
  suggestion: VisionSuggestion;
};

type EvidenceSummary = {
  primary: string;
  secondary?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not detected";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}

function titleCase(value: unknown): string {
  return displayValue(value)
    .replace(/\b[a-z]/g, (match) => match.toUpperCase())
    .replace(/\bVin\b/g, "VIN")
    .replace(/\bAi\b/g, "AI");
}

function percentScore(value: unknown): string | null {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : null;
}

function cleanExplanation(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\s*AI suggestion\s*-\s*requires human confirmation\.?/i, "")
    .replace(/\bvin\b/gi, "VIN")
    .trim();
}

function suggestionTitle(value: string): string {
  if (value === "damage_candidate") return "Damage Review";
  if (value === "photo_angle") return "Photo Angle";
  if (value === "extracted_text") return "Extracted Text";
  if (value === "quality_warning") return "Photo Quality";
  return titleCase(value);
}

function evidenceSummary(suggestion: VisionSuggestion): EvidenceSummary {
  const value = asRecord(suggestion.suggestedValueJson);

  if (suggestion.suggestionType === "photo_angle") {
    return {
      primary: `Photo angle: ${titleCase(value.photoAngle)}`,
      secondary: "Used to complete the required photo checklist."
    };
  }

  if (suggestion.suggestionType === "damage_candidate") {
    const estimate = asRecord(value.repairEstimateUsd);
    const estimateLabel = typeof estimate.min === "number" && typeof estimate.max === "number"
      ? `$${estimate.min.toLocaleString()} - $${estimate.max.toLocaleString()}`
      : estimateDamageRepairCost(String(value.damageType ?? "unknown"), String(value.severityEstimate ?? "unknown")).label;
    return {
      primary: `Damage: ${titleCase(value.location)} ${titleCase(value.damageType)}`,
      secondary: `Severity: ${titleCase(value.severityEstimate)} | Recon estimate: ${estimateLabel}`
    };
  }

  if (suggestion.suggestionType === "extracted_text") {
    const odometer = value.odometer ? `Odometer: ${formatOdometer(value.odometer)} mi` : null;
    const vin = value.vin ? `VIN: ${displayValue(value.vin)}` : null;
    return {
      primary: [odometer, vin].filter(Boolean).join(" | ") || "Vehicle text extracted",
      secondary: "Cross-check against vehicle metadata before approval."
    };
  }

  if (suggestion.suggestionType === "quality_warning") {
    const quality = asRecord(value.imageQuality);
    const scoreSummary = [
      percentScore(quality.blurScore) ? `Blur ${percentScore(quality.blurScore)}` : null,
      percentScore(quality.exposureScore) ? `Exposure ${percentScore(quality.exposureScore)}` : null,
      percentScore(quality.framingScore) ? `Framing ${percentScore(quality.framingScore)}` : null
    ].filter(Boolean).join(" | ");
    return {
      primary: `Photo quality: ${titleCase(quality.grade ?? "review")}`,
      secondary: [titleCase(value.warning), scoreSummary].filter(Boolean).join(" | ") || "Retake may be needed before final report."
    };
  }

  const fallback = Object.entries(value)
    .filter(([key, rowValue]) => key !== "requiresHumanConfirmation" && rowValue !== null && rowValue !== undefined && rowValue !== "")
    .slice(0, 2)
    .map(([key, rowValue]) => `${titleCase(key)}: ${displayValue(rowValue)}`);

  return {
    primary: fallback.join(" | ") || "Evidence available",
    secondary: "Review source inspection for details."
  };
}

function formatOdometer(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString() : displayValue(value);
}

export function SuggestionsPage() {
  const { actor, can } = useActor();
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions.");
    }
  }

  async function reviewSuggestion(id: string, action: "accept" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      await api(`/api/vision-suggestions/${id}/${action}`, { method: "POST", body: JSON.stringify({}) }, actor);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} suggestion.`);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo<SuggestionRow[]>(() => records.flatMap((record) =>
    record.bundle.suggestions.map((suggestion) => ({ record, suggestion }))
  ), [records]);
  const pendingCount = rows.filter(({ suggestion }) => suggestion.status === "pending" || suggestion.status === "edited").length;
  const acceptedCount = rows.filter(({ suggestion }) => suggestion.status === "accepted").length;
  const rejectedCount = rows.filter(({ suggestion }) => suggestion.status === "rejected").length;
  const canReviewSuggestions = can("suggestion:review");

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Suggestions</h1>
          <p>AI review queue across inspection photos and extracted vehicle evidence.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {!canReviewSuggestions ? (
        <div className="role-callout role-restricted">
          <strong>Reviewer or Admin access required</strong>
          <span>Inspectors can create inspections, attach photos, and run analysis; reviewers approve or reject the resulting suggestions.</span>
        </div>
      ) : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <article className="summary-card">
          <Sparkles size={18} />
          <span>Pending review</span>
          <strong>{pendingCount}</strong>
        </article>
        <article className="summary-card">
          <Check size={18} />
          <span>Accepted</span>
          <strong>{acceptedCount}</strong>
        </article>
        <article className="summary-card">
          <X size={18} />
          <span>Rejected</span>
          <strong>{rejectedCount}</strong>
        </article>
      </div>

      <div className="table-panel review-table">
        {rows.length === 0 ? (
          <div className="empty-state">
            <Sparkles size={22} />
            <strong>No suggestions yet</strong>
            <span>Open an inspection, attach required photos, and run analysis to populate this queue.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Suggestion</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Evidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ record, suggestion }) => {
                const actionable = suggestion.status === "pending" || suggestion.status === "edited";
                const evidence = evidenceSummary(suggestion);
                return (
                  <tr key={suggestion.id}>
                    <td>
                      <strong>{record.inspection.year} {record.inspection.make} {record.inspection.model}</strong>
                      <small>{record.inspection.vin}</small>
                    </td>
                    <td>
                      <strong>{suggestionTitle(suggestion.suggestionType)}</strong>
                      <small>{cleanExplanation(suggestion.explanation)}</small>
                    </td>
                    <td><span className={`queue-status status-${suggestion.status}`}>{suggestion.status}</span></td>
                    <td>{Math.round(suggestion.confidence * 100)}%</td>
                    <td>
                      <div className="evidence-summary">
                        <strong>{evidence.primary}</strong>
                        {evidence.secondary ? <small>{evidence.secondary}</small> : null}
                      </div>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link className="row-link" to={`/inspections/${record.inspection.id}`}>Open</Link>
                        {actionable ? (
                          <>
                            <button
                              className="accept-button"
                              disabled={busyId === suggestion.id || !canReviewSuggestions}
                              title={canReviewSuggestions ? undefined : "Reviewer or Admin access required"}
                              onClick={() => void reviewSuggestion(suggestion.id, "accept")}
                            >
                              <Check size={15} /> Accept
                            </button>
                            <button
                              className="reject-button"
                              disabled={busyId === suggestion.id || !canReviewSuggestions}
                              title={canReviewSuggestions ? undefined : "Reviewer or Admin access required"}
                              onClick={() => void reviewSuggestion(suggestion.id, "reject")}
                            >
                              <X size={15} /> Reject
                            </button>
                          </>
                        ) : <span className="reviewed-label">Reviewed</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
