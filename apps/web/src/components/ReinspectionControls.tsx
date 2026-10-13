import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError, createReinspection } from "../api.js";
import type { Actor, Inspection, ReinspectionRequest } from "../types.js";

type Props = {
  inspectionId: string;
  reportVersion: number;
  actor: Actor;
  authorized: boolean;
  historical?: boolean;
  onCreated: (inspection: Inspection) => void;
  onRefresh: () => Promise<void>;
};

function ReinspectionDialog({ inspectionId, reportVersion, actor, onCreated, onRefresh, onClose, open }: Omit<Props, "authorized" | "historical"> & { onClose: () => void; open: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [intent, setIntent] = useState<ReinspectionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    dialog.current?.showModal();
    reasonInput.current?.focus();
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      dialog.current?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !navigator.onLine || reason.trim().length < 10 || reason.trim().length > 1000) return;
    // Freeze the request after submission so a lost response can be retried safely.
    const request = intent ?? { reason: reason.trim(), operationId: crypto.randomUUID(), expectedReportVersion: reportVersion };
    setIntent(request);
    setBusy(true);
    setError(null);
    try {
      const result = await createReinspection(inspectionId, request, actor);
      onCreated(result.inspection);
      onClose();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 409 && failure.code === "VERSION_CONFLICT") {
        // Version rejection happens before creation; an unknown outcome must keep its operation ID.
        setIntent(null);
        try {
          await onRefresh();
          setError("The latest published version is loaded. Review it before creating a fresh reinspection request.");
        } catch (refreshFailure) {
          setError(`The source version changed and could not be refreshed. Refresh the inspection before retrying. ${refreshFailure instanceof Error ? refreshFailure.message : ""}`.trim());
        }
      } else {
        setError(failure instanceof Error ? failure.message : "Reinspection could not be created. Retry the same request.");
      }
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="reinspection-dialog" aria-labelledby="reinspection-title" aria-describedby="reinspection-boundary" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="reinspection-dialog-heading"><h2 id="reinspection-title">Start an audited reinspection</h2><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button></div>
    <p id="reinspection-boundary">Published report v{intent?.expectedReportVersion ?? reportVersion} stays unchanged. The replacement starts as a new draft with intake details only: no copied photos, findings, grades, approvals, recon authorization, or work orders. Fresh evidence and human review are required.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="reinspection-reason">Reason for reinspection</label>
      <textarea id="reinspection-reason" ref={reasonInput} value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} required readOnly={Boolean(intent)} disabled={busy} aria-describedby="reinspection-reason-guidance" rows={4} />
      <p id="reinspection-reason-guidance">10–1,000 characters. The reason and original report version become part of the audit history.{intent ? " This request is fixed; retrying uses the same operation ID and cannot create a duplicate." : ""}</p>
      {!online ? <p className="warning-banner" role="status">Connect to the internet before creating the replacement inspection.</p> : null}
      {error ? <p className="error-banner" role="alert">{error}</p> : null}
      <button type="submit" className="primary-button" disabled={busy || !online || reason.trim().length < 10 || reason.trim().length > 1000}>{busy ? "Creating reinspection…" : intent ? "Retry same reinspection" : "Create fresh inspection"}</button>
    </form>
  </dialog>;
}

export function ReinspectionControls(props: Props) {
  const [open, setOpen] = useState(false);
  const evaluation = props.actor.id.startsWith("evaluation-");
  const available = props.authorized && !evaluation && Number.isInteger(props.reportVersion) && props.reportVersion > 0;
  const guidance = evaluation
    ? "Sign in with an Inspector, Reviewer, or Admin account to start a reinspection. Evaluation access cannot change records."
    : !props.authorized
      ? "Inspector, Reviewer, or Admin access is required to start a reinspection."
      : "The published report remains immutable. A new inspection records the reason and source report version.";
  const action = <button type="button" className="secondary-button" disabled={!available} onClick={() => setOpen(true)}>Start audited reinspection</button>;
  return <>
    {props.historical ? <section className="historical-report-banner" aria-labelledby="historical-report-title">
      <span className="eyebrow">Historical publication · current-policy reinspection required</span>
      <h2 id="historical-report-title">Keep the original. Review fresh evidence.</h2>
      <p>This finalized report predates the current evidence-fingerprint checks. It is preserved as a historical artifact, not certified under today’s QC policy. A new reviewed inspection is required for a current-policy release.</p>
      <p>{guidance}</p>{available ? action : null}
    </section> : <>{action}{!available ? <small className="reinspection-guidance">{guidance}</small> : null}</>}
    {available ? <ReinspectionDialog {...props} open={open} onClose={() => setOpen(false)} /> : null}
  </>;
}

export function ReinspectionLineage({ inspection }: { inspection: Inspection }) {
  if (!inspection.reinspectionSourceInspectionId) return null;
  return <section className="reinspection-lineage" aria-label="Reinspection source and audit history">
    <span className="eyebrow">Fresh inspection · historical record preserved</span>
    <p><Link to={`/inspections/${encodeURIComponent(inspection.reinspectionSourceInspectionId)}`}>View original inspection{inspection.reinspectionSourceReportVersion ? ` · published report v${inspection.reinspectionSourceReportVersion}` : ""}</Link>. No prior evidence or approval is carried forward.</p>
    {inspection.reinspectionReason ? <p><strong>Recorded reason:</strong> {inspection.reinspectionReason}</p> : null}
  </section>;
}
