import { Check, Clock3, RefreshCw, ShieldCheck, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../App.js";
import type { ReconOperationsRecord } from "../types.js";

export function ShopBoardPage() {
  const { actor, can } = useActor();
  const [records, setRecords] = useState<ReconOperationsRecord[]>([]);
  const [status, setStatus] = useState("ACTIVE");
  const [department, setDepartment] = useState("ALL");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRecords(await api<ReconOperationsRecord[]>("/api/operations/recon", {}, actor));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the shop board.");
    }
  }

  useEffect(() => {
    void load();
  }, [actor]);

  async function mutate(key: string, path: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) }, actor);
      await load();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Could not update the work order.");
    } finally {
      setBusy(null);
    }
  }

  async function patchWorkOrder(workOrderId: string, body: Record<string, unknown>) {
    setBusy(workOrderId);
    setError(null);
    try {
      await api(`/api/work-orders/${workOrderId}`, { method: "PATCH", body: JSON.stringify(body) }, actor);
      await load();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Could not update the work order.");
    } finally {
      setBusy(null);
    }
  }

  const orders = useMemo(() => records.flatMap((record) =>
    record.workOrders.map((workOrder) => ({ record, workOrder }))
  ).filter(({ workOrder }) => {
    if (status === "ALL") return true;
    if (status === "ACTIVE") return workOrder.status !== "COMPLETED";
    return workOrder.status === status;
  }).filter(({ record, workOrder }) => {
    if (department !== "ALL" && workOrder.serviceDepartment !== department) return false;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [
      workOrder.workOrderNumber,
      record.inspection.vin,
      record.inspection.make,
      record.inspection.model,
      record.consignor.name,
      record.intake.facility,
      workOrder.assignedTechnician ?? ""
    ].join(" ").toLowerCase().includes(normalized);
  }).sort((left, right) => {
    const urgencyDifference = right.record.urgency.urgencyScore - left.record.urgency.urgencyScore;
    if (urgencyDifference !== 0) return urgencyDifference;
    return left.workOrder.saleDeadline.localeCompare(right.workOrder.saleDeadline);
  }), [department, query, records, status]);
  const departments = useMemo(() => [
    ...new Set(records.flatMap((record) => record.workOrders.map((workOrder) => workOrder.serviceDepartment)))
  ].sort(), [records]);
  const canUpdateWork = can("work_order:update");
  const canQc = can("quality_control:decide");

  return (
    <section className="page shop-board-page">
      <div className="page-heading">
        <div>
          <h1>Shop Board</h1>
          <p>Authorized facility work ordered by sale deadline.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="queue-toolbar shop-toolbar">
        <label className="queue-search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Work order, VIN, vehicle, technician..." />
        </label>
        <label>
          <span>Work status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ACTIVE">Active work</option>
            <option value="QUEUED">Queued</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="BLOCKED">Blocked</option>
            <option value="QC_REQUIRED">QC required</option>
            <option value="COMPLETED">Completed</option>
            <option value="ALL">All work</option>
          </select>
        </label>
        <label>
          <span>Department</span>
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="ALL">All departments</option>
            {departments.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
      </div>
      <div className="shop-board-grid">
        {orders.length === 0 ? (
          <div className="empty-state">
            <Wrench size={22} />
            <strong>No work orders match this view</strong>
            <span>Authorized work appears here after policy or consignor approval.</span>
          </div>
        ) : orders.map(({ record, workOrder }) => (
          <article className={`shop-order shop-${workOrder.status.toLowerCase()}`} key={workOrder.id}>
            <header>
              <div><strong>{workOrder.workOrderNumber}</strong><span>{workOrder.serviceDepartment}</span></div>
              <span className="queue-status">{workOrder.status.replaceAll("_", " ")}</span>
            </header>
            <h2>{record.inspection.year} {record.inspection.make} {record.inspection.model}</h2>
            <p>{record.inspection.vin}</p>
            <dl>
              <div><dt>Location</dt><dd>{record.intake.facility} · {record.intake.yardZone}/{record.intake.parkingSpace}</dd></div>
              <div><dt>Consignor</dt><dd>{record.consignor.name}</dd></div>
              <div><dt>Technician</dt><dd>{workOrder.assignedTechnician ?? "Unassigned"}</dd></div>
              <div><dt>Sale deadline</dt><dd>{new Date(workOrder.saleDeadline).toLocaleString()}</dd></div>
              <div><dt>Urgency</dt><dd>{record.urgency.urgencyScore} · {record.urgency.urgencyClassification}</dd></div>
              <div><dt>Authorized</dt><dd>${workOrder.authorizedAmount.toLocaleString()}</dd></div>
              <div><dt>Current estimate</dt><dd>${workOrder.currentEstimatedCost.toLocaleString()}</dd></div>
              <div><dt>Tasks</dt><dd>{workOrder.tasks.filter((task) => task.status === "COMPLETED").length}/{workOrder.tasks.length} complete</dd></div>
            </dl>
            {workOrder.blockedReason ? <div className="work-order-blocker">{workOrder.blockedReason}</div> : null}
            <div className="shop-order-actions">
              {!workOrder.assignedTechnician ? (
                <button
                  className="secondary-button"
                  disabled={!canUpdateWork || busy !== null}
                  onClick={() => void patchWorkOrder(workOrder.id, {
                    action: "ASSIGN_TECHNICIAN",
                    assignedTechnician: actor.id,
                    expectedVersion: workOrder.version
                  })}
                >
                  Assign to me
                </button>
              ) : null}
              {(workOrder.status === "QUEUED" || workOrder.status === "BLOCKED") ? (
                <button
                  className="primary-button"
                  disabled={!canUpdateWork || busy !== null}
                  onClick={() => void patchWorkOrder(workOrder.id, { action: "START", expectedVersion: workOrder.version })}
                >
                  <Clock3 size={15} /> Start
                </button>
              ) : null}
              {workOrder.status === "IN_PROGRESS" ? (
                <button
                  className="primary-button"
                  disabled={!canUpdateWork || busy !== null}
                  onClick={() => void patchWorkOrder(workOrder.id, { action: "SEND_TO_QC", expectedVersion: workOrder.version })}
                >
                  <ShieldCheck size={15} /> Send to QC
                </button>
              ) : null}
              {workOrder.status === "QC_REQUIRED" ? (
                <>
                  <button
                    className="primary-button"
                    disabled={!canQc || busy !== null}
                    onClick={() => void mutate(`pass-${workOrder.id}`, `/api/work-orders/${workOrder.id}/quality-control`, {
                      decision: "PASS",
                      notes: "Authorized work verified against the task scope.",
                      expectedVersion: workOrder.version
                    })}
                  >
                    <Check size={15} /> Pass
                  </button>
                  <button
                    className="danger-button"
                    disabled={!canQc || busy !== null}
                    onClick={() => void mutate(`fail-${workOrder.id}`, `/api/work-orders/${workOrder.id}/quality-control`, {
                      decision: "FAIL",
                      notes: "Work does not yet meet the authorized task scope.",
                      expectedVersion: workOrder.version
                    })}
                  >
                    <X size={15} /> Fail
                  </button>
                </>
              ) : null}
              <Link className="row-link" to={`/operations/recon/${record.inspection.id}`}>Manage scope and estimate</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
