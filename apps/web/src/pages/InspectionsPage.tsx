import { ArrowRight, ClipboardList, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useActor } from "../App.js";
import { StatusPill } from "../components/StatusPill.js";
import { deriveMarketplaceReadiness } from "../marketplaceReadiness.js";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

export function InspectionsPage() {
  const { actor } = useActor();
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords(actor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspections.");
    }
  }

  useEffect(() => {
    void load();
  }, [actor]);

  const reviewCount = useMemo(() => records.filter(({ inspection }) =>
    inspection.status === "HUMAN_REVIEW_REQUIRED" || inspection.status === "AI_DRAFTED"
  ).length, [records]);
  const completeCount = useMemo(() => records.filter(({ inspection }) =>
    inspection.completenessPercentage === 100
  ).length, [records]);
  const readinessRows = useMemo(() => records.map((record) => ({
    inspectionId: record.inspection.id,
    readiness: deriveMarketplaceReadiness(record.bundle)
  })), [records]);
  const crReadyCount = useMemo(() => readinessRows.filter(({ readiness }) => readiness.crStatus === "CR ready").length, [readinessRows]);
  const vdpReadyCount = useMemo(() => readinessRows.filter(({ readiness }) => readiness.vdpStatus === "VDP ready").length, [readinessRows]);
  const arbitrationWatchCount = useMemo(() => readinessRows.filter(({ readiness }) => readiness.arbitrationRisk !== "Low").length, [readinessRows]);

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
          <span>CR ready</span>
          <strong>{crReadyCount}</strong>
        </article>
        <article className="summary-card">
          <span>VDP ready</span>
          <strong>{vdpReadyCount}</strong>
        </article>
        <article className="summary-card">
          <span>Arbitration watch</span>
          <strong>{arbitrationWatchCount}</strong>
        </article>
      </div>
      <div className="queue-context-line">
        <span>{completeCount} evidence-complete</span>
        <span>{reviewCount} in human review</span>
        <span>{records.filter(({ inspection }) => inspection.status === "FINALIZED").length} finalized CRs</span>
      </div>

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>VIN</th>
              <th>Status</th>
              <th>Evidence</th>
              <th>CR</th>
              <th>VDP</th>
              <th>Recon</th>
              <th>Arb. risk</th>
              <th>Report</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map(({ inspection, bundle }) => {
              const readiness = deriveMarketplaceReadiness(bundle);
              return (
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
                <td><span className={readiness.crStatus === "CR ready" ? "inline-ready" : "inline-watch"}>{readiness.crStatus}</span></td>
                <td>{readiness.vdpStatus}</td>
                <td>{readiness.reconditioningEstimate}</td>
                <td><span className={`risk-label risk-${readiness.arbitrationRisk.toLowerCase()}`}>{readiness.arbitrationRisk}</span></td>
                <td>{bundle.finalReport?.finalizedAt ? "Finalized" : bundle.finalReport ? "Draft" : "Not started"}</td>
                <td>
                  <Link className="row-link" to={`/inspections/${inspection.id}`}>
                    Open <ArrowRight size={15} />
                  </Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
