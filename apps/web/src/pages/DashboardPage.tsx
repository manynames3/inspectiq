import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../App.js";
import { StatusPill } from "../components/StatusPill.js";
import type { Inspection } from "../types.js";

export function DashboardPage() {
  const { actor } = useActor();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setInspections(await api<Inspection[]>("/api/inspections"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspections.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleInspections = inspections.filter((inspection) => {
    if (actor.role === "inspector") {
      return inspection.status === "DRAFT" || inspection.status === "NEEDS_PHOTOS" || inspection.completenessPercentage < 100;
    }
    if (actor.role === "reviewer") {
      return ["READY_FOR_GRADING", "GRADED", "AI_DRAFTED", "HUMAN_REVIEW_REQUIRED", "REPORT_FAILED"].includes(inspection.status);
    }
    return true;
  });
  const roleContext = actor.role === "inspector"
    ? {
      title: "Capture queue",
      detail: "Prioritizes vehicles that need required angles, retakes, or image analysis before review.",
      primaryMetric: `${visibleInspections.length} need capture work`
    }
    : actor.role === "reviewer"
      ? {
        title: "Review queue",
        detail: "Prioritizes evidence-complete inspections that need AI decisions, grade, report draft, or final approval.",
        primaryMetric: `${visibleInspections.length} need review work`
      }
      : {
        title: "Operations control",
        detail: "Shows every inspection with buyer-visible readiness, blockers, and exception status.",
        primaryMetric: `${inspections.filter((inspection) => inspection.buyerVisibleReady).length} buyer-ready`
      };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Wholesale inspection queue with evidence completeness, CR grade, and buyer-visible release status.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className={`role-focus-strip role-${actor.role}`}>
        <strong>{roleContext.title}</strong>
        <span>{roleContext.detail}</span>
        <em>{roleContext.primaryMetric}</em>
      </div>
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>VIN</th>
              <th>Status</th>
              <th>Evidence</th>
              <th>CR grade</th>
              <th>Release</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleInspections.map((inspection) => (
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
                <td>{inspection.conditionGrade?.grade ?? "Not graded"}</td>
                <td>{inspection.buyerVisibleReady ? "Buyer-visible" : inspection.humanReviewFlag ? <span className="review-flag"><AlertTriangle size={14} /> Review hold</span> : `${inspection.readinessIssueCount ?? 0} blockers`}</td>
                <td>{new Date(inspection.updatedAt).toLocaleString()}</td>
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
