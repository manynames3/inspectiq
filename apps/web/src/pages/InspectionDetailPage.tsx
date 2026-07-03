import { AlertTriangle, ArrowDown, Bot, Check, ChevronLeft, ChevronRight, FileText, Filter, Flag, ImagePlus, Pencil, Play, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UserRound, X } from "lucide-react";
import { estimateDamageRepairCost, requiredPhotoAngles } from "@inspectiq/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, assetUrl } from "../api.js";
import { useActor } from "../App.js";
import { StatusPill } from "../components/StatusPill.js";
import { deriveMarketplaceReadiness } from "../marketplaceReadiness.js";
import type { Inspection, InspectionBundle, SampleImage, VehiclePhoto, VisionSuggestion } from "../types.js";

const requiredAngles = [...requiredPhotoAngles];
const editablePhotoAngles = [...requiredAngles, "unknown"];
const maxUploadBytes = 2_000_000;
const queuePageSize = 10;

type QueueTab = "my" | "review" | "all";

function isInReviewInspection(inspection: Inspection) {
  return inspection.status === "HUMAN_REVIEW_REQUIRED" || inspection.status === "AI_DRAFTED" || inspection.status === "AI_DRAFT_PENDING";
}

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

function queueInspectionCode(index: number) {
  return `INS-2025-${String(421 - index).padStart(5, "0")}`;
}

function formatQueueUpdated(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatSuggestionType(value: string) {
  return value.replaceAll("_", " ");
}

function formatSuggestionValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Pending";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  return String(value).replaceAll("_", " ");
}

function formatTitleValue(value: unknown) {
  return formatSuggestionValue(value).replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function suggestionValueRecord(suggestion: VisionSuggestion): Record<string, unknown> {
  return typeof suggestion.suggestedValueJson === "object" && suggestion.suggestedValueJson !== null
    ? suggestion.suggestedValueJson as Record<string, unknown>
    : {};
}

function repairEstimateForDamage(value: Record<string, unknown>) {
  const contractedEstimate = value.repairEstimateUsd as { min?: number; max?: number } | undefined;
  if (typeof contractedEstimate?.min === "number" && typeof contractedEstimate.max === "number") {
    if (contractedEstimate.min === 0 && contractedEstimate.max === 0) return "Estimator review";
    return `$${contractedEstimate.min.toLocaleString()} - $${contractedEstimate.max.toLocaleString()}`;
  }
  return estimateDamageRepairCost(String(value.damageType ?? "unknown"), String(value.severityEstimate ?? "unknown")).label;
}

type SuggestionFact = {
  label: string;
  value: string;
};

function suggestionFacts(suggestion: VisionSuggestion): SuggestionFact[] {
  const value = suggestionValueRecord(suggestion);
  if (suggestion.suggestionType === "damage_candidate") {
    return [
      ["Damage Type", formatTitleValue(value.damageType)],
      ["Severity", formatTitleValue(value.severityEstimate)],
      ["Estimated Cost", repairEstimateForDamage(value)]
    ].map(([label, rowValue]) => ({ label, value: rowValue }));
  }
  if (suggestion.suggestionType === "photo_angle") {
    return [
      { label: "Detected Angle", value: formatAngleLabel(formatSuggestionValue(value.photoAngle)) }
    ];
  }
  if (suggestion.suggestionType === "extracted_text") {
    const extracted = Object.entries(value)
      .filter(([, rowValue]) => rowValue !== null && rowValue !== undefined && rowValue !== "")
      .map(([key, rowValue]) => ({ label: formatAngleLabel(key), value: formatSuggestionValue(rowValue) }));
    return extracted.length > 0 ? extracted : [{ label: "Extracted Text", value: "No text found" }];
  }
  return Object.entries(value).slice(0, 4).map(([key, rowValue]) => ({ label: formatAngleLabel(key), value: formatSuggestionValue(rowValue) }));
}

function normalizePhotoAngleInput(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  return editablePhotoAngles.includes(normalized) ? normalized : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.type)) {
    return Promise.reject(new Error("Upload a JPEG, PNG, WebP, or SVG image."));
  }
  if (file.size > maxUploadBytes) {
    return Promise.reject(new Error("Upload an image under 2 MB for browser preview."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the selected image."));
    });
    reader.addEventListener("error", () => reject(new Error("Could not read the selected image.")));
    reader.readAsDataURL(file);
  });
}

