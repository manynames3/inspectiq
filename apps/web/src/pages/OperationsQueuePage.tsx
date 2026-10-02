import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileClock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wrench
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../App.js";
import { filterOperations, operationsMetrics, reconQueueSummary } from "../reconViewModel.js";
import type { ReconOperationsRecord } from "../types.js";

function saleTime(value: string): string {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function OperationsQueuePage() {
  const { actor } = useActor();
  const [records, setRecords] = useState<ReconOperationsRecord[]>([]);
  const [query, setQuery] = useState("");
  const [facility, setFacility] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [urgency, setUrgency] = useState("ALL");
  const [workflow, setWorkflow] = useState("ALL");
  const [authorization, setAuthorization] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setRecords(await api<ReconOperationsRecord[]>("/api/operations/recon", {}, actor));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load recon operations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [actor]);

  const visible = useMemo(() => {
    return filterOperations(records, { query, facility, department, urgency, workflow, authorization });
  }, [authorization, department, facility, query, records, urgency, workflow]);
  const metrics = useMemo(() => operationsMetrics(records), [records]);
  const facilities = useMemo(() => [...new Set(records.map((record) => record.intake.facility))].sort(), [records]);
  const departments = useMemo(() => [
    ...new Set(records.flatMap((record) => record.workOrders.map((order) => order.serviceDepartment)))
  ].sort(), [records]);
  const hasFilters = Boolean(query) || facility !== "ALL" || department !== "ALL" || urgency !== "ALL" || workflow !== "ALL" || authorization !== "ALL";

  function clearFilters() {
    setQuery("");
    setFacility("ALL");
    setDepartment("ALL");
    setUrgency("ALL");
    setWorkflow("ALL");
    setAuthorization("ALL");
  }

  return (
    <section className="page operations-page">
      <div className="page-heading">
        <div>
          <h1>Recon Operations</h1>
          <p>Compare CR condition, confirmed repair exposure, authorization, and work progress before sale.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="summary-grid operations-summary">
        <article className="summary-card">
          <ClipboardCheck size={18} />
          <span>Active vehicles</span>
          <strong>{metrics.activeVehicles}</strong>
        </article>
        <article className="summary-card">
          <AlertTriangle size={18} />
          <span>High urgency</span>
          <strong>{metrics.highUrgency}</strong>
        </article>
        <article className="summary-card">
          <FileClock size={18} />
          <span>CR awaiting review</span>
          <strong>{metrics.conditionReportsAwaitingReview}</strong>
        </article>
        <article className="summary-card">
          <Clock3 size={18} />
          <span>Recon awaiting auth</span>
          <strong>{metrics.reconAwaitingAuthorization}</strong>
        </article>
        <article className="summary-card">
          <BadgeDollarSign size={18} />
          <span>Auto-authorized</span>
          <strong>{metrics.automaticallyAuthorizedRecon}</strong>
        </article>
        <article className="summary-card">
          <Wrench size={18} />
          <span>Work in progress</span>
          <strong>{metrics.workInProgress}</strong>
        </article>
        <article className="summary-card">
          <RotateCcw size={18} />
          <span>Reauthorization</span>
          <strong>{metrics.reauthorizationRequired}</strong>
        </article>
        <article className="summary-card">
          <ShieldAlert size={18} />
          <span>QC failures</span>
          <strong>{metrics.qualityControlFailures}</strong>
        </article>
        <article className="summary-card">
          <CheckCircle2 size={18} />
          <span>Sale ready</span>
          <strong>{metrics.saleReady}</strong>
        </article>
      </div>

      <div className="queue-toolbar">
        <label className="queue-search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="VIN, work order, vehicle, consignor..." />
        </label>
        <label>
          <span>Facility</span>
          <select value={facility} onChange={(event) => setFacility(event.target.value)}>
            <option value="ALL">All facilities</option>
            {facilities.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Department</span>
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="ALL">All departments</option>
            {departments.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label>
          <span>Urgency</span>
          <select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="ALL">All urgency</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label>
          <span>Inspection workflow</span>
          <select value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
            <option value="ALL">All workflows</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="CAPTURE_IN_PROGRESS">Capture in progress</option>
            <option value="REVIEW_READY">Review ready</option>
            <option value="RETAKE_REQUIRED">Retake required</option>
            <option value="CR_PUBLISHED">CR published</option>
          </select>
        </label>
        <label>
          <span>Authorization</span>
          <select value={authorization} onChange={(event) => setAuthorization(event.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="ESTIMATE_PENDING">Estimate pending</option>
            <option value="AUTHORIZATION_PENDING">Authorization pending</option>
            <option value="AUTHORIZED">Authorized</option>
            <option value="PARTIALLY_AUTHORIZED">Partially authorized</option>
            <option value="DECLINED">Declined</option>
            <option value="REAUTHORIZATION_REQUIRED">Reauthorization required</option>
          </select>
        </label>
        <button className="secondary-button filter-reset" disabled={!hasFilters} onClick={clearFilters}>
          <RotateCcw size={15} /> Clear
        </button>
      </div>

      <div className="table-panel operations-table">
        {loading ? <div className="loading">Loading recon operations...</div> : visible.length === 0 ? (
          <div className="empty-state">
            <Wrench size={22} />
            <strong>No vehicles match these filters</strong>
            <span>Clear a filter or refresh the queue.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Urgency</th>
                <th>Vehicle</th>
                <th>Consignor</th>
                <th>Sale</th>
                <th>CR / grade</th>
                <th>Recon</th>
                <th>Work</th>
                <th>Readiness</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((record) => {
                const recon = reconQueueSummary(record);
                const grade = record.conditionGradePreview;
                return (
                <tr key={record.inspection.id}>
                  <td>
                    <span className={`urgency-badge urgency-${record.urgency.urgencyClassification.toLowerCase()}`}>
                      {record.urgency.urgencyScore} · {record.urgency.urgencyClassification}
                    </span>
                    <small>{record.urgency.urgencyReasons[0] ?? "On schedule"}</small>
                  </td>
                  <td>
                    <strong>{record.inspection.year} {record.inspection.make} {record.inspection.model}</strong>
                    <small>{record.inspection.vin}</small>
                  </td>
                  <td>
                    <strong>{record.consignor.name}</strong>
                    <small>{record.intake.facility} · {record.intake.yardZone}/{record.intake.parkingSpace}</small>
                  </td>
                  <td>
                    <strong>{saleTime(record.saleAssignment.saleDateTime)}</strong>
                    <small>{record.saleAssignment.lane} · Run {record.saleAssignment.runNumber}</small>
                  </td>
                  <td>
                    <strong>{grade?.status === "PRELIMINARY" ? "Preliminary CR" : record.conditionReport?.finalizedAt ? "Published CR" : "CR pending"}</strong>
                    <small>
                      {grade
                        ? `${grade.value.toFixed(1)} / 5.0 ${grade.status === "PRELIMINARY" ? "· incomplete evidence" : "approved"}`
                        : "Grade pending"}
                    </small>
                  </td>
                  <td>
                    <span className={`queue-status recon-summary-${recon.status.toLowerCase()}`}>{recon.label}</span>
                    <strong className="recon-queue-amount">{recon.amount}</strong>
                    <small>{recon.detail}</small>
                  </td>
                  <td>
                    <strong>{record.workOrders.length} order{record.workOrders.length === 1 ? "" : "s"}</strong>
                    <small>{record.workOrders.filter((workOrder) => workOrder.status === "COMPLETED").length} complete</small>
                  </td>
                  <td>
                    <span className={`queue-status readiness-${record.readiness.status.toLowerCase()}`}>{record.readiness.saleReady ? "Sale ready" : `${record.readiness.blockers.length} blockers`}</span>
                    {!record.readiness.saleReady ? <small>{record.readiness.blockers[0]?.message ?? "Readiness review required"}</small> : null}
                  </td>
                  <td>
                    <div className="row-action-stack">
                      <Link to={`/inspections/${record.inspection.id}`}>Inspection</Link>
                      <Link to={`/operations/recon/${record.inspection.id}`}>Recon</Link>
                      <Link to="/reports">CR</Link>
                      {record.workOrders.length > 0 ? <Link to="/shop-board">Work</Link> : null}
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
