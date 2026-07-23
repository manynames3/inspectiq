import { ArrowLeft, Check, Clock3, RefreshCw, Send, ShieldCheck, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ServiceType } from "@inspectiq/shared";
import { api } from "../api.js";
import { useActor } from "../App.js";
import { authorizationSourceLabel } from "../reconViewModel.js";
import type { ReconAuthorization, ReconOperationsRecord, WorkOrder } from "../types.js";

const serviceTypes: ServiceType[] = ["DETAIL", "MECHANICAL", "BODY", "TIRE", "GLASS", "THIRD_PARTY"];

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function authorizationFor(record: ReconOperationsRecord, recommendationId: string): ReconAuthorization | null {
  return record.authorizations
    .filter((authorization) => authorization.recommendationId === recommendationId)
    .sort((left, right) => right.version - left.version)[0] ?? null;
}

export function ReconDecisionPage() {
  const { inspectionId } = useParams();
  const { actor, can, isEvaluationMode } = useActor();
  const [record, setRecord] = useState<ReconOperationsRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<Record<string, string>>({});
  const [revisedEstimates, setRevisedEstimates] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    serviceType: "DETAIL" as ServiceType,
    recommendedAction: "",
    estimatedCost: 0,
    estimatedDurationHours: 1,
    expectedGradeLift: 0,
    notes: ""
  });

  async function load() {
    if (!inspectionId) return;
    setError(null);
    try {
      setRecord(await api<ReconOperationsRecord>(`/api/operations/recon/${inspectionId}`, {}, actor));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load vehicle operations.");
    }
  }

  async function mutate(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The workflow update failed.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, [actor, inspectionId]);

  const pendingAuthorizations = useMemo(
    () => record?.authorizations.filter((authorization) => authorization.decision === "PENDING") ?? [],
    [record]
  );

  if (!inspectionId) return <section className="page"><div className="error-banner">Inspection identifier is missing.</div></section>;
  if (!record && !error) return <section className="page"><div className="loading">Loading recon decision workspace...</div></section>;
  if (!record) return <section className="page"><div className="error-banner">{error}</div></section>;

  const canEstimate = can("recon:estimate");
  const canAuthorize = can("recon:authorize");
  const canUpdateWork = can("work_order:update");
  const canQc = can("quality_control:decide");
  const canAssess = can("sale_readiness:assess");

  function decide(authorization: ReconAuthorization, decision: "APPROVE" | "DECLINE" | "REQUEST_REVISION") {
    const reason = decision === "APPROVE"
      ? "Approved after reviewing the condition report, estimate, and sale deadline."
      : decision === "DECLINE"
        ? "Declined after reviewing vehicle economics and sale timing."
        : "Revise the estimate with clearer scope and supporting evidence.";
    return mutate(`authorization-${authorization.id}`, () => api(`/api/recon/authorizations/${authorization.id}/decision`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        decisionReason: reason,
        authorizedAmount: decision === "APPROVE"
          ? record!.recommendations.find((item) => item.id === authorization.recommendationId)?.estimatedCost
          : undefined,
        expectedVersion: authorization.version
      })
    }, actor));
  }

  function updateWorkOrder(
    workOrder: WorkOrder,
    action: "ASSIGN_TECHNICIAN" | "START" | "BLOCK" | "REVISE_ESTIMATE" | "SEND_TO_QC"
  ) {
    const revisedEstimate = revisedEstimates[workOrder.id];
    const blockedReason = blockedReasons[workOrder.id]?.trim();
    return mutate(`work-${workOrder.id}`, () => api(`/api/work-orders/${workOrder.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        action,
        assignedTechnician: action === "ASSIGN_TECHNICIAN" ? actor.id : undefined,
        blockedReason: action === "BLOCK" ? blockedReason : undefined,
        currentEstimatedCost: action === "REVISE_ESTIMATE" ? Number(revisedEstimate) : undefined,
        expectedVersion: workOrder.version
      })
    }, actor));
  }

  return (
    <section className="page operations-detail-page">
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/operations"><ArrowLeft size={15} /> Recon Operations</Link>
          <h1>{record.inspection.year} {record.inspection.make} {record.inspection.model}</h1>
          <p>{record.inspection.vin} · {record.consignor.name} · {record.intake.facility} {record.intake.yardZone}/{record.intake.parkingSpace}</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {isEvaluationMode ? <div className="info-banner">Read-only evaluation workspace. Decisions show the complete workflow but do not change records.</div> : null}

      <div className="operations-status-grid">
        <article><span>Sale deadline</span><strong>{new Date(record.saleAssignment.saleDateTime).toLocaleString()}</strong><small>{record.saleAssignment.lane} · Run {record.saleAssignment.runNumber}</small></article>
        <article><span>Condition report</span><strong>{record.conditionReport?.finalizedAt ? "Published" : "Not published"}</strong><small>{record.conditionGrade?.approvedGrade != null ? `${record.conditionGrade.approvedGrade.toFixed(1)} / 5.0 before recon` : "Grade approval pending"}</small></article>
        <article><span>Authorization</span><strong>{record.reconStatus.replaceAll("_", " ")}</strong><small>{money(record.totals.pendingCost)} awaiting decision</small></article>
        <article><span>Projected grade</span><strong>{record.conditionGrade ? `${record.conditionGrade.estimatedGradeAfterRecon.toFixed(1)} / 5.0` : "Pending"}</strong><small>Authorized items only</small></article>
        <article><span>Sale readiness</span><strong>{record.readiness.saleReady ? "Ready" : "Blocked"}</strong><small>{record.readiness.blockers.length} blocking condition{record.readiness.blockers.length === 1 ? "" : "s"}</small></article>
      </div>
      <div className="authorization-summary-strip" aria-label="Recon authorization totals">
        <div><span>Total recommended</span><strong>{money(record.totals.recommendedCost)}</strong></div>
        <div><span>Policy authorized</span><strong>{money(record.totals.automaticallyAuthorizedCost)}</strong></div>
        <div><span>Manual authorized</span><strong>{money(record.totals.manuallyAuthorizedCost)}</strong></div>
        <div><span>Declined</span><strong>{money(record.totals.declinedCost)}</strong></div>
        <div><span>Account capacity</span><strong>{money(record.totals.remainingAccountAuthorization)}</strong></div>
      </div>

      {record.readiness.blockers.length > 0 ? (
        <div className="readiness-blockers" aria-label="Sale readiness blockers">
          {record.readiness.blockers.map((blocker) => (
            <span key={`${blocker.code}-${blocker.message}`}><strong>{blocker.code.replaceAll("_", " ")}</strong>{blocker.message}</span>
          ))}
        </div>
      ) : null}

      <div className="operations-detail-grid">
        <section className="operations-panel">
          <div className="panel-header">
            <div><h2>Recon estimate and authorization</h2><p>Spending decisions remain separate from AI findings and condition grading.</p></div>
            <span>{money(record.totals.recommendedCost)} recommended</span>
          </div>
          <div className="recon-item-list">
            {record.recommendations.length === 0 ? <p className="empty-dock-state">No recon recommendations have been prepared.</p> : record.recommendations.map((recommendation) => {
              const authorization = authorizationFor(record, recommendation.id);
              return (
                <article className="recon-item" key={recommendation.id}>
                  <div className="recon-item-main">
                    <span className="service-tag">{recommendation.serviceType}</span>
                    <div>
                      <strong>{recommendation.recommendedAction}</strong>
                      <p>{recommendation.notes || "No additional estimator notes."}</p>
                    </div>
                  </div>
                  <dl>
                    <div><dt>Estimate</dt><dd>{money(recommendation.estimatedCost)}</dd></div>
                    <div><dt>Duration</dt><dd>{recommendation.estimatedDurationHours} hr</dd></div>
                    <div><dt>Expected lift</dt><dd>+{recommendation.expectedGradeLift.toFixed(1)}</dd></div>
                    <div><dt>Decision</dt><dd>{authorization?.decision.replaceAll("_", " ") ?? "Not submitted"}</dd></div>
                    <div><dt>Authorization source</dt><dd>{authorizationSourceLabel(authorization?.authorizationSource ?? null)}</dd></div>
                  </dl>
                  {authorization?.decision === "PENDING" ? (
                    <div className="recon-item-actions">
                      <button disabled={!canAuthorize || busy !== null} className="primary-button" onClick={() => void decide(authorization, "APPROVE")}><Check size={15} /> Approve</button>
                      <button disabled={!canAuthorize || busy !== null} className="danger-button" onClick={() => void decide(authorization, "DECLINE")}><X size={15} /> Decline</button>
                      <button disabled={!canAuthorize || busy !== null} className="secondary-button" onClick={() => void decide(authorization, "REQUEST_REVISION")}>Request revision</button>
                    </div>
                  ) : authorization ? <small className="decision-reason">{authorization.decisionReason}</small> : null}
                </article>
              );
            })}
          </div>

          {canEstimate ? (
            <form className="recon-estimate-form" onSubmit={(event) => {
              event.preventDefault();
              void mutate("create-recommendation", async () => {
                await api(`/api/inspections/${inspectionId}/recon/recommendations`, {
                  method: "POST",
                  body: JSON.stringify({ ...form, damageItemId: null, supportingPhotoIds: [] })
                }, actor);
                setForm((current) => ({ ...current, recommendedAction: "", estimatedCost: 0, notes: "" }));
              });
            }}>
              <h3>Add estimator recommendation</h3>
              <select value={form.serviceType} onChange={(event) => setForm((current) => ({ ...current, serviceType: event.target.value as ServiceType }))}>
                {serviceTypes.map((serviceType) => <option value={serviceType} key={serviceType}>{serviceType.replaceAll("_", " ")}</option>)}
              </select>
              <input required placeholder="Recommended action" value={form.recommendedAction} onChange={(event) => setForm((current) => ({ ...current, recommendedAction: event.target.value }))} />
              <input type="number" min="0" step="1" aria-label="Estimated cost" value={form.estimatedCost} onChange={(event) => setForm((current) => ({ ...current, estimatedCost: Number(event.target.value) }))} />
              <input type="number" min="0.1" step="0.25" aria-label="Estimated duration hours" value={form.estimatedDurationHours} onChange={(event) => setForm((current) => ({ ...current, estimatedDurationHours: Number(event.target.value) }))} />
              <input type="number" min="0" max="5" step="0.1" aria-label="Expected grade lift" value={form.expectedGradeLift} onChange={(event) => setForm((current) => ({ ...current, expectedGradeLift: Number(event.target.value) }))} />
              <input placeholder="Estimator notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              <button className="secondary-button" disabled={busy !== null}><Wrench size={15} /> Add recommendation</button>
            </form>
          ) : null}

          {canEstimate && record.recommendations.some((item) => item.status === "DRAFT" || item.status === "REAUTHORIZATION_REQUIRED") ? (
            <button className="primary-button submit-estimate-button" disabled={busy !== null} onClick={() => void mutate("submit-estimate", () => api(`/api/inspections/${inspectionId}/recon/submit`, {
              method: "POST",
              body: JSON.stringify({
                recommendationIds: record.recommendations
                  .filter((item) => item.status === "DRAFT" || item.status === "REAUTHORIZATION_REQUIRED")
                  .map((item) => item.id)
              })
            }, actor))}>
              <Send size={15} /> Submit estimate for policy decision
            </button>
          ) : null}
        </section>

        <section className="operations-panel">
          <div className="panel-header">
            <div><h2>Work orders and QC</h2><p>Only authorized items become executable shop work.</p></div>
            <span>{record.workOrders.length} order{record.workOrders.length === 1 ? "" : "s"}</span>
          </div>
          <div className="work-order-list">
            {record.workOrders.length === 0 ? <p className="empty-dock-state">No authorized work orders.</p> : record.workOrders.map((workOrder) => (
              <article className="work-order-card" key={workOrder.id}>
                <header>
                  <div><strong>{workOrder.workOrderNumber}</strong><span>{workOrder.serviceDepartment}</span></div>
                  <span className={`queue-status work-${workOrder.status.toLowerCase()}`}>{workOrder.status.replaceAll("_", " ")}</span>
                </header>
                <dl>
                  <div><dt>Authorized</dt><dd>{money(workOrder.authorizedAmount)}</dd></div>
                  <div><dt>Current estimate</dt><dd>{money(workOrder.currentEstimatedCost)}</dd></div>
                  <div><dt>Technician</dt><dd>{workOrder.assignedTechnician ?? "Unassigned"}</dd></div>
                  <div><dt>Deadline</dt><dd>{new Date(workOrder.saleDeadline).toLocaleString()}</dd></div>
                </dl>
                {workOrder.blockedReason ? <p className="work-order-blocker">{workOrder.blockedReason}</p> : null}
                <ul>
                  {workOrder.tasks.map((task) => <li key={task.id}><span>{task.description}</span><strong>{task.status.replaceAll("_", " ")}</strong></li>)}
                </ul>
                {canUpdateWork && workOrder.status !== "COMPLETED" ? (
                  <div className="work-order-change-form">
                    <label>
                      <span>Blocked reason</span>
                      <input
                        value={blockedReasons[workOrder.id] ?? ""}
                        onChange={(event) => setBlockedReasons((current) => ({ ...current, [workOrder.id]: event.target.value }))}
                        placeholder="Parts, scope, access, or authorization issue"
                      />
                    </label>
                    <label>
                      <span>Revised estimate</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={revisedEstimates[workOrder.id] ?? String(workOrder.currentEstimatedCost)}
                        onChange={(event) => setRevisedEstimates((current) => ({ ...current, [workOrder.id]: event.target.value }))}
                      />
                    </label>
                  </div>
                ) : null}
                <div className="work-order-actions">
                  {!workOrder.assignedTechnician ? <button disabled={!canUpdateWork || busy !== null} className="secondary-button" onClick={() => void updateWorkOrder(workOrder, "ASSIGN_TECHNICIAN")}>Assign to me</button> : null}
                  {(workOrder.status === "QUEUED" || workOrder.status === "BLOCKED") ? <button disabled={!canUpdateWork || busy !== null} className="primary-button" onClick={() => void updateWorkOrder(workOrder, "START")}><Clock3 size={15} /> Start work</button> : null}
                  {workOrder.status === "IN_PROGRESS" ? <button disabled={!canUpdateWork || busy !== null || !blockedReasons[workOrder.id]?.trim()} className="secondary-button" onClick={() => void updateWorkOrder(workOrder, "BLOCK")}>Block work</button> : null}
                  {workOrder.status !== "COMPLETED" ? <button disabled={!canUpdateWork || busy !== null || Number(revisedEstimates[workOrder.id] ?? workOrder.currentEstimatedCost) === workOrder.currentEstimatedCost} className="secondary-button" onClick={() => void updateWorkOrder(workOrder, "REVISE_ESTIMATE")}>Save revised estimate</button> : null}
                  {workOrder.status === "IN_PROGRESS" ? <button disabled={!canUpdateWork || busy !== null} className="primary-button" onClick={() => void updateWorkOrder(workOrder, "SEND_TO_QC")}><ShieldCheck size={15} /> Send to QC</button> : null}
                  {workOrder.status === "QC_REQUIRED" ? (
                    <>
                      <button disabled={!canQc || busy !== null} className="primary-button" onClick={() => void mutate(`qc-pass-${workOrder.id}`, () => api(`/api/work-orders/${workOrder.id}/quality-control`, {
                        method: "POST",
                        body: JSON.stringify({ decision: "PASS", notes: "Authorized work verified against task scope.", expectedVersion: workOrder.version })
                      }, actor))}><Check size={15} /> Pass QC</button>
                      <button disabled={!canQc || busy !== null} className="danger-button" onClick={() => void mutate(`qc-fail-${workOrder.id}`, () => api(`/api/work-orders/${workOrder.id}/quality-control`, {
                        method: "POST",
                        body: JSON.stringify({ decision: "FAIL", notes: "Work does not yet meet the authorized task scope.", expectedVersion: workOrder.version })
                      }, actor))}><X size={15} /> Fail QC</button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {canAssess ? (
            <button className="secondary-button readiness-action" disabled={busy !== null} onClick={() => void mutate("readiness", () => api(`/api/inspections/${inspectionId}/sale-readiness`, { method: "POST", body: "{}" }, actor))}>
              <ShieldCheck size={15} /> Recalculate sale readiness
            </button>
          ) : null}
        </section>
      </div>

      {pendingAuthorizations.length > 0 && canAuthorize ? (
        <div className="sticky-work-alert"><Clock3 size={16} /> {pendingAuthorizations.length} authorization decision{pendingAuthorizations.length === 1 ? "" : "s"} required before work can proceed.</div>
      ) : null}
    </section>
  );
}
