import { useRef, useState } from "react";
import { inspectorChecklistAreas, type ConditionQcAssessment, type ConditionQcIssue, type InspectorObservation } from "@inspectiq/shared";
import { api } from "../api.js";
import type { Actor, VehiclePhoto } from "../types.js";

export function ConditionQcPanel({ assessment, inspectionId, actor, photos, canRecord, canReview, locked, onChanged, onPhoto, onFinding }: {
  assessment: ConditionQcAssessment; inspectionId: string; actor: Actor; photos: VehiclePhoto[];
  canRecord: boolean; canReview: boolean; locked: boolean; onChanged: () => Promise<void>;
  onPhoto: (id: string) => void; onFinding: () => void;
}) {
  const [area, setArea] = useState<InspectorObservation["area"]>("exterior");
  const [outcome, setOutcome] = useState<InspectorObservation["outcome"]>("damage_observed");
  const [notes, setNotes] = useState("");
  const [photoId, setPhotoId] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef(crypto.randomUUID());
  const perform = async (path: string, body: unknown, success?: () => void) => {
    setBusy(true); setError(null);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) }, actor);
      success?.();
      await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed. Refresh before retrying."); }
    finally { setBusy(false); }
  };
  const review = (issue: ConditionQcIssue, decision: "reviewed" | "overridden") => perform(
    `/api/inspections/${inspectionId}/condition-qc/review`,
    { issueId: issue.id, fingerprint: issue.fingerprint, decision, reason: reasons[issue.id] ?? "" }
  );
  return <section className="condition-qc-panel" aria-label="Condition report quality control">
    <div className="panel-header"><h2>Condition report quality control</h2><strong>{assessment.openCount} open exception{assessment.openCount === 1 ? "" : "s"}</strong></div>
    <p>Review evidence, not model scores. Low certainty means review or recapture—not damage-free. Final publication always requires human approval.</p>
    <div className="condition-qc-identity">
      {(["vin", "odometer"] as const).map((field) => <div key={field}>
        <strong>{field === "vin" ? "VIN" : "Mileage"} · {assessment.identity[field].status.replaceAll("_", " ")}</strong>
        <small>Intake: {assessment.identity[field].expected} · image reading: {assessment.identity[field].observed ?? "not confirmed"}</small>
      </div>)}
    </div>
    {error ? <p role="alert" className="condition-qc-error">{error}</p> : null}
    {locked ? <p>Read-only record. Sign in with an authorized role to record notes or resolve exceptions; finalized records are locked.</p> : null}
    <div className="condition-qc-issues">
      {assessment.issues.map((issue) => <article key={issue.id} className={issue.status === "open" ? "qc-open" : "qc-resolved"}>
        <div><strong>{issue.title}</strong><small>{issue.objective ? "Evidence required" : "Reviewer decision"} · {issue.status}</small></div>
        <p>{issue.detail}</p><p>{issue.action}</p>
        <div className="condition-qc-actions">
          {issue.photoIds.map((id) => <button type="button" className="secondary-button" key={id} onClick={() => onPhoto(id)}>View {photos.find((p) => p.id === id)?.declaredAngle?.replaceAll("_", " ") ?? "evidence"}</button>)}
          {issue.suggestionId && issue.status === "open" ? <button type="button" className="secondary-button" onClick={onFinding}>Review finding</button> : null}
        </div>
        {issue.decision ? <p>Reviewed by {issue.decision.actor}: {issue.decision.reason}</p> : null}
        {issue.status === "open" && !issue.objective && !issue.suggestionId && canReview && !locked ? <div className="condition-qc-decision">
          <label>Review rationale (required)
            <textarea aria-label={`Rationale for ${issue.title}`} maxLength={1000} value={reasons[issue.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [issue.id]: e.target.value }))} />
          </label>
          <div className="condition-qc-actions">
            <button type="button" className="secondary-button" disabled={busy || (reasons[issue.id]?.trim().length ?? 0) < 10} onClick={() => void review(issue, "reviewed")}>Acknowledge limitation</button>
            <button type="button" className="secondary-button" disabled={busy || (reasons[issue.id]?.trim().length ?? 0) < 10} onClick={() => void review(issue, "overridden")}>Override judgment</button>
          </div><small>Acknowledgment/override preserves the limitation and reason; it never marks identity verified.</small>
        </div> : null}
      </article>)}
      {!assessment.issues.length ? <p>No QC exceptions identified. This is not an accuracy certification.</p> : null}
    </div>
    <h3>Inspector notes and checklist</h3>
    {assessment.observations.map((observation) => <p key={observation.id}><strong>{observation.area.replaceAll("_", " ")} · {observation.outcome.replaceAll("_", " ")}</strong>: {observation.notes} <small>— {observation.recordedBy}</small>{observation.photoId ? <button type="button" className="text-button" onClick={() => onPhoto(observation.photoId!)}>View evidence</button> : " (in-person; no linked photo)"}</p>)}
    <details className="condition-qc-draft"><summary>Automatic preliminary condition report</summary>
      <p>Updates from recorded evidence and notes, even before grading. Not approved for buyer release.</p>
      {assessment.draftSections?.map((section) => <article key={section.key}><h3>{section.title} · {section.status.replaceAll("_", " ").toLowerCase()}</h3>{section.observations.map((note, index) => <p key={index}>{note}</p>)}</article>)}
    </details>
    {canRecord && !locked ? <form className="condition-qc-note" onSubmit={(e) => {
      e.preventDefault();
      void perform(`/api/inspections/${inspectionId}/observations`, { area, outcome, notes, photoId: photoId || null, operationId: operationId.current }, () => { setNotes(""); operationId.current = crypto.randomUUID(); });
    }}>
      <label>Checklist area<select value={area} onChange={(e) => setArea(e.target.value as typeof area)}>{inspectorChecklistAreas.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
      <label>Observation<select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>{["damage_observed", "no_visible_damage", "unable_to_assess", "not_checked"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
      <label>Supporting photo<select value={photoId} onChange={(e) => setPhotoId(e.target.value)}><option value="">In-person observation — no photo</option>{photos.filter((p) => p.uploadStatus === "uploaded").map((p) => <option key={p.id} value={p.id}>{p.originalFilename}</option>)}</select></label>
      <label>Inspector note<textarea required aria-label="Inspector checklist note" value={notes} maxLength={800} onChange={(e) => setNotes(e.target.value)} placeholder="Describe what you observed and any limitations." /></label>
      <button className="primary-button" disabled={busy || !notes.trim()}>Save observation</button>
      <small>Notes enter the next draft with attribution. Damage observations without photos require QC acknowledgment.</small>
    </form> : null}
  </section>;
}
