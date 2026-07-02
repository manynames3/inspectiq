import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DamageItem } from "../types.js";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

type DamageRow = {
  record: InspectionReviewRecord;
  item: DamageItem;
};

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function DamagePage() {
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load damage items.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo<DamageRow[]>(() => records.flatMap((record) =>
    record.bundle.damageItems.map((item) => ({ record, item }))
  ), [records]);
  const minorCount = rows.filter(({ item }) => item.severity === "minor").length;
  const moderateCount = rows.filter(({ item }) => item.severity === "moderate").length;
  const severeCount = rows.filter(({ item }) => item.severity === "severe").length;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Damage</h1>
          <p>Confirmed condition issues from manual review and accepted AI suggestions.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <article className="summary-card">
          <AlertTriangle size={18} />
          <span>Total damage items</span>
          <strong>{rows.length}</strong>
        </article>
        <article className="summary-card">
          <span>Minor</span>
          <strong>{minorCount}</strong>
        </article>
        <article className="summary-card">
          <span>Moderate</span>
          <strong>{moderateCount}</strong>
        </article>
        <article className="summary-card">
          <span>Severe</span>
          <strong>{severeCount}</strong>
        </article>
      </div>

      <div className="table-panel">
        {rows.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={22} />
            <strong>No confirmed damage yet</strong>
            <span>Add damage from an inspection detail page or accept an AI damage candidate.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Location</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ record, item }) => (
                <tr key={item.id}>
                  <td>
                    <strong>{record.inspection.year} {record.inspection.make} {record.inspection.model}</strong>
                    <small>{record.inspection.vin}</small>
                  </td>
                  <td>{titleCase(item.location)}</td>
                  <td>{titleCase(item.damageType)}</td>
                  <td><span className={`queue-status severity-${item.severity}`}>{item.severity}</span></td>
                  <td>{item.source === "vision_suggestion" ? "AI-suggested" : "Manual"}</td>
                  <td>{item.notes || "No notes"}</td>
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
