import { ArrowRight, ClipboardList, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StatusPill } from "../components/StatusPill.js";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

export function InspectionsPage() {
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspections.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const reviewCount = useMemo(() => records.filter(({ inspection }) =>
    inspection.status === "HUMAN_REVIEW_REQUIRED" || inspection.status === "AI_DRAFTED"
  ).length, [records]);
  const completeCount = useMemo(() => records.filter(({ inspection }) =>
    inspection.completenessPercentage === 100
  ).length, [records]);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Inspections</h1>
          <p>Vehicle inspection queue with evidence, AI review, report, and audit progress.</p>
        </div>
        <div className="heading-actions">
          <Link className="secondary-button" to="/new">
            <Plus size={16} /> New Inspection
          </Link>
          <button className="secondary-button" onClick={() => void load()}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <article className="summary-card">
          <ClipboardList size={18} />
          <span>Total inspections</span>
          <strong>{records.length}</strong>
        </article>
        <article className="summary-card">
          <span>Evidence complete</span>
          <strong>{completeCount}</strong>
        </article>
        <article className="summary-card">
          <span>In human review</span>
          <strong>{reviewCount}</strong>
        </article>
        <article className="summary-card">
          <span>Finalized</span>
          <strong>{records.filter(({ inspection }) => inspection.status === "FINALIZED").length}</strong>
        </article>
      </div>

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>VIN</th>
              <th>Status</th>
              <th>Evidence</th>
              <th>Suggestions</th>
              <th>Damage</th>
              <th>Report</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map(({ inspection, bundle }) => (
              <tr key={inspection.id}>
                <td>
                  <strong>{inspection.year} {inspection.make} {inspection.model}</strong>
                  <small>{inspection.trim || "Base"} · {inspection.mileage.toLocaleString()} mi</small>
                </td>
                <td>{inspection.vin}</td>
                <td><StatusPill status={inspection.status} /></td>
                <td>
                  <div className="progress-cell">
                    <span>{inspection.completenessPercentage}%</span>
                    <div><i style={{ width: `${inspection.completenessPercentage}%` }} /></div>
                  </div>
                </td>
                <td>{bundle.suggestions.length}</td>
                <td>{bundle.damageItems.length}</td>
                <td>{bundle.finalReport?.finalizedAt ? "Finalized" : bundle.finalReport ? "Draft" : "Not started"}</td>
                <td>
                  <Link className="row-link" to={`/inspections/${inspection.id}`}>
                    Open <ArrowRight size={15} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