function editSuggestionPayload(suggestion: VisionSuggestion): { suggestedValue: unknown; explanation?: string } | null {
  const value = suggestionValueRecord(suggestion);

  if (suggestion.suggestionType === "damage_candidate") {
    const nextLocation = window.prompt("Update damage location", String(value.location ?? ""));
    if (nextLocation === null) return null;
    const trimmed = nextLocation.trim();
    if (!trimmed) {
      window.alert("Damage location is required.");
      return null;
    }
    return {
      suggestedValue: { ...value, location: trimmed },
      explanation: "Reviewer updated the damage location before acceptance."
    };
  }

  if (suggestion.suggestionType === "photo_angle") {
    const nextAngle = window.prompt(
      "Update photo angle",
      formatAngleLabel(String(value.photoAngle ?? "unknown"))
    );
    if (nextAngle === null) return null;
    const normalized = normalizePhotoAngleInput(nextAngle);
    if (!normalized) {
      window.alert("Use front, rear, driver side, passenger side, interior, engine bay, odometer, VIN plate, or unknown.");
      return null;
    }
    return {
      suggestedValue: { ...value, photoAngle: normalized },
      explanation: "Reviewer updated the detected photo angle before acceptance."
    };
  }

  if (suggestion.suggestionType === "extracted_text") {
    const key = value.vin ? "vin" : "odometer";
    const label = key === "vin" ? "VIN" : "odometer";
    const nextText = window.prompt(`Update ${label}`, String(value[key] ?? ""));
    if (nextText === null) return null;
    const trimmed = nextText.trim();
    if (!trimmed) {
      window.alert(`${label.toUpperCase()} value is required.`);
      return null;
    }
    return {
      suggestedValue: { ...value, [key]: trimmed },
      explanation: `Reviewer updated the extracted ${label} before acceptance.`
    };
  }

  const nextNote = window.prompt("Update reviewer note", suggestion.explanation);
  if (nextNote === null) return null;
  return {
    suggestedValue: value,
    explanation: nextNote.trim() || suggestion.explanation
  };
}

function suggestionFocus(suggestion: VisionSuggestion) {
  const value = suggestionValueRecord(suggestion);
  if (suggestion.suggestionType === "damage_candidate") return formatTitleValue(value.location);
  if (suggestion.suggestionType === "photo_angle") return formatAngleLabel(formatSuggestionValue(value.photoAngle));
  if (suggestion.suggestionType === "extracted_text") {
    if (value.odometer) return "Odometer";
    if (value.vin) return "VIN";
    return "Extracted text";
  }
  if (suggestion.suggestionType === "quality_warning") return "Photo quality";
  return formatSuggestionType(suggestion.suggestionType);
}

function suggestionNote(suggestion: VisionSuggestion) {
  const value = suggestionValueRecord(suggestion);
  return typeof value.explanation === "string" && value.explanation.length > 0 ? value.explanation : suggestion.explanation;
}

function suggestionPriority(suggestion: VisionSuggestion) {
  if (suggestion.suggestionType === "damage_candidate") return 0;
  if (suggestion.suggestionType === "extracted_text") return 1;
  if (suggestion.suggestionType === "quality_warning") return 2;
  return 3;
}

