import { AlertTriangle, Check, Clock3, RefreshCw, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
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

type ReviewStatusFilter = "actionable" | "all" | "accepted" | "rejected";
type ReviewOwnerFilter = "all" | "reviewer" | "inspector" | "closed";
type ReviewSlaFilter = "all" | "overdue" | "watch" | "clear" | "closed";
type ReviewTypeFilter = "all" | "damage_candidate" | "photo_angle" | "extracted_text" | "quality_warning";

type EvidenceSummary = {
  primary: string;
  secondary?: string;
};
const reviewTargetMinutes: Record<string, number> = {
  damage_candidate: 60,
  quality_warning: 120,
  extracted_text: 180,
  photo_angle: 240
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
    .replace(/\s*Reviewer confirmation required(?: before approval)?\.?/i, "")
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

function isActionableSuggestion(suggestion: VisionSuggestion) {
  return suggestion.status === "pending" || suggestion.status === "edited";
}

function suggestionOwner(suggestion: VisionSuggestion): ReviewOwnerFilter {
  if (!isActionableSuggestion(suggestion)) return "closed";
  if (suggestion.assignedToRole === "reviewer" || suggestion.assignedToRole === "inspector") return suggestion.assignedToRole;
  if (suggestion.suggestionType === "quality_warning" || suggestion.suggestionType === "photo_angle") return "inspector";
  return "reviewer";
}

function ownerLabel(owner: ReviewOwnerFilter) {
  if (owner === "reviewer") return "Reviewer";
  if (owner === "inspector") return "Inspector QA";
  if (owner === "closed") return "Closed";
  return "All owners";
}

function qualityRetakeRequired(suggestion: VisionSuggestion) {
  if (suggestion.suggestionType !== "quality_warning") return false;
  const value = asRecord(suggestion.suggestedValueJson);
  const quality = asRecord(value.imageQuality);
  return quality.retakeRequired === true;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dueTimestamp(suggestion: VisionSuggestion): number | null {
  const dueAt = parseTimestamp(suggestion.dueAt);
  if (dueAt) return dueAt;
  const createdAt = parseTimestamp(suggestion.createdAt);
  const targetMinutes = reviewTargetMinutes[suggestion.suggestionType];
  if (!createdAt || !targetMinutes) return null;
  return createdAt + targetMinutes * 60_000;
}

function durationLabel(minutes: number): string {
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(minutes < 180 ? 1 : 0)} hr`;
}

function dueDetail(suggestion: VisionSuggestion): string {
  const dueAt = dueTimestamp(suggestion);
  if (!dueAt) return "Review target pending";
  const minutesUntil = Math.round((dueAt - Date.now()) / 60_000);
  if (minutesUntil < 0) return `Due ${durationLabel(Math.abs(minutesUntil))} ago`;
  return `Due in ${durationLabel(minutesUntil)}`;
}

function slaState({ suggestion }: SuggestionRow): { id: ReviewSlaFilter; label: string; detail: string; rank: number } {
  if (!isActionableSuggestion(suggestion)) {
    return { id: "closed", label: "Closed", detail: "Decision recorded", rank: 4 };
  }

  const dueAt = dueTimestamp(suggestion);
  const millisecondsUntilDue = dueAt === null ? null : dueAt - Date.now();
  if (millisecondsUntilDue !== null && millisecondsUntilDue < 0) {
    return { id: "overdue", label: "Overdue", detail: dueDetail(suggestion), rank: 0 };
  }
  if (qualityRetakeRequired(suggestion) || suggestion.confidence < 0.9 || (millisecondsUntilDue !== null && millisecondsUntilDue <= 60 * 60_000)) {
    return { id: "watch", label: "SLA watch", detail: dueDetail(suggestion), rank: 1 };
  }
  return { id: "clear", label: "On track", detail: dueDetail(suggestion), rank: 2 };
}

function suggestionRank(suggestion: VisionSuggestion) {
  if (suggestion.suggestionType === "damage_candidate") return 0;
  if (suggestion.suggestionType === "extracted_text") return 1;
  if (suggestion.suggestionType === "quality_warning") return 2;
  if (suggestion.suggestionType === "photo_angle") return 3;
  return 4;
}

export function SuggestionsPage() {
  const { actor, can, isEvaluationMode } = useActor();
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>("actionable");
  const [ownerFilter, setOwnerFilter] = useState<ReviewOwnerFilter>("all");
  const [slaFilter, setSlaFilter] = useState<ReviewSlaFilter>("all");
  const [typeFilter, setTypeFilter] = useState<ReviewTypeFilter>("all");

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords(actor));
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
  }, [actor]);

  const rows = useMemo<SuggestionRow[]>(() => records.flatMap((record) =>
    record.bundle.suggestions.map((suggestion) => ({ record, suggestion }))
  ), [records]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return rows
      .filter((row) => {
        const { record, suggestion } = row;
        const actionable = isActionableSuggestion(suggestion);
        const owner = suggestionOwner(suggestion);
        const sla = slaState(row);
        if (statusFilter === "actionable" && !actionable) return false;
        if (statusFilter === "accepted" && suggestion.status !== "accepted") return false;
        if (statusFilter === "rejected" && suggestion.status !== "rejected") return false;
        if (ownerFilter !== "all" && owner !== ownerFilter) return false;
        if (slaFilter !== "all" && sla.id !== slaFilter) return false;
        if (typeFilter !== "all" && suggestion.suggestionType !== typeFilter) return false;
        if (!normalizedQuery) return true;
        const evidence = evidenceSummary(suggestion);
        const searchable = [
          record.inspection.vin,
          record.inspection.year,
          record.inspection.make,
          record.inspection.model,
          record.inspection.trim,
          suggestionTitle(suggestion.suggestionType),
          cleanExplanation(suggestion.explanation),
          evidence.primary,
          evidence.secondary ?? ""
        ].join(" ").toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .slice()
      .sort((left, right) => {
        const leftSla = slaState(left);
        const rightSla = slaState(right);
        if (leftSla.rank !== rightSla.rank) return leftSla.rank - rightSla.rank;
        const leftActionable = isActionableSuggestion(left.suggestion) ? 0 : 1;
        const rightActionable = isActionableSuggestion(right.suggestion) ? 0 : 1;
        if (leftActionable !== rightActionable) return leftActionable - rightActionable;
        const typeRankDelta = suggestionRank(left.suggestion) - suggestionRank(right.suggestion);
        if (typeRankDelta !== 0) return typeRankDelta;
        return right.suggestion.confidence - left.suggestion.confidence;
      });
  }, [ownerFilter, rows, searchQuery, slaFilter, statusFilter, typeFilter]);
  const pendingCount = rows.filter(({ suggestion }) => isActionableSuggestion(suggestion)).length;
  const slaWatchCount = rows.filter((row) => {
    const state = slaState(row).id;
    return state === "overdue" || state === "watch";
  }).length;
  const retakeCount = rows.filter(({ suggestion }) => isActionableSuggestion(suggestion) && qualityRetakeRequired(suggestion)).length;
  const acceptedCount = rows.filter(({ suggestion }) => suggestion.status === "accepted").length;
  const rejectedCount = rows.filter(({ suggestion }) => suggestion.status === "rejected").length;
  const closedCount = acceptedCount + rejectedCount;
  const canReviewSuggestions = can("suggestion:review");
  const hasActiveFilters = Boolean(searchQuery) || statusFilter !== "actionable" || ownerFilter !== "all" || slaFilter !== "all" || typeFilter !== "all";

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Suggestions</h1>
          <p>Prioritize findings that need reviewer decisions, inspector retakes, or disclosure updates.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {!canReviewSuggestions ? (
        <div className="role-callout role-restricted">
          <strong>{isEvaluationMode ? "Read-only evaluation workspace" : "Reviewer or Admin access required"}</strong>
          <span>{isEvaluationMode ? "Queue data is visible for review. Sign in with Cognito to accept, reject, edit, or assign findings." : "Inspectors can create inspections, attach photos, and run analysis; reviewers approve or reject the resulting suggestions."}</span>
        </div>
      ) : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="queue-filter-bar" aria-label="Suggestion queue filters">
        <label className="queue-search-field">
          <Search size={15} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search VIN, vehicle, finding, evidence..."
          />
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReviewStatusFilter)}>
            <option value="actionable">Actionable</option>
            <option value="all">All statuses</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          <span>Owner</span>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value as ReviewOwnerFilter)}>
            <option value="all">All owners</option>
            <option value="reviewer">Reviewer</option>
            <option value="inspector">Inspector QA</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          <span>SLA</span>
          <select value={slaFilter} onChange={(event) => setSlaFilter(event.target.value as ReviewSlaFilter)}>
            <option value="all">All SLA</option>
            <option value="overdue">Overdue</option>
            <option value="watch">SLA watch</option>
            <option value="clear">On track</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          <span>Finding</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ReviewTypeFilter)}>
            <option value="all">All findings</option>
            <option value="damage_candidate">Damage</option>
            <option value="quality_warning">Photo quality</option>
            <option value="extracted_text">VIN / odometer</option>
            <option value="photo_angle">Photo angle</option>
          </select>
        </label>
        <button
          className="secondary-button queue-reset-button"
          disabled={!hasActiveFilters}
          onClick={() => {
            setSearchQuery("");
            setStatusFilter("actionable");
            setOwnerFilter("all");
            setSlaFilter("all");
            setTypeFilter("all");
          }}
        >
          <SlidersHorizontal size={15} /> Reset
        </button>
      </div>

      <div className="queue-results-line">
        <span>{filteredRows.length} of {rows.length} findings</span>
        <span>Sorted by SLA risk, damage impact, and confidence.</span>
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <Sparkles size={18} />
          <span>Needs decision</span>
          <strong>{pendingCount}</strong>
        </article>
        <article className="summary-card">
          <Clock3 size={18} />
          <span>SLA watch</span>
          <strong>{slaWatchCount}</strong>
        </article>
        <article className="summary-card">
          <AlertTriangle size={18} />
          <span>Inspector retakes</span>
          <strong>{retakeCount}</strong>
        </article>
        <article className="summary-card">
          <Check size={18} />
          <span>Completed</span>
          <strong>{closedCount}</strong>
        </article>
      </div>

      <div className="table-panel review-table">
        {rows.length === 0 ? (
          <div className="empty-state">
            <Sparkles size={22} />
            <strong>No suggestions yet</strong>
            <span>Open an inspection, attach required photos, and run analysis to populate this queue.</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="empty-state">
            <Search size={22} />
            <strong>No findings match these filters</strong>
            <span>Adjust the queue filters or reset to actionable work.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Finding</th>
                <th>Owner</th>
                <th>SLA</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Evidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ record, suggestion }) => {
                const actionable = isActionableSuggestion(suggestion);
                const owner = suggestionOwner(suggestion);
                const sla = slaState({ record, suggestion });
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
                    <td>
                      <span className={`owner-chip owner-${owner}`}>{ownerLabel(owner)}</span>
                    </td>
                    <td>
                      <span className={`sla-chip sla-${sla.id}`}>{sla.label}</span>
                      <small>{sla.detail}</small>
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
                              title={canReviewSuggestions ? undefined : isEvaluationMode ? "Sign in with Cognito to change findings." : "Reviewer or Admin access required"}
                              onClick={() => void reviewSuggestion(suggestion.id, "accept")}
                            >
                              <Check size={15} /> Accept
                            </button>
                            <button
                              className="reject-button"
                              disabled={busyId === suggestion.id || !canReviewSuggestions}
                              title={canReviewSuggestions ? undefined : isEvaluationMode ? "Sign in with Cognito to change findings." : "Reviewer or Admin access required"}
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
