import { Check, RefreshCw, Sparkles, X } from "lucide-react";
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

function valuePreview(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function SuggestionsPage() {
  const { actor } = useActor();
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
            <span>Open an inspection, attach sample photos, and run analysis to populate this queue.</span>
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
                return (
                  <tr key={suggestion.id}>
                    <td>
                      <strong>{record.inspection.year} {record.inspection.make} {record.inspection.model}</strong>
                      <small>{record.inspection.vin}</small>
                    </td>
                    <td>
                      <strong>{suggestion.suggestionType.replaceAll("_", " ")}</strong>
                      <small>{suggestion.explanation}</small>
                    </td>
                    <td><span className={`queue-status status-${suggestion.status}`}>{suggestion.status}</span></td>
                    <td>{Math.round(suggestion.confidence * 100)}%</td>
                    <td><pre className="json-snippet">{valuePreview(suggestion.suggestedValueJson)}</pre></td>
                    <td>
                      <div className="table-actions">
                        <Link className="row-link" to={`/inspections/${record.inspection.id}`}>Open</Link>
                        {actionable ? (
                          <>
                            <button
                              className="accept-button"
                              disabled={busyId === suggestion.id}
                              onClick={() => void reviewSuggestion(suggestion.id, "accept")}
                            >
                              <Check size={15} /> Accept
                            </button>
                            <button
                              className="reject-button"
                              disabled={busyId === suggestion.id}
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
