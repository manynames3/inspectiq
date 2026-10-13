import { RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useActor } from "../App.js";
import type { AuditEvent } from "../types.js";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

type AuditRow = {
  record: InspectionReviewRecord;
  event: AuditEvent;
};

function eventFamily(eventType: string): string {
  if (eventType.startsWith("photo.")) return "Photo";
  if (eventType.startsWith("suggestion.")) return "Suggestion";
  if (eventType.startsWith("ai_report.") || eventType.startsWith("report.")) return "Report";
  if (eventType.startsWith("condition.")) return "Grade";
  if (eventType.startsWith("inspection.")) return "Inspection";
  return "Workflow";
}

export function AuditPage() {
  const { actor } = useActor();
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords(actor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit events.");
    }
  }

  useEffect(() => {
    void load();
  }, [actor]);

  const rows = useMemo<AuditRow[]>(() => records
    .flatMap((record) => record.bundle.auditEvents.map((event) => ({ record, event })))
    .sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt)), [records]);
  const reportEvents = rows.filter(({ event }) => eventFamily(event.eventType) === "Report").length;
  const evidenceEvents = rows.filter(({ event }) => eventFamily(event.eventType) === "Photo").length;
  const suggestionEvents = rows.filter(({ event }) => eventFamily(event.eventType) === "Suggestion").length;
  const partialDetailCount = records.filter((record) => record.bundleLoadError).length;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Audit</h1>
          <p>Immutable workflow trail for inspections, AI actions, reviewer decisions, and reports.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {partialDetailCount > 0 ? (
        <div className="warning-banner">
          Showing available audit events while {partialDetailCount} inspection detail refresh{partialDetailCount === 1 ? "" : "es"} finish.
        </div>
      ) : null}

      <div className="summary-grid">
        <article className="summary-card">
          <ShieldCheck size={18} />
          <span>Total events</span>
          <strong>{rows.length}</strong>
        </article>
        <article className="summary-card">
          <span>Photo evidence</span>
          <strong>{evidenceEvents}</strong>
        </article>
        <article className="summary-card">
          <span>Suggestions</span>
          <strong>{suggestionEvents}</strong>
        </article>
        <article className="summary-card">
          <span>Reports</span>
          <strong>{reportEvents}</strong>
        </article>
      </div>

      <div className="table-panel audit-table" role="region" aria-label="Audit events" tabIndex={0}>
        {rows.length === 0 ? (
          <div className="empty-state">
            <ShieldCheck size={22} />
            <strong>No audit events yet</strong>
            <span>Create or update an inspection to populate the audit trail.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Inspection</th>
                <th>Family</th>
                <th>Event</th>
                <th>Actor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ record, event }) => (
                <tr key={event.id}>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                  <td>
                    <strong>{record.inspection.year} {record.inspection.make} {record.inspection.model}</strong>
                    <small>{record.inspection.vin}</small>
                  </td>
                  <td><span className="queue-status">{eventFamily(event.eventType)}</span></td>
                  <td>{event.eventType}</td>
                  <td>{event.actor}</td>
                  <td><Link className="row-link" to={`/inspections/${record.inspection.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
