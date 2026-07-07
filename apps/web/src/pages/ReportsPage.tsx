import { Download, FileText, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl, requestHeaders } from "../api.js";
import { useActor } from "../App.js";
import { deriveMarketplaceReadiness } from "../marketplaceReadiness.js";
import type { Actor } from "../types.js";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

function reportSummary(record: InspectionReviewRecord): string {
  const output = record.bundle.aiReportDraft?.outputJson as { summary?: string } | undefined;
  if (output?.summary) return output.summary;
  return record.bundle.finalReport?.reportBody.split("\n").find(Boolean) ?? "Report not started. Open the inspection to prepare a buyer-ready draft.";
}

async function downloadBuyerReport(reportId: string, actor: Actor): Promise<void> {
  const response = await fetch(apiUrl(`/api/reports/${reportId}/export`), {
    headers: requestHeaders(actor)
  });
  if (!response.ok) throw new Error("Could not export the buyer-ready report.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "condition-report.txt";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { actor } = useActor();
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords(actor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    }
  }

  useEffect(() => {
    void load();
  }, [actor]);

  const reportRecords = useMemo(() => records.filter(({ bundle }) => bundle.finalReport), [records]);
  const finalizedCount = reportRecords.filter(({ bundle }) => bundle.finalReport?.finalizedAt).length;
  const draftCount = reportRecords.length - finalizedCount;
  const humanReviewCount = records.filter(({ bundle }) => bundle.aiReportDraft?.humanReviewRequired).length;
  const partialDetailCount = records.filter((record) => record.bundleLoadError).length;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Report</h1>
          <p>Condition report drafts, reviewer status, and finalization coverage.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {partialDetailCount > 0 ? (
        <div className="warning-banner">
          Showing available report records while {partialDetailCount} inspection detail refresh{partialDetailCount === 1 ? "" : "es"} finish.
        </div>
      ) : null}

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
            <span>Create an inspection, complete required evidence, and prepare a buyer-ready report.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Report status</th>
                <th>Grade</th>
                <th>Confidence</th>
                <th>Buyer visibility</th>
                <th>Recon estimate</th>
                <th>Version</th>
                <th>Summary</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const { inspection, bundle } = record;
                const status = bundle.finalReport?.finalizedAt ? "Finalized" : bundle.finalReport ? "Draft" : "Not started";
                const readiness = deriveMarketplaceReadiness(bundle);
                return (
                  <tr key={inspection.id}>
                    <td>
                      <strong>{inspection.year} {inspection.make} {inspection.model}</strong>
                      <small>{inspection.vin}</small>
                    </td>
                    <td><span className={`queue-status report-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
                    <td>{bundle.conditionGrade ? `${bundle.conditionGrade.grade} ${bundle.conditionGrade.score}` : "Not graded"}</td>
                    <td>{bundle.aiReportDraft ? `${Math.round(bundle.aiReportDraft.confidence * 100)}%` : "Pending"}</td>
                    <td>{readiness.buyerVisibility}</td>
                    <td>{readiness.reconditioningEstimate}</td>
                    <td>{bundle.finalReport?.version ?? "Pending"}</td>
                    <td>{reportSummary(record)}</td>
                    <td>
                      <div className="row-actions">
                        {bundle.finalReport ? (
                          <button className="row-link button-link" type="button" onClick={() => void downloadBuyerReport(bundle.finalReport!.id, actor)}>
                            <Download size={14} /> Export
                          </button>
                        ) : null}
                        <Link className="row-link" to={`/inspections/${inspection.id}`}>Open</Link>
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
