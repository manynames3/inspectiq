import { FileText, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

function reportSummary(record: InspectionReviewRecord): string {
  const output = record.bundle.aiReportDraft?.outputJson as { summary?: string } | undefined;
  if (output?.summary) return output.summary;
  return record.bundle.finalReport?.reportBody.split("\n").find(Boolean) ?? "Generate an AI draft from the inspection workbench.";
}

export function ReportsPage() {
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const reportRecords = useMemo(() => records.filter(({ bundle }) => bundle.finalReport), [records]);
  const finalizedCount = reportRecords.filter(({ bundle }) => bundle.finalReport?.finalizedAt).length;
  const draftCount = reportRecords.length - finalizedCount;
  const humanReviewCount = records.filter(({ bundle }) => bundle.aiReportDraft?.humanReviewRequired).length;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Report</h1>
          <p>AI-assisted condition report drafts, reviewer status, and finalization coverage.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid">
        <article className="summary-card">
          <FileText size={18} />
          <span>Reports created</span>
          <strong>{reportRecords.length}</strong>
        </article>
        <article className="summary-card">
          <span>Draft</span>
          <strong>{draftCount}</strong>
        </article>
        <article className="summary-card">
          <span>Finalized</span>
          <strong>{finalizedCount}</strong>
        </article>
        <article className="summary-card">
          <span>Human review</span>
          <strong>{humanReviewCount}</strong>
        </article>
      </div>

      <div className="table-panel report-table">
        {records.length === 0 ? (
          <div className="empty-state">
            <FileText size={22} />
            <strong>No inspections available</strong>
            <span>Create an inspection and generate a report draft from the workbench.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Report status</th>
                <th>Grade</th>
                <th>Confidence</th>
                <th>Version</th>
                <th>Summary</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const { inspection, bundle } = record;
                const status = bundle.finalReport?.finalizedAt ? "Finalized" : bundle.finalReport ? "Draft" : "Not started";
                return (
                  <tr key={inspection.id}>
                    <td>
                      <strong>{inspection.year} {inspection.make} {inspection.model}</strong>
                      <small>{inspection.vin}</small>
                    </td>
                    <td><span className={`queue-status report-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
                    <td>{bundle.conditionGrade ? `${bundle.conditionGrade.grade} ${bundle.conditionGrade.score}` : "Not graded"}</td>
                    <td>{bundle.aiReportDraft ? `${Math.round(bundle.aiReportDraft.confidence * 100)}%` : "N/A"}</td>
                    <td>{bundle.finalReport?.version ?? "N/A"}</td>
                    <td>{reportSummary(record)}</td>
                    <td><Link className="row-link" to={`/inspections/${inspection.id}`}>Open</Link></td>
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