export function InspectionDetailPage() {
  const { id } = useParams();
  const { actor, can } = useActor();
  const [bundle, setBundle] = useState<InspectionBundle | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [sampleImages, setSampleImages] = useState<SampleImage[]>([]);
  const [sampleKey, setSampleKey] = useState("complete-clean-set");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<QueueTab>("my");
  const [queuePage, setQueuePage] = useState(1);
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
      if (suggestion.suggestionType === "photo_angle" && suggestion.status === "accepted") {
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
  const photosById = useMemo(() => new Map((bundle?.photos ?? []).map((photo) => [photo.id, photo])), [bundle]);
  const inReviewInspections = useMemo(() => inspections.filter(isInReviewInspection), [inspections]);
  const queueCodeByInspectionId = useMemo(
    () => new Map(inspections.map((inspection, index) => [inspection.id, queueInspectionCode(index)])),
    [inspections]
  );
  const queueTabs = useMemo<Array<{ id: QueueTab; label: string; count: number }>>(() => [
    { id: "my", label: "My inspections", count: inspections.length },
    { id: "review", label: "In review", count: inReviewInspections.length },
    { id: "all", label: "All", count: inspections.length }
  ], [inspections.length, inReviewInspections.length]);
  const queuedInspections = useMemo(() => {
    if (queueTab === "review") return inReviewInspections;
    return inspections;
  }, [inReviewInspections, inspections, queueTab]);
  const queueTotalPages = Math.max(1, Math.ceil(queuedInspections.length / queuePageSize));
  const visibleQueuedInspections = useMemo(() => {
    const start = (queuePage - 1) * queuePageSize;
    return queuedInspections.slice(start, start + queuePageSize);
  }, [queuePage, queuedInspections]);
  const queuePageNumbers = useMemo(
    () => Array.from({ length: queueTotalPages }, (_, index) => index + 1),
    [queueTotalPages]
  );
  const queueRangeLabel = queuedInspections.length === 0
    ? "0 of 0"
    : `${((queuePage - 1) * queuePageSize) + 1}-${Math.min(queuePage * queuePageSize, queuedInspections.length)} of ${queuedInspections.length}`;

  useEffect(() => {
    setQueuePage(1);
  }, [queueTab]);

  useEffect(() => {
    setQueuePage((current) => Math.min(Math.max(current, 1), queueTotalPages));
  }, [queueTotalPages]);

  if (!bundle || !id) return <section className="page"><div className="loading">Loading inspection...</div></section>;

  const pendingSuggestions = bundle.suggestions
    .filter((suggestion) => suggestion.status === "pending" || suggestion.status === "edited")
    .slice()
    .sort((left, right) => suggestionPriority(left) - suggestionPriority(right));
  const workflowStep = bundle.inspection.status === "FINALIZED" ? 4 : bundle.inspection.status === "HUMAN_REVIEW_REQUIRED" || bundle.inspection.status === "AI_DRAFTED" ? 3 : bundle.conditionGrade ? 2 : 1;
  const capturedEvidencePercent = Math.round((requiredAngles.filter((angle) => capturedAngles.has(angle)).length / requiredAngles.length) * 100);
  const marketplaceReadiness = deriveMarketplaceReadiness(bundle);
  const canCaptureEvidence = can("photo:capture");
  const canAnalyzePhotos = can("photo:analyze");
  const canReviewSuggestions = can("suggestion:review");
  const canConfirmDamage = can("damage:create");
  const canGrade = can("grade:calculate");
  const canDraftReport = can("report:draft");
  const canEditReport = can("report:edit");
  const canFinalizeReport = can("report:finalize");
  const canAssignInspection = can("inspection:update");
  const captureDisabled = busy !== null || !canCaptureEvidence;
  const analysisDisabled = busy !== null || !canAnalyzePhotos;
  const reviewDisabled = busy !== null || !canReviewSuggestions;

  return (
    <section className="inspection-workspace">
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="concept-workbench">
        <aside className="inspection-list-panel">
          <div className="inspection-list-header">
            <h2>Inspections</h2>
            <button className="icon-button" aria-label="Filter inspections"><Filter size={16} /></button>
          </div>
          <div className="inspection-list-tools">
            <label className="inspection-search-field">
              <Search size={14} aria-hidden="true" />
              <input placeholder="Search inspections..." readOnly />
            </label>
            <button className="queue-options-button" aria-label="Inspection queue options"><SlidersHorizontal size={15} /></button>
          </div>
          <div className="inspection-tabs">
            {queueTabs.map((tab) => (
              <button key={tab.id} type="button" className={queueTab === tab.id ? "active" : ""} onClick={() => setQueueTab(tab.id)}>
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="inspection-table-head">
            <span>ID</span>
            <span>Vehicle</span>
            <span>Status</span>
            <span>Updated <ArrowDown size={11} /></span>
          </div>
          <div className="inspection-rows">
            {visibleQueuedInspections.length === 0 ? (
              <div className="inspection-empty-row">No inspections in this queue.</div>
            ) : visibleQueuedInspections.map((inspection) => (
              <Link key={inspection.id} to={`/inspections/${inspection.id}`} className={`inspection-row-link ${inspection.id === id ? "selected" : ""}`}>
                <span className="inspection-id-cell">
                  <strong>{queueCodeByInspectionId.get(inspection.id) ?? "INS-2025-00000"}</strong>
                  <small>VIN {inspection.vin}</small>
                </span>
                <span className="inspection-vehicle-cell">
                  <strong>{inspection.year} {inspection.make} {inspection.model}</strong>
                  <small>{inspection.trim || "Base"}</small>
                </span>
                <StatusPill status={inspection.status} />
                <time>{formatQueueUpdated(inspection.updatedAt)}</time>
              </Link>
            ))}
          </div>
          <div className="inspection-pagination">
            <span>{queueRangeLabel}</span>
            {queueTotalPages > 1 ? (
              <>
                <button type="button" aria-label="Previous page" disabled={queuePage === 1} onClick={() => setQueuePage((current) => Math.max(1, current - 1))}><ChevronLeft size={14} /></button>
                {queuePageNumbers.map((pageNumber) => (
                  <button key={pageNumber} type="button" className={queuePage === pageNumber ? "active" : ""} onClick={() => setQueuePage(pageNumber)}>
                    {pageNumber}
                  </button>
                ))}
                <button type="button" aria-label="Next page" disabled={queuePage === queueTotalPages} onClick={() => setQueuePage((current) => Math.min(queueTotalPages, current + 1))}><ChevronRight size={14} /></button>
              </>
            ) : null}
          </div>
        </aside>

        <main className="detail-stage">
          <div className="detail-titlebar">
            <div>
              <h1>{bundle.inspection.year} {bundle.inspection.make} {bundle.inspection.model}</h1>
              <p>Created {new Date(bundle.inspection.updatedAt).toLocaleString()} · Updated {new Date(bundle.inspection.updatedAt).toLocaleString()}</p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" disabled={!canReviewSuggestions}><Flag size={16} /> Flag</button>
              <button className="secondary-button" disabled={!canAssignInspection}><UserRound size={16} /> Assign</button>
              <StatusPill status={bundle.inspection.status} />
              <button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
            </div>
          </div>
          <div className="detail-readiness-header">
            <div className="marketplace-readiness-strip" aria-label="Marketplace readiness">
              <span className={marketplaceReadiness.crStatus === "CR ready" ? "ready" : "blocked"}>
                <strong>{marketplaceReadiness.crStatus}</strong>
                <small>Condition report</small>
              </span>
              <span className={marketplaceReadiness.vdpStatus === "VDP ready" ? "ready" : "watch"}>
                <strong>{marketplaceReadiness.vdpStatus}</strong>
                <small>Buyer VDP</small>
              </span>
              <span className={marketplaceReadiness.buyerVisibility === "Buyer-visible" ? "ready" : "watch"}>
                <strong>{marketplaceReadiness.buyerVisibility}</strong>
                <small>Disclosure</small>
              </span>
              <span>
                <strong>{marketplaceReadiness.reconditioningEstimate}</strong>
                <small>Recon estimate</small>
              </span>
              <span className={`risk-${marketplaceReadiness.arbitrationRisk.toLowerCase()}`}>
                <strong>{marketplaceReadiness.arbitrationRisk}</strong>
                <small>Arbitration risk</small>
              </span>
            </div>
            {marketplaceReadiness.blockers.length > 0 ? (
              <div className="readiness-blockers">
                <strong>Before buyer-visible release:</strong>
                <span>{marketplaceReadiness.blockers.slice(0, 3).join(" · ")}</span>
              </div>
            ) : null}
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
                <div className={`workflow-steps step-${workflowStep}`}>
                  {["Inspection", "AI Analysis", "Human Review", "Report"].map((label, index) => {
                    const stepNumber = index + 1;
                    const stepState = workflowStep > stepNumber ? "complete" : workflowStep === stepNumber ? "current" : "upcoming";
                    return (
                      <span key={label} className={`workflow-step ${stepState}`}>
                        <i>{stepNumber}</i>
                        <strong>{label}</strong>
                        <small>{stepState === "complete" ? "Completed" : stepState === "current" ? "In Progress" : "Pending"}</small>
                      </span>
                    );
                  })}
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
                        <span className="checklist-icon" aria-hidden="true">
                          {captured ? <Check size={10} /> : <X size={10} />}
                        </span>
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
                    ) : bundle.photos.map((photo) => {
                      const confidenceLabel = typeof photo.detectedAngleConfidence === "number" ? `${Math.round(photo.detectedAngleConfidence * 100)}%` : "Pending";
                      return (
                        <article className="photo-tile" key={photo.id}>
                          <img src={assetUrl(photo.storageKey)} alt={photo.originalFilename} />
                          <div>
                            <strong>{photoDisplayName(photo)}</strong>
                            <span className={`photo-confidence-badge ${confidenceLabel === "Pending" ? "pending" : ""}`} aria-label={`Detected angle confidence ${confidenceLabel}`}>
                              {confidenceLabel}
                            </span>
                            <span className="photo-file-name">{photo.originalFilename.replace(/\.[^.]+$/, "")}</span>
                            {photo.qualityStatus === "warning" ? <em><AlertTriangle size={13} /> warning</em> : null}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                </div>
              </div>

              <div className="sample-actions evidence-actions">
                <select value={sampleKey} onChange={(event) => setSampleKey(event.target.value)}>
                  <option value="complete-clean-set">Required photo set</option>
                  {sampleImages.map((sample) => <option key={sample.key} value={sample.key}>{sample.label}</option>)}
                </select>
                <button className="primary-button" disabled={captureDisabled} title={canCaptureEvidence ? undefined : "Inspector or Admin access required"} onClick={() => void runAction("sample", () => api(`/api/inspections/${id}/photos/sample`, { method: "POST", body: JSON.stringify({ sampleKey }) }, actor))}>
                  <ImagePlus size={16} /> Attach photo set
                </button>
                <label className={`file-button ${!canCaptureEvidence ? "disabled-control" : ""}`} title={canCaptureEvidence ? undefined : "Inspector or Admin access required"} aria-disabled={!canCaptureEvidence}>
                  <ImagePlus size={16} /> Upload photo
                  <input type="file" accept="image/*" disabled={!canCaptureEvidence || busy !== null} onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void runAction("upload", async () => {
                      const storageKey = await readFileAsDataUrl(file);
                      return api(`/api/inspections/${id}/photos/upload`, {
                        method: "POST",
                        body: JSON.stringify({ originalFilename: file.name, mimeType: file.type || "image/jpeg", storageKey })
                      }, actor);
                    });
                  }} />
                </label>
                <button className="secondary-button" disabled={analysisDisabled} title={canAnalyzePhotos ? undefined : "Inspector or Admin access required"} onClick={() => void runAction("analyze", async () => {
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
              <div className="dock-tabs"><strong>Condition grading</strong><span>Damage items</span></div>
              <div className="dock-body damage-dock-body">
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
                  <input disabled={!canConfirmDamage} value={damageForm.location} onChange={(event) => setDamageForm((current) => ({ ...current, location: event.target.value }))} />
                  <select disabled={!canConfirmDamage} value={damageForm.damageType} onChange={(event) => setDamageForm((current) => ({ ...current, damageType: event.target.value }))}>
                    {["scratch", "dent", "crack", "paint_damage", "glass_damage", "wheel_damage", "interior_wear", "unknown"].map((value) => <option key={value}>{value}</option>)}
                  </select>
                  <select disabled={!canConfirmDamage} value={damageForm.severity} onChange={(event) => setDamageForm((current) => ({ ...current, severity: event.target.value }))}>
                    {["minor", "moderate", "severe", "unknown"].map((value) => <option key={value}>{value}</option>)}
                  </select>
                  <button className="secondary-button" disabled={busy !== null || !canConfirmDamage} title={canConfirmDamage ? undefined : "Reviewer or Admin access required"} onClick={() => void runAction("damage", () => api(`/api/inspections/${id}/damage`, { method: "POST", body: JSON.stringify(damageForm) }, actor))}>
                    <Pencil size={16} /> Add
                  </button>
                </div>
              </div>
            </article>

            <article className="dock-panel report-panel">
              <div className="dock-tabs"><strong>Report draft</strong><span>Condition summary</span></div>
              <div className="dock-body report-dock-body">
                <div className="report-actions dock-actions">
                  <button className="secondary-button" disabled={busy !== null || !canGrade} title={canGrade ? undefined : "Reviewer or Admin access required"} onClick={() => void runAction("grade", () => api(`/api/inspections/${id}/grade`, { method: "POST", body: JSON.stringify({ idempotencyKey: `grade-${id}` }) }, actor))}>
                    <ShieldCheck size={16} /> Calculate grade
                  </button>
                  <button className="secondary-button" disabled={busy !== null || !canDraftReport} title={canDraftReport ? undefined : "Reviewer or Admin access required"} onClick={() => void runAction("report", () => api(`/api/inspections/${id}/ai-report`, { method: "POST", body: JSON.stringify({ idempotencyKey: `report-${id}` }) }, actor))}>
                    <Bot size={16} /> Draft report
                  </button>
                </div>
                <div className="grade-strip">
                  <strong>{bundle.conditionGrade ? `${bundle.conditionGrade.grade} · ${bundle.conditionGrade.score}` : "Grade not calculated"}</strong>
                  <span>{bundle.conditionGrade ? "Score based on evidence completeness, mileage, age, and confirmed damage." : "Condition score appears after grading."}</span>
                </div>
                {bundle.aiReportDraft ? (
                  <div className="ai-draft">
                    <h3>Draft summary</h3>
                    <p>{bundle.aiReportDraft.outputJson.summary}</p>
                    <small>Confidence {Math.round(bundle.aiReportDraft.confidence * 100)}% · human review {bundle.aiReportDraft.humanReviewRequired ? "required" : "optional"}</small>
                  </div>
                ) : null}
                <textarea value={reportBody} disabled={!canEditReport} onChange={(event) => setReportBody(event.target.value)} placeholder="Report draft appears here after generation." />
                <div className="report-actions">
                  <button className="secondary-button" disabled={!bundle.finalReport || !canEditReport} title={canEditReport ? undefined : "Reviewer or Admin access required"} onClick={() => bundle.finalReport && void runAction("save-report", () => api(`/api/reports/${bundle.finalReport!.id}`, { method: "PATCH", body: JSON.stringify({ reportBody }) }, actor))}>
                    <FileText size={16} /> Save report edits
                  </button>
                  <button className="primary-button" disabled={!bundle.finalReport || Boolean(bundle.finalReport.finalizedAt) || !canFinalizeReport} title={canFinalizeReport ? undefined : "Reviewer or Admin access required"} onClick={() => bundle.finalReport && void runAction("finalize", () => api(`/api/reports/${bundle.finalReport!.id}/finalize`, { method: "POST", body: JSON.stringify({}) }, actor))}>
                    <Check size={16} /> Finalize
                  </button>
                </div>
              </div>
            </article>

            <article className="dock-panel audit-panel">
              <div className="dock-tabs"><strong>Audit trail</strong><span>{bundle.auditEvents.length} events</span></div>
              <div className="dock-body audit-list">
                {bundle.auditEvents.map((event) => (
                  <div className="audit-row" key={event.id}>
                    <strong>{event.eventType}</strong>
                    <span>{event.actor}</span>
                    <time>{new Date(event.createdAt).toLocaleString()}</time>
                  </div>
                ))}
              </div>
            </article>
          </section>

        <aside className="review-column">
          <div className="review-heading">
            <strong>AI suggestion — requires human confirmation.</strong>
            {!canReviewSuggestions ? <span>Reviewer or Admin action required.</span> : null}
          </div>
          {pendingSuggestions.length === 0 ? <p className="empty-copy">Analyze photos to create reviewable suggestions.</p> : null}
          {pendingSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              photo={photosById.get(suggestion.photoId)}
              disabled={reviewDisabled}
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

function SuggestionCard({ suggestion, photo, disabled, onAccept, onReject, onEdit }: {
  suggestion: VisionSuggestion;
  photo?: VehiclePhoto;
  disabled: boolean;
  onAccept: () => Promise<unknown>;
  onReject: () => Promise<unknown>;
  onEdit: (value: { suggestedValue: unknown; explanation?: string }) => Promise<unknown>;
}) {
  const rows = suggestionFacts(suggestion);
  const confidencePercent = Math.round(suggestion.confidence * 100);
  return (
    <article className="suggestion-card">
      <div className="suggestion-context">
        <span>Focus: <strong>{suggestionFocus(suggestion)}</strong></span>
        <span className="model-chip">AI v1.3.2 <ChevronRight size={13} /></span>
      </div>
      {photo ? (
        <div className="suggestion-photo">
          <img src={assetUrl(photo.storageKey)} alt={photo.originalFilename} />
        </div>
      ) : null}
      <dl className="suggestion-facts">
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className="confidence-fact">
          <dt>Confidence</dt>
          <dd><ConfidenceMeter percent={confidencePercent} /></dd>
        </div>
        <div className="notes-fact">
          <dt>Notes</dt>
          <dd>{suggestionNote(suggestion)}</dd>
        </div>
      </dl>
      <div className="suggestion-actions">
        <button disabled={disabled} className="accept-button" onClick={() => void onAccept()}><Check size={15} /> Accept</button>
        <button disabled={disabled} className="reject-button" onClick={() => void onReject()}><X size={15} /> Reject</button>
        <button disabled={disabled} className="secondary-button edit-suggestion-button" onClick={() => {
          const payload = editSuggestionPayload(suggestion);
          if (payload) void onEdit(payload);
        }}><Pencil size={15} /> Edit</button>
      </div>
    </article>
  );
}

function ConfidenceMeter({ percent }: { percent: number }) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  return (
    <span className="confidence-meter" style={{ background: `conic-gradient(#0f766e ${clampedPercent * 3.6}deg, #e2e8f0 0deg)` }}>
      <span>{clampedPercent}%</span>
    </span>
  );
}
