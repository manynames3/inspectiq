import { AlertTriangle, Bot, Check, FileText, Flag, ImagePlus, Pencil, Play, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, assetUrl } from "../api.js";
import { useActor } from "../App.js";
import { StatusPill } from "../components/StatusPill.js";
import type { Inspection, InspectionBundle, SampleImage, VisionSuggestion } from "../types.js";

const requiredAngles = ["front", "rear", "driver_side", "passenger_side", "interior", "engine_bay", "odometer", "vin_plate"];

function formatAngleLabel(value: string | null | undefined) {
  if (!value) return "Angle pending";
  return value
    .replaceAll("-", "_")
    .split("_")
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "vin") return "VIN";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function photoDisplayName(photo: InspectionBundle["photos"][number]) {
  return formatAngleLabel(photo.detectedAngle ?? photo.declaredAngle ?? photo.originalFilename.replace(/\.[^.]+$/, ""));
}

export function InspectionDetailPage() {
  const { id } = useParams();
  const { actor } = useActor();
  const [bundle, setBundle] = useState<InspectionBundle | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [sampleImages, setSampleImages] = useState<SampleImage[]>([]);
  const [sampleKey, setSampleKey] = useState("complete-clean-set");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [damageForm, setDamageForm] = useState({
    location: "front bumper",
    damageType: "scratch",
    severity: "minor",
    notes: "Manual inspector note."
  });
  const [reportBody, setReportBody] = useState("");

  async function load() {
    if (!id) return;
    setError(null);
    const [nextBundle, nextInspections, health] = await Promise.all([
      api<InspectionBundle>(`/api/inspections/${id}`),
      api<Inspection[]>("/api/inspections"),
      api<{ sampleImages: SampleImage[] }>("/api/platform-health")
    ]);
    setBundle(nextBundle);
    setInspections(nextInspections);
    setReportBody(nextBundle.finalReport?.reportBody ?? "");
    setSampleImages(health.sampleImages);
  }

  async function runAction(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load inspection."));
  }, [id]);

  const confirmedAngles = useMemo(() => {
    const values = new Set<string>();
    for (const suggestion of bundle?.suggestions ?? []) {
      if (suggestion.suggestionType === "photo_angle" && (suggestion.status === "accepted" || suggestion.status === "edited")) {
        values.add(suggestion.suggestedValueJson.photoAngle);
      }
    }
    return values;
  }, [bundle]);
  const capturedAngles = useMemo(() => {
    const values = new Set<string>(confirmedAngles);
    for (const photo of bundle?.photos ?? []) {
      const angle = photo.detectedAngle ?? photo.declaredAngle;
      if (angle) values.add(angle);
    }
    for (const suggestion of bundle?.suggestions ?? []) {
      if (suggestion.suggestionType === "photo_angle") values.add(suggestion.suggestedValueJson.photoAngle);
    }
    return values;
  }, [bundle, confirmedAngles]);

  if (!bundle || !id) return <section className="page"><div className="loading">Loading inspection...</div></section>;

  const pendingSuggestions = bundle.suggestions.filter((suggestion) => suggestion.status === "pending" || suggestion.status === "edited");
  const workflowStep = bundle.inspection.status === "FINALIZED" ? 4 : bundle.inspection.status === "HUMAN_REVIEW_REQUIRED" || bundle.inspection.status === "AI_DRAFTED" ? 3 : bundle.conditionGrade ? 2 : 1;
  const capturedEvidencePercent = Math.round((requiredAngles.filter((angle) => capturedAngles.has(angle)).length / requiredAngles.length) * 100);

  return (
    <section className="inspection-workspace">
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="concept-workbench">
        <aside className="inspection-list-panel">
          <div className="inspection-list-header">
            <h2>Inspections</h2>
            <button className="icon-button" aria-label="Filter inspections"><Flag size={16} /></button>
          </div>
          <input className="inspection-search" placeholder="Search inspections..." readOnly />
          <div className="inspection-tabs">
            <span className="active">My inspections ({inspections.length})</span>
            <span>In review</span>
            <span>All</span>
          </div>
          <div className="inspection-rows">
            {inspections.map((inspection) => (
              <Link key={inspection.id} to={`/inspections/${inspection.id}`} className={`inspection-row-link ${inspection.id === id ? "selected" : ""}`}>
                <span>
                  <strong>{inspection.year} {inspection.make} {inspection.model}</strong>
                  <small>{inspection.vin}</small>
                </span>
                <StatusPill status={inspection.status} />
                <time>{new Date(inspection.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
              </Link>
            ))}
          </div>
        </aside>

        <main className="detail-stage">
          <div className="detail-titlebar">
            <div>
              <h1>{bundle.inspection.year} {bundle.inspection.make} {bundle.inspection.model}</h1>
              <p>Created {new Date(bundle.inspection.updatedAt).toLocaleString()} · Updated {new Date(bundle.inspection.updatedAt).toLocaleString()}</p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button"><Flag size={16} /> Flag</button>
              <button className="secondary-button"><UserRound size={16} /> Assign</button>
              <StatusPill status={bundle.inspection.status} />
              <button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
            </div>
          </div>

          <div className="detail-core-grid">
            <section className="vehicle-meta-panel">
              <dl>
                <div><dt>VIN</dt><dd>{bundle.inspection.vin}</dd></div>
                <div><dt>Year / Make / Model</dt><dd>{bundle.inspection.year} {bundle.inspection.make} {bundle.inspection.model}</dd></div>
                <div><dt>Trim</dt><dd>{bundle.inspection.trim || "Base"}</dd></div>
                <div><dt>Odometer</dt><dd>{bundle.inspection.mileage.toLocaleString()} mi</dd></div>
                <div><dt>Exterior color</dt><dd>{bundle.inspection.exteriorColor}</dd></div>
                <div><dt>Source</dt><dd>{bundle.inspection.sellerSource}</dd></div>
                <div><dt>Inspector</dt><dd>{bundle.inspection.inspectorName}</dd></div>
              </dl>
            </section>

            <section className="workflow-board">
              <div className="workflow-status">
                <h2>Workflow status</h2>
                <div className="workflow-steps">
                  {["Inspection", "AI Analysis", "Human Review", "Report"].map((label, index) => (
                    <span key={label} className={workflowStep >= index + 1 ? "active" : ""}>
                      <i>{index + 1}</i>
                      <strong>{label}</strong>
                      <small>{workflowStep > index + 1 ? "Completed" : workflowStep === index + 1 ? "In Progress" : "Pending"}</small>
                    </span>
                  ))}
                </div>
              </div>

              <div className="evidence-board">
                <div>
                  <div className="panel-header">
                    <h2>Required photo checklist</h2>
                    <strong>{capturedEvidencePercent}%</strong>
                  </div>
                  <div className="checklist compact-checklist">
                    {requiredAngles.map((angle) => {
                      const captured = capturedAngles.has(angle);
                      return (
                      <span key={angle} className={captured ? "complete" : "missing"}>
                        {captured ? <Check size={14} /> : <X size={14} />}
                        <strong>{formatAngleLabel(angle)}</strong>
                        <em>{captured ? "Captured" : "Missing"}</em>
                      </span>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="panel-header">
                    <h2>Uploaded images ({bundle.photos.length})</h2>
                    <span>Detected angle confidence</span>
                  </div>
                  <section className="photo-grid evidence-photos">
                    {bundle.photos.length === 0 ? (
                      <div className="empty-image-slot">
                        <ImagePlus size={20} />
                        <span>No images yet</span>
                      </div>
                    ) : bundle.photos.map((photo) => (
                      <article className="photo-tile" key={photo.id}>
                        <img src={assetUrl(photo.storageKey)} alt={photo.originalFilename} />
                        <div>
                          <strong>{photoDisplayName(photo)}</strong>
                          <span>{photo.originalFilename.replace(/\.[^.]+$/, "")}</span>
                          <span>{photo.detectedAngleConfidence ? `${Math.round(photo.detectedAngleConfidence * 100)}%` : "N/A"}</span>
                          {photo.qualityStatus === "warning" ? <em><AlertTriangle size={13} /> warning</em> : null}
                        </div>
                      </article>
                    ))}
                  </section>
                </div>
              </div>

              <div className="sample-actions evidence-actions">
                <select value={sampleKey} onChange={(event) => setSampleKey(event.target.value)}>
                  <option value="complete-clean-set">Complete sample set</option>
                  {sampleImages.map((sample) => <option key={sample.key} value={sample.key}>{sample.label}</option>)}
                </select>
                <button className="primary-button" disabled={busy !== null} onClick={() => void runAction("sample", () => api(`/api/inspections/${id}/photos/sample`, { method: "POST", body: JSON.stringify({ sampleKey }) }, actor))}>
                  <ImagePlus size={16} /> Attach sample
                </button>
                <label className="file-button">
                  <ImagePlus size={16} /> Upload metadata
                  <input type="file" accept="image/*" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void runAction("upload", () => api(`/api/inspections/${id}/photos/upload`, {
                      method: "POST",
                      body: JSON.stringify({ originalFilename: file.name, mimeType: file.type || "image/jpeg" })
                    }, actor));
                  }} />
                </label>
                <button className="secondary-button" disabled={busy !== null} onClick={() => void runAction("analyze", async () => {
                  for (const photo of bundle.photos) {
                    if (photo.analysisStatus !== "completed") {
                      await api(`/api/photos/${photo.id}/analyze`, { method: "POST", body: JSON.stringify({}) }, actor);
                    }
                  }
                })}>
                  <Play size={16} /> Analyze photos
                </button>
              </div>
            </section>
          </div>
        </main>

          <section className="bottom-dock">
            <article className="dock-panel">
              <div className="dock-tabs"><strong>Deterministic grading</strong><span>Damage items</span></div>
              <div className="panel-header">
                <h2>Damage items</h2>
                <span>{bundle.damageItems.length} confirmed</span>
              </div>
              <div className="damage-list compact-list">
                {bundle.damageItems.map((item) => (
                  <div key={item.id} className="damage-row">
                    <strong>{item.location}</strong>
                    <span>{item.severity} {item.damageType.replaceAll("_", " ")}</span>
                    <small>{item.source === "vision_suggestion" ? "AI-suggested, human-confirmed" : "Manual"}</small>
                  </div>
                ))}
              </div>
              <div className="damage-form">
                <input value={damageForm.location} onChange={(event) => setDamageForm((current) => ({ ...current, location: event.target.value }))} />
                <select value={damageForm.damageType} onChange={(event) => setDamageForm((current) => ({ ...current, damageType: event.target.value }))}>
                  {["scratch", "dent", "crack", "paint_damage", "glass_damage", "wheel_damage", "interior_wear", "unknown"].map((value) => <option key={value}>{value}</option>)}
                </select>
                <select value={damageForm.severity} onChange={(event) => setDamageForm((current) => ({ ...current, severity: event.target.value }))}>
                  {["minor", "moderate", "severe", "unknown"].map((value) => <option key={value}>{value}</option>)}
                </select>
                <button className="secondary-button" onClick={() => void runAction("damage", () => api(`/api/inspections/${id}/damage`, { method: "POST", body: JSON.stringify(damageForm) }, actor))}>
                  <Pencil size={16} /> Add
                </button>
              </div>
            </article>

            <article className="dock-panel report-panel">
              <div className="dock-tabs"><strong>AI report draft</strong><span>Condition summary</span></div>
              <div className="report-actions dock-actions">
                <button className="secondary-button" disabled={busy !== null} onClick={() => void runAction("grade", () => api(`/api/inspections/${id}/grade`, { method: "POST", body: JSON.stringify({ idempotencyKey: `grade-${id}` }) }, actor))}>
                  <ShieldCheck size={16} /> Run Java grade
                </button>
                <button className="secondary-button" disabled={busy !== null} onClick={() => void runAction("report", () => api(`/api/inspections/${id}/ai-report`, { method: "POST", body: JSON.stringify({ idempotencyKey: `report-${id}` }) }, actor))}>
                  <Bot size={16} /> Generate AI draft
                </button>
              </div>
              <div className="grade-strip">
                <strong>{bundle.conditionGrade ? `${bundle.conditionGrade.grade} · ${bundle.conditionGrade.score}` : "No grade yet"}</strong>
                <span>{bundle.conditionGrade?.gradingVersion ?? "Deterministic score generated by grading service"}</span>
              </div>
              {bundle.aiReportDraft ? (
                <div className="ai-draft">
                  <h3>AI draft output</h3>
                  <p>{bundle.aiReportDraft.outputJson.summary}</p>
                  <small>Confidence {Math.round(bundle.aiReportDraft.confidence * 100)}% · human review {bundle.aiReportDraft.humanReviewRequired ? "required" : "optional"}</small>
                </div>
              ) : null}
              <textarea value={reportBody} onChange={(event) => setReportBody(event.target.value)} placeholder="AI-assisted report draft appears here after generation." />
              <div className="report-actions">
                <button className="secondary-button" disabled={!bundle.finalReport} onClick={() => bundle.finalReport && void runAction("save-report", () => api(`/api/reports/${bundle.finalReport!.id}`, { method: "PATCH", body: JSON.stringify({ reportBody }) }, actor))}>
                  <FileText size={16} /> Save report edits
                </button>
                <button className="primary-button" disabled={!bundle.finalReport || Boolean(bundle.finalReport.finalizedAt)} onClick={() => bundle.finalReport && void runAction("finalize", () => api(`/api/reports/${bundle.finalReport!.id}/finalize`, { method: "POST", body: JSON.stringify({}) }, actor))}>
                  <Check size={16} /> Finalize
                </button>
              </div>
            </article>

            <article className="dock-panel audit-panel">
              <div className="dock-tabs"><strong>Audit trail</strong><span>{bundle.auditEvents.length} events</span></div>
              {bundle.auditEvents.map((event) => (
                <div className="audit-row" key={event.id}>
                  <strong>{event.eventType}</strong>
                  <span>{event.actor}</span>
                  <time>{new Date(event.createdAt).toLocaleString()}</time>
                </div>
              ))}
            </article>
          </section>

        <aside className="review-column">
          <div className="review-heading">
            <Bot size={18} />
            <strong>AI suggestion — requires human confirmation.</strong>
          </div>
          {pendingSuggestions.length === 0 ? <p className="empty-copy">Analyze photos to create reviewable suggestions.</p> : null}
          {pendingSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              disabled={busy !== null}
              onAccept={() => runAction("accept", () => api(`/api/vision-suggestions/${suggestion.id}/accept`, { method: "POST", body: JSON.stringify({}) }, actor))}
              onReject={() => runAction("reject", () => api(`/api/vision-suggestions/${suggestion.id}/reject`, { method: "POST", body: JSON.stringify({}) }, actor))}
              onEdit={(value) => runAction("edit", () => api(`/api/vision-suggestions/${suggestion.id}`, { method: "PATCH", body: JSON.stringify(value) }, actor))}
            />
          ))}
        </aside>
      </div>
    </section>
  );
}

function SuggestionCard({ suggestion, disabled, onAccept, onReject, onEdit }: {
  suggestion: VisionSuggestion;
  disabled: boolean;
  onAccept: () => Promise<unknown>;
  onReject: () => Promise<unknown>;
  onEdit: (value: { suggestedValue: unknown; explanation?: string }) => Promise<unknown>;
}) {
  const readableValue = JSON.stringify(suggestion.suggestedValueJson, null, 2);
  return (
    <article className="suggestion-card">
      <div>
        <strong>{suggestion.suggestionType.replaceAll("_", " ")}</strong>
        <span>{Math.round(suggestion.confidence * 100)}% confidence</span>
      </div>
      <pre>{readableValue}</pre>
      <p>{suggestion.explanation}</p>
      <div className="suggestion-actions">
        <button disabled={disabled} className="accept-button" onClick={() => void onAccept()}><Check size={15} /> Accept</button>
        <button disabled={disabled} className="secondary-button" onClick={() => {
          const next = window.prompt("Edit suggested JSON before accepting", readableValue);
          if (!next) return;
          try {
            void onEdit({ suggestedValue: JSON.parse(next), explanation: "Edited by reviewer before acceptance." });
          } catch {
            window.alert("Edited value must be valid JSON.");
          }
        }}><Pencil size={15} /> Edit</button>
        <button disabled={disabled} className="reject-button" onClick={() => void onReject()}><X size={15} /> Reject</button>
      </div>
    </article>
  );
}
