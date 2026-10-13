import { AlertTriangle, ArrowRight, RefreshCw, CarFront, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../App.js";
import { StatusPill } from "../components/StatusPill.js";
import { formatConditionGrade } from "../conditionGrade.js";
import type { Inspection } from "../types.js";
import { isCaptureQueueInspection, isReviewQueueInspection } from "../workflowMetrics.js";
import { inspectionNextStep, inspectionPriority } from "../workQueue.js";

export function DashboardPage() {
  const { actor, can } = useActor();
  const [search, setSearch] = useState("");
  const [needsWorkOnly, setNeedsWorkOnly] = useState(false);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setInspections(await api<Inspection[]>("/api/inspections", {}, actor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspections.");
    }
  }

  useEffect(() => {
    void load();
  }, [actor]);

  const visibleInspections = inspections.filter((inspection) => {
    if (actor.role === "inspector") return isCaptureQueueInspection(inspection);
    if (actor.role === "reviewer") return isReviewQueueInspection(inspection);
    return true;
  });
  const showingInspectorRecent = actor.role === "inspector" && visibleInspections.length === 0 && inspections.length > 0;
  const tableInspections = (showingInspectorRecent ? inspections : visibleInspections)
    .filter((inspection) => !needsWorkOnly || inspection.status !== "FINALIZED")
    .filter((inspection) => `${inspection.year} ${inspection.make} ${inspection.model} ${inspection.vin}`.toLowerCase().includes(search.toLowerCase()))
    .slice().sort((a, b) => inspectionPriority(b) - inspectionPriority(a));
  const roleContext = actor.role === "inspector"
    ? {
      title: showingInspectorRecent ? "Capture queue clear" : "Capture queue",
      detail: showingInspectorRecent
        ? "No vehicles currently need capture work. Recent assigned inspections remain visible for continuity."
        : "Prioritizes vehicles that need required angles, retakes, or image analysis before review.",
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
    <section className="page work-queue-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Vehicle condition intelligence / {actor.role.replaceAll("_", " ")}</span>
          <h1>Your work, in focus.</h1>
          <p>Evidence to capture. Decisions to make. Vehicles to release.</p>
        </div>
        <div className="heading-actions">{can("inspection:create") ? <Link to="/new" className="primary-button"><Plus size={17} /> New inspection</Link> : null}<button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button></div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="queue-ledger">
        <div><span>In your workspace</span><strong>{inspections.length.toString().padStart(2, "0")}</strong><small>Vehicles</small></div>
        <div><span>Evidence incomplete</span><strong>{inspections.filter((i) => i.completenessPercentage < 100).length.toString().padStart(2, "0")}</strong><small>Capture needed</small></div>
        <div><span>Awaiting decisions</span><strong>{inspections.filter(isReviewQueueInspection).length.toString().padStart(2, "0")}</strong><small>Human review</small></div>
        <div><span>Buyer-visible</span><strong>{inspections.filter((i) => i.buyerVisibleReady).length.toString().padStart(2, "0")}</strong><small>Released reports</small></div>
      </div>
      <div className={`role-focus-strip role-${actor.role}`}>
        <strong>{roleContext.title}</strong>
        <span>{roleContext.detail}</span>
        <em>{roleContext.primaryMetric}</em>
      </div>
      <div className="queue-toolbar"><div><button className={!needsWorkOnly ? "active" : ""} onClick={() => setNeedsWorkOnly(false)}>All assigned</button><button className={needsWorkOnly ? "active" : ""} onClick={() => setNeedsWorkOnly(true)}>Needs action</button></div><label className="queue-search"><Search size={16} /><input aria-label="Search vehicle or VIN" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vehicle or VIN" /></label></div>
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>VIN</th>
              <th>Status</th>
              <th>Evidence</th>
              <th>Condition grade</th>
              <th>Release</th>
              <th>Updated</th>
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>
            {tableInspections.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="inspection-empty-row">
                    No inspections match this workspace role. Check assignment, role, or queue filters.
                  </div>
                </td>
              </tr>
            ) : tableInspections.map((inspection) => (
              <tr key={inspection.id}>
                <td>
                  <span className="vehicle-name"><span className="vehicle-monogram"><CarFront size={23} /></span><strong>{inspection.year} {inspection.make} {inspection.model}</strong></span>
                  <small>{inspection.trim || "Base"} · {inspection.mileage.toLocaleString()} mi</small>
                </td>
                <td>
                  <span className="vin-cell">{inspection.vin}</span>
                  <Link className="vin-reference-link" to={`/inspections/${inspection.id}?reference=nhtsa`}>
                    NHTSA decode
                  </Link>
                </td>
                <td><StatusPill status={inspection.status} /></td>
                <td>
                  <div className="progress-cell">
                    <span>{inspection.completenessPercentage}%</span>
                    <div><i style={{ width: `${inspection.completenessPercentage}%` }} /></div>
                  </div>
                </td>
                <td>{inspection.conditionGrade
                  ? formatConditionGrade(inspection.conditionGrade, true)
                  : "Not graded"}</td>
                <td>{inspection.buyerVisibleReady ? "Buyer-visible" : inspection.humanReviewFlag ? <span className="review-flag"><AlertTriangle size={14} /> Review hold</span> : `${inspection.readinessIssueCount ?? 0} blockers`}</td>
                <td>{new Date(inspection.updatedAt).toLocaleString()}</td>
                <td>
                  <Link className="row-link" to={`/inspections/${inspection.id}`}>
                    {inspectionNextStep(inspection)} <ArrowRight size={15} />
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
