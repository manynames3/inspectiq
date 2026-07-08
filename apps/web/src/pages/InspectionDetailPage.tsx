import { AlertTriangle, ArrowDown, Bot, Check, ChevronLeft, ChevronRight, Download, FileText, Filter, Flag, ImagePlus, Pencil, Play, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UserRound, X } from "lucide-react";
import { estimateDamageRepairCost, maxImageUploadBytes, maxLocalPreviewUploadBytes, requiredPhotoAngles, supportedImageUploadMimeTypes } from "@inspectiq/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiUrl, assetUrl, requestHeaders } from "../api.js";
import { useActor } from "../App.js";
import { isEvaluationSession, storedLocalSession } from "../auth.js";
import { StatusPill } from "../components/StatusPill.js";
import { deriveMarketplaceReadiness, formatReportReadiness } from "../marketplaceReadiness.js";
import type { Inspection, InspectionBundle, SamplePhotoSet, VehiclePhoto, VisionSuggestion } from "../types.js";
import { inspectionNeedsWork, isReviewQueueInspection } from "../workflowMetrics.js";

const requiredAngles = [...requiredPhotoAngles];
const editablePhotoAngles = [...requiredAngles, "unknown"];
const supportedUploadMimeTypeSet = new Set<string>(supportedImageUploadMimeTypes);
const queuePageSize = 10;
const referenceEvidenceEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_REFERENCE_EVIDENCE === "true";

type QueueTab = "my" | "review" | "all";
type ConditionDockTab = "grading" | "damage";
type ReportDockTab = "draft" | "summary";

type GradeExplanationView = {
  deductions?: Array<{ reason?: string; points?: number }>;
  completionPenalty?: number;
  mileageAdjustment?: number;
  ageAdjustment?: number;
};

type ReportOutputView = {
  summary?: string;
  notableDefects?: string[];
  missingEvidence?: string[];
  recommendedDisclosure?: string;
  reasoningSummary?: string;
};

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

function matchesSamplePhotoSet(set: SamplePhotoSet, inspection: Inspection): boolean {
  return set.vehicle.year === inspection.year &&
    set.vehicle.make.toLowerCase() === inspection.make.toLowerCase() &&
    set.vehicle.model.toLowerCase() === inspection.model.toLowerCase() &&
    set.vehicle.trim.toLowerCase() === inspection.trim.toLowerCase();
}

function photoDisplayName(photo: InspectionBundle["photos"][number]) {
  return formatAngleLabel(photo.detectedAngle ?? photo.declaredAngle ?? photo.originalFilename.replace(/\.[^.]+$/, ""));
}

function photoSourceLabel(photo: Pick<VehiclePhoto, "objectBucket" | "storageKey" | "sourceName">) {
  if (photo.sourceName === "CarsDirect OEM photo gallery") return "Sourced vehicle image";
  if (photo.sourceName) return photo.sourceName;
  if (photo.objectBucket && photo.objectBucket !== "inspectiq-sample-images") return "Uploaded image";
  if (photo.objectBucket === "inspectiq-sample-images" || photo.storageKey.startsWith("/sample-images/")) return "Reference evidence";
  if (photo.storageKey.startsWith("data:")) return "Inline evidence";
  return "Evidence image";
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

function qualityValueRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function formatQualityScore(value: unknown) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Not scored";
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
  if (suggestion.suggestionType === "quality_warning") {
    const quality = qualityValueRecord(value.imageQuality);
    return [
      { label: "Quality Grade", value: formatTitleValue(quality.grade ?? "review") },
      { label: "Retake Required", value: quality.retakeRequired === true ? "Yes" : "No" },
      { label: "Action", value: quality.retakeRequired === true ? "Retake photo before release" : "Reviewer can accept if usable" },
      { label: "Blur Score", value: formatQualityScore(quality.blurScore) },
      { label: "Framing Score", value: formatQualityScore(quality.framingScore) }
    ];
  }
  return Object.entries(value).slice(0, 4).map(([key, rowValue]) => ({ label: formatAngleLabel(key), value: formatSuggestionValue(rowValue) }));
}

function conditionGradeExplanation(grade: InspectionBundle["conditionGrade"]): GradeExplanationView {
  if (!grade || typeof grade.explanationJson !== "object" || grade.explanationJson === null) return {};
  return grade.explanationJson as GradeExplanationView;
}

function conditionGradeDeductions(grade: InspectionBundle["conditionGrade"]) {
  const explanation = conditionGradeExplanation(grade);
  if (!Array.isArray(explanation.deductions)) return [];
  return explanation.deductions.filter((item): item is { reason: string; points: number } => (
    typeof item.reason === "string" && typeof item.points === "number"
  ));
}

function reportOutputView(draft: InspectionBundle["aiReportDraft"]): ReportOutputView {
  const output = draft?.outputJson;
  if (!output || typeof output !== "object") return {};
  return output as ReportOutputView;
}

function normalizePhotoAngleInput(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  return editablePhotoAngles.includes(normalized) ? normalized : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  if (!supportedUploadMimeTypeSet.has(file.type)) {
    return Promise.reject(new Error("Upload a JPEG, PNG, or WebP image."));
  }
  if (file.size > maxLocalPreviewUploadBytes) {
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

async function sha256Base64(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type UploadIntent = {
  objectBucket: string;
  objectKey: string;
  uploadUrl: string | null;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
};

function photoImageUrl(photo: VehiclePhoto): string {
  if (isDirectPreviewStorageKey(photo.storageKey)) return assetUrl(photo.storageKey);
  if (photo.objectBucket && photo.objectKey && photo.objectBucket !== "inspectiq-sample-images") {
    return apiUrl(`/api/photos/${photo.id}/image`);
  }
  return assetUrl(photo.storageKey);
}

function isDirectPreviewStorageKey(storageKey: string): boolean {
  return storageKey.startsWith("http://")
    || storageKey.startsWith("https://")
    || storageKey.startsWith("data:")
    || storageKey.startsWith("/sample-images/");
}

function needsAuthenticatedImageFetch(photo: VehiclePhoto): boolean {
  return Boolean(
    photo.objectBucket &&
    photo.objectKey &&
    photo.objectBucket !== "inspectiq-sample-images" &&
    !isDirectPreviewStorageKey(photo.storageKey)
  );
}

async function uploadInspectionPhoto(inspectionId: string, file: File, actor: ReturnType<typeof useActor>["actor"]) {
  if (!supportedUploadMimeTypeSet.has(file.type)) {
    throw new Error("Upload a JPEG, PNG, or WebP image.");
  }
  if (file.size > maxImageUploadBytes) {
    throw new Error("Upload an image under 25 MB.");
  }
  const checksumSha256 = await sha256Base64(file);
  const intent = await api<UploadIntent>("/api/uploads/intent", {
    method: "POST",
    body: JSON.stringify({
      inspectionId,
      originalFilename: file.name,
      mimeType: file.type || "image/jpeg",
      byteSize: file.size,
      checksumSha256
    })
  }, actor);
  if (intent.uploadUrl) {
    const putResponse = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.requiredHeaders,
      body: file
    });
    if (!putResponse.ok) throw new Error("Image upload to object storage failed.");
    return api(`/api/inspections/${inspectionId}/photos/upload`, {
      method: "POST",
      body: JSON.stringify({
        originalFilename: file.name,
        mimeType: file.type || "image/jpeg",
        objectBucket: intent.objectBucket,
        objectKey: intent.objectKey,
        storageKey: `/api/photos/object/${encodeURIComponent(intent.objectKey)}`,
        byteSize: file.size,
        checksumSha256
      })
    }, actor);
  }
  const storageKey = await readFileAsDataUrl(file);
  return api(`/api/inspections/${inspectionId}/photos/upload`, {
    method: "POST",
    body: JSON.stringify({ originalFilename: file.name, mimeType: file.type || "image/jpeg", storageKey })
  }, actor);
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

function formatJobStatus(value: string | null | undefined) {
  if (!value) return "Not queued";
  return value.replaceAll("_", " ");
}

type PhotoQualityStatus = "ready" | "retake" | "review" | "pending" | "failed";

function photoQualityScores(value: Record<string, unknown>) {
  return [
    typeof value.blurScore === "number" ? `Blur ${formatQualityScore(value.blurScore)}` : null,
    typeof value.exposureScore === "number" ? `Exposure ${formatQualityScore(value.exposureScore)}` : null,
    typeof value.framingScore === "number" ? `Framing ${formatQualityScore(value.framingScore)}` : null
  ].filter((item): item is string => Boolean(item));
}

function photoQualityView(
  photo: VehiclePhoto,
  qualitySuggestion: VisionSuggestion | undefined,
  jobStatus: string | null | undefined
): { status: PhotoQualityStatus; label: string; detail: string; scores: string[] } {
  const suggestionValue = qualitySuggestion ? suggestionValueRecord(qualitySuggestion) : {};
  const quality = qualityValueRecord(suggestionValue.imageQuality);
  const scores = photoQualityScores(quality);
  const terminalStatus = jobStatus ?? photo.analysisStatus;

  if (terminalStatus === "failed" || terminalStatus === "dead_letter") {
    return {
      status: "failed",
      label: "Retry analysis",
      detail: "Analysis failed before the photo could be trusted for release.",
      scores
    };
  }

  if (quality.retakeRequired === true) {
    return {
      status: "retake",
      label: "Retake",
      detail: formatTitleValue(suggestionValue.warning ?? "Image quality retake required"),
      scores
    };
  }

  if (qualitySuggestion && (qualitySuggestion.status === "pending" || qualitySuggestion.status === "edited")) {
    return {
      status: "review",
      label: "QA review",
      detail: formatTitleValue(suggestionValue.warning ?? "Reviewer should confirm image usability"),
      scores
    };
  }

  if (typeof photo.detectedAngleConfidence === "number" && photo.detectedAngleConfidence < 0.9) {
    return {
      status: "review",
      label: "Confirm angle",
      detail: `Detected angle confidence is ${Math.round(photo.detectedAngleConfidence * 100)}%.`,
      scores
    };
  }

  if (terminalStatus !== "completed") {
    return {
      status: "pending",
      label: "Analyze",
      detail: "Run image analysis to validate angle, quality, and extracted evidence.",
      scores
    };
  }

  return {
    status: "ready",
    label: "Usable",
    detail: "Image has usable analysis signals for reviewer release.",
    scores
  };
}

function ProtectedPhotoImage({ photo }: { photo: VehiclePhoto }) {
  const { actor } = useActor();
  const directUrl = photoImageUrl(photo);
  const [src, setSrc] = useState(() => needsAuthenticatedImageFetch(photo) ? "" : directUrl);

  useEffect(() => {
    if (!needsAuthenticatedImageFetch(photo)) {
      setSrc(directUrl);
      return undefined;
    }

    let cancelled = false;
    setSrc("");

    const evaluationPreview = isEvaluationSession(storedLocalSession());
    const headers = evaluationPreview ? undefined : requestHeaders(actor);
    if (headers) delete headers["content-type"];
    const previewUrl = evaluationPreview
      ? `${directUrl}?intent=preview&evaluation=readonly`
      : `${directUrl}?intent=preview`;

    fetch(previewUrl, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image preview unavailable.");
        const body = await response.json() as { data?: { imageUrl?: string } };
        if (!body.data?.imageUrl) throw new Error("Image preview URL unavailable.");
        return body.data.imageUrl;
      })
      .then((imageUrl) => {
        if (cancelled) return;
        setSrc(imageUrl.startsWith("/") ? assetUrl(imageUrl) : imageUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
    };
  }, [actor.id, actor.name, actor.role, directUrl, photo.id, photo.objectBucket, photo.objectKey]);

  if (!src) {
    return (
      <div className="image-preview-placeholder" aria-label={`${photo.originalFilename} preview loading`}>
        <ImagePlus size={18} />
      </div>
    );
  }

  return <img src={src} alt={photo.originalFilename} />;
}

async function downloadBuyerReport(reportId: string, actor: ReturnType<typeof useActor>["actor"]): Promise<void> {
  const response = await fetch(apiUrl(`/api/reports/${reportId}/export`), {
    headers: requestHeaders(actor)
  });
  if (!response.ok) throw new Error("Could not export the buyer-ready report.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "condition-report.txt";
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTerminalAnalysisStatus(status: string | null | undefined) {
  return status === "completed" || status === "failed" || status === "dead_letter";
}

async function waitForPhotoAnalysisCompletion(inspectionId: string, photoIds: string[], actor: ReturnType<typeof useActor>["actor"]) {
  if (photoIds.length === 0) return;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const nextBundle = await api<InspectionBundle>(`/api/inspections/${inspectionId}`, {}, actor);
    const relevantPhotos = nextBundle.photos.filter((photo) => photoIds.includes(photo.id));
    const allTerminal = relevantPhotos.length === photoIds.length
      && relevantPhotos.every((photo) => isTerminalAnalysisStatus(photo.analysisStatus));
    if (allTerminal) {
      const failed = relevantPhotos.find((photo) => photo.analysisStatus !== "completed");
      if (failed) throw new Error(`Image analysis failed for ${failed.originalFilename}.`);
      return;
    }
    await sleep(2_000);
  }
  throw new Error("Image analysis is still processing. Refresh the inspection in a moment.");
}

export function InspectionDetailPage() {
  const { id } = useParams();
  const { actor, can } = useActor();
  const [bundle, setBundle] = useState<InspectionBundle | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [samplePhotoSets, setSamplePhotoSets] = useState<SamplePhotoSet[]>([]);
  const [sampleKey, setSampleKey] = useState("vehicle-required-set");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<QueueTab>("my");
  const [queueSearch, setQueueSearch] = useState("");
  const [queueNeedsWorkOnly, setQueueNeedsWorkOnly] = useState(false);
  const [queuePage, setQueuePage] = useState(1);
  const [conditionDockTab, setConditionDockTab] = useState<ConditionDockTab>("grading");
  const [reportDockTab, setReportDockTab] = useState<ReportDockTab>("draft");
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [reviewRailCollapsed, setReviewRailCollapsed] = useState(false);
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
    const nextBundle = await api<InspectionBundle>(`/api/inspections/${id}`, {}, actor);
    setBundle(nextBundle);
    setReportBody(nextBundle.finalReport?.reportBody ?? "");

    const [nextInspections, health] = await Promise.allSettled([
      api<Inspection[]>("/api/inspections", {}, actor),
      api<{ samplePhotoSets?: SamplePhotoSet[] }>("/api/platform-health")
    ]);
    if (nextInspections.status === "fulfilled") {
      setInspections(nextInspections.value);
    } else {
      setInspections([nextBundle.inspection]);
    }
    if (health.status === "fulfilled") {
      setSamplePhotoSets(health.value.samplePhotoSets ?? []);
    }
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
  }, [id, actor]);

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
  const imageJobByPhotoId = useMemo(() => new Map((bundle?.imageAnalysisJobs ?? []).map((job) => [job.photoId, job])), [bundle]);
  const matchedSamplePhotoSet = useMemo(() => {
    if (!bundle) return null;
    return samplePhotoSets.find((set) => matchesSamplePhotoSet(set, bundle.inspection)) ?? null;
  }, [bundle, samplePhotoSets]);
  const inReviewInspections = useMemo(() => inspections.filter(isReviewQueueInspection), [inspections]);
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
    const base = queueTab === "review" ? inReviewInspections : inspections;
    const normalizedQuery = queueSearch.trim().toLowerCase();
    return base.filter((inspection) => {
      if (queueNeedsWorkOnly && !inspectionNeedsWork(inspection)) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        queueCodeByInspectionId.get(inspection.id) ?? "",
        inspection.vin,
        inspection.year,
        inspection.make,
        inspection.model,
        inspection.trim,
        inspection.status
      ].join(" ").toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [inReviewInspections, inspections, queueCodeByInspectionId, queueNeedsWorkOnly, queueSearch, queueTab]);
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
  }, [queueNeedsWorkOnly, queueSearch, queueTab]);

  useEffect(() => {
    setQueuePage((current) => Math.min(Math.max(current, 1), queueTotalPages));
  }, [queueTotalPages]);

  const analysisResultByPhotoId = useMemo(() => {
    const latest = new Map<string, NonNullable<InspectionBundle["photoAnalysisResults"]>[number]>();
    for (const analysis of bundle?.photoAnalysisResults ?? []) {
      if (!latest.has(analysis.photoId)) latest.set(analysis.photoId, analysis);
    }
    return latest;
  }, [bundle?.photoAnalysisResults]);

  if (!bundle || !id) return <section className="page"><div className="loading">Loading inspection...</div></section>;

  const pendingSuggestions = bundle.suggestions
    .filter((suggestion) => suggestion.status === "pending" || suggestion.status === "edited")
    .slice()
    .sort((left, right) => suggestionPriority(left) - suggestionPriority(right));
  const reviewedSuggestions = bundle.suggestions.filter((suggestion) => suggestion.status === "accepted" || suggestion.status === "rejected");
  const acceptedSuggestions = reviewedSuggestions.filter((suggestion) => suggestion.status === "accepted");
  const rejectedSuggestions = reviewedSuggestions.filter((suggestion) => suggestion.status === "rejected");
  const isFinalizedInspection = bundle.inspection.status === "FINALIZED";
  const workflowStep = bundle.inspection.status === "FINALIZED" ? 4 : bundle.inspection.status === "HUMAN_REVIEW_REQUIRED" || bundle.inspection.status === "AI_DRAFTED" ? 3 : bundle.conditionGrade ? 2 : 1;
  const capturedEvidencePercent = Math.round((requiredAngles.filter((angle) => capturedAngles.has(angle)).length / requiredAngles.length) * 100);
  const missingAngles = requiredAngles.filter((angle) => !capturedAngles.has(angle));
  const nextCaptureAngle = missingAngles[0] ?? null;
  const marketplaceReadiness = deriveMarketplaceReadiness(bundle);
  const reportReadiness = formatReportReadiness(marketplaceReadiness);
  const blockerIssues = (bundle.readinessIssues ?? []).filter((issue) => issue.severity === "blocker");
  const watchIssues = (bundle.readinessIssues ?? []).filter((issue) => issue.severity === "watch");
  const visibleReadinessIssues = [...blockerIssues, ...watchIssues].slice(0, 3);
  const gradeExplanation = conditionGradeExplanation(bundle.conditionGrade);
  const gradeDeductions = conditionGradeDeductions(bundle.conditionGrade);
  const reportOutput = reportOutputView(bundle.aiReportDraft);
  const reportSummary = reportOutput.summary
    ?? bundle.finalReport?.reportBody.split("\n").find((line) => line.trim().length > 0)?.replace(/^Summary:\s*/i, "")
    ?? "Draft the report to generate a reviewer-ready condition summary.";
  const notableDefects = reportOutput.notableDefects?.filter((item) => item.trim().length > 0).length
    ? reportOutput.notableDefects.filter((item) => item.trim().length > 0)
    : bundle.damageItems.length > 0
      ? bundle.damageItems.map((item) => `${formatTitleValue(item.severity)} ${item.damageType.replaceAll("_", " ")} at ${item.location}`)
      : ["No confirmed damage items recorded."];
  const missingEvidence = reportOutput.missingEvidence?.length
    ? reportOutput.missingEvidence
    : marketplaceReadiness.blockers.filter((blocker) => blocker.toLowerCase().includes("missing"));
  const canCaptureEvidence = can("photo:capture");
  const canAnalyzePhotos = can("photo:analyze");
  const canReviewSuggestions = can("suggestion:review");
  const canConfirmDamage = can("damage:create");
  const canGrade = can("grade:calculate");
  const canDraftReport = can("report:draft");
  const canEditReport = can("report:edit");
  const canFinalizeReport = can("report:finalize");
  const canAssignInspection = can("inspection:update");
  const isEvaluationWorkspace = actor.id.startsWith("evaluation-");
  const canRequestReportDraft = bundle.inspection.status === "GRADED" ||
    bundle.inspection.status === "REPORT_FAILED" ||
    bundle.inspection.status === "HUMAN_REVIEW_REQUIRED";
  const finalizedActionTitle = isFinalizedInspection ? "Finalized records require an admin correction workflow before changes." : undefined;
  const captureDisabled = busy !== null || isFinalizedInspection || !canCaptureEvidence;
  const sampleAttachDisabled = !referenceEvidenceEnabled || captureDisabled || !matchedSamplePhotoSet;
  const analysisDisabled = busy !== null || isFinalizedInspection || !canAnalyzePhotos;
  const reviewDisabled = busy !== null || isFinalizedInspection || !canReviewSuggestions;
  const damageDisabled = busy !== null || isFinalizedInspection || !canConfirmDamage;
  const gradeDisabled = busy !== null || isFinalizedInspection || !canGrade;
  const draftReportDisabled = busy !== null || isFinalizedInspection || !canDraftReport || !canRequestReportDraft;
  const editReportDisabled = isFinalizedInspection || !canEditReport;
  const finalizeReportDisabled = !bundle.finalReport || Boolean(bundle.finalReport.finalizedAt) || isFinalizedInspection || !canFinalizeReport;
  const draftReportButtonLabel = bundle.inspection.status === "REPORT_FAILED" ? "Retry draft" : "Draft report";
  const draftReportDisabledReason = isEvaluationWorkspace
    ? "Read-only review mode. Sign in with Cognito as Reviewer or Admin to draft or retry reports."
    : finalizedActionTitle
      ?? (!canDraftReport
        ? "Reviewer or Admin access required."
        : !canRequestReportDraft
          ? "Calculate the grade before requesting a report draft."
          : "");
  const qualitySuggestionsByPhotoId = new Map(
    bundle.suggestions
      .filter((suggestion) => suggestion.suggestionType === "quality_warning")
      .map((suggestion) => [suggestion.photoId, suggestion])
  );
  const photoQualityRows = bundle.photos.map((photo) => {
    const job = imageJobByPhotoId.get(photo.id);
    return {
      photo,
      view: photoQualityView(photo, qualitySuggestionsByPhotoId.get(photo.id), job?.status)
    };
  });
  const retakePhotoRows = photoQualityRows.filter((row) => row.view.status === "retake");
  const analysisIssueRows = photoQualityRows.filter((row) => row.view.status === "failed");
  const reviewPhotoRows = photoQualityRows.filter((row) => row.view.status === "review");
  const readyPhotoRows = photoQualityRows.filter((row) => row.view.status === "ready");
  const pendingAnalysisRows = photoQualityRows.filter((row) => row.view.status === "pending");
  const guidanceIssues = [
    ...retakePhotoRows,
    ...analysisIssueRows,
    ...reviewPhotoRows,
    ...missingAngles.map((angle) => ({
      photo: null,
      view: {
        status: "missing" as const,
        label: "Capture required angle",
        detail: `${formatAngleLabel(angle)} photo is still needed for the checklist.`,
        scores: []
      }
    }))
  ].slice(0, 4);
  const fieldGuidanceTone = retakePhotoRows.length > 0 || analysisIssueRows.length > 0
    ? "retake"
    : missingAngles.length > 0 || reviewPhotoRows.length > 0 || pendingAnalysisRows.length > 0
      ? "review"
      : "ready";
  const fieldGuidanceTitle = retakePhotoRows.length > 0
    ? `${retakePhotoRows.length} retake${retakePhotoRows.length === 1 ? "" : "s"} recommended`
    : analysisIssueRows.length > 0
      ? `${analysisIssueRows.length} image analysis issue${analysisIssueRows.length === 1 ? "" : "s"}`
      : missingAngles.length > 0
        ? `${missingAngles.length} required angle${missingAngles.length === 1 ? "" : "s"} missing`
        : reviewPhotoRows.length > 0
          ? `${reviewPhotoRows.length} photo${reviewPhotoRows.length === 1 ? "" : "s"} need QA review`
          : pendingAnalysisRows.length > 0
            ? `${pendingAnalysisRows.length} photo${pendingAnalysisRows.length === 1 ? "" : "s"} awaiting analysis`
            : "Evidence ready for review";
  const fieldGuidanceDetail = retakePhotoRows.length > 0
    ? "Retake guidance is based on image quality scores and reviewer-visible model findings."
    : missingAngles.length > 0
      ? "Capture missing checklist angles before buyer-visible condition release."
      : reviewPhotoRows.length > 0
        ? "Review lower-confidence images before final report and VDP publication."
        : pendingAnalysisRows.length > 0
          ? "Run image analysis to verify angle, damage, OCR, and quality signals."
          : "Required photos have usable analysis signals and no open retake blocker.";
  const reviewRailTitle = pendingSuggestions.length > 0
    ? "Reviewer confirmation required."
    : isFinalizedInspection
      ? "AI review complete."
      : bundle.photos.length === 0
        ? "AI review awaiting evidence."
        : pendingAnalysisRows.length > 0
          ? "Image analysis in progress."
          : reviewedSuggestions.length > 0
            ? "AI findings reviewed."
            : "No pending AI findings.";
  const reviewRailBody = pendingSuggestions.length > 0
    ? null
    : isFinalizedInspection
      ? "All AI findings have been resolved and the condition report is locked for buyer-facing release."
      : bundle.photos.length === 0
        ? "Capture required angles before running image analysis."
        : pendingAnalysisRows.length > 0
          ? "Queued image jobs are still processing. Refresh after completion to review findings."
          : reviewedSuggestions.length > 0
            ? "No open AI decisions remain for this inspection."
            : "Run analysis after capture to create reviewable findings.";
  const analyzedPhotoCount = bundle.photos.filter((photo) => photo.analysisStatus === "completed").length;
  const confirmedReviewItems = acceptedSuggestions.slice(0, 3).map((suggestion) => `${formatTitleValue(suggestionFocus(suggestion))} · ${formatSuggestionType(suggestion.suggestionType)}`);

  return (
    <section className="inspection-workspace">
      {error ? <div className="error-banner">{error}</div> : null}
      <div className={`concept-workbench ${queueCollapsed ? "queue-collapsed" : ""} ${reviewRailCollapsed ? "review-collapsed" : ""}`}>
        <aside className="inspection-list-panel">
          <div className="inspection-list-header">
            <h2>Inspections</h2>
            <button
              className={`icon-button ${queueNeedsWorkOnly ? "active" : ""}`}
              aria-label="Show inspections needing work"
              aria-pressed={queueNeedsWorkOnly}
              onClick={() => setQueueNeedsWorkOnly((current) => !current)}
              title="Show inspections needing work"
            >
              <Filter size={16} />
            </button>
          </div>
          <div className="inspection-list-tools">
            <label className="inspection-search-field">
              <Search size={14} aria-hidden="true" />
              <input
                placeholder="Search inspections..."
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
              />
            </label>
            <button
              className="queue-options-button"
              aria-label="Reset inspection filters"
              disabled={!queueSearch && !queueNeedsWorkOnly}
              onClick={() => {
                setQueueSearch("");
                setQueueNeedsWorkOnly(false);
              }}
              title="Reset inspection filters"
            >
              <SlidersHorizontal size={15} />
            </button>
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
              <p>VIN {bundle.inspection.vin} · {bundle.inspection.mileage.toLocaleString()} mi · {bundle.inspection.exteriorColor} · {bundle.inspection.trim || "Base"} · Updated {new Date(bundle.inspection.updatedAt).toLocaleString()}</p>
            </div>
            <div className="heading-actions">
              <button className={`secondary-button dense-toggle ${queueCollapsed ? "active" : ""}`} onClick={() => setQueueCollapsed((current) => !current)}>{queueCollapsed ? "Show queue" : "Hide queue"}</button>
              <button className={`secondary-button dense-toggle ${reviewRailCollapsed ? "active" : ""}`} onClick={() => setReviewRailCollapsed((current) => !current)}>{reviewRailCollapsed ? "Show AI" : "Hide AI"}</button>
              <button className="secondary-button" disabled={isFinalizedInspection || !canReviewSuggestions} title={finalizedActionTitle ?? (canReviewSuggestions ? undefined : "Reviewer or Admin access required")}><Flag size={16} /> Flag</button>
              <button className="secondary-button" disabled={isFinalizedInspection || !canAssignInspection} title={finalizedActionTitle ?? (canAssignInspection ? undefined : "Admin access required")}><UserRound size={16} /> Assign</button>
              <StatusPill status={bundle.inspection.status} />
              <button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
            </div>
          </div>
          <div className="detail-readiness-header">
            <div className="marketplace-readiness-strip" aria-label="Marketplace readiness">
              <span className={marketplaceReadiness.crStatus === "CR ready" ? "ready" : "blocked"}>
                <strong>{reportReadiness.label}</strong>
                <small>{reportReadiness.detail}</small>
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
            {visibleReadinessIssues.length > 0 ? (
              <div className="readiness-issue-summary">
                {visibleReadinessIssues.map((issue) => (
                  <article key={`${issue.type}-${issue.label}`} className={issue.severity}>
                    <strong>{issue.label}</strong>
                    <small>{issue.action}</small>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <div className="detail-core-grid">
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

              <div className={`field-capture-panel field-${fieldGuidanceTone}`}>
                <div className="field-capture-summary">
                  <span>Field capture guidance</span>
                  <strong>{fieldGuidanceTitle}</strong>
                  <small>{fieldGuidanceDetail}</small>
                </div>
                <div className="mobile-capture-next">
                  <span>Mobile/offsite capture</span>
                  <strong>{retakePhotoRows[0] ? `Retake ${photoDisplayName(retakePhotoRows[0].photo)}` : nextCaptureAngle ? `Capture ${formatAngleLabel(nextCaptureAngle)}` : "Checklist complete"}</strong>
                  <small>{retakePhotoRows[0] ? retakePhotoRows[0].view.detail : nextCaptureAngle ? "Center the vehicle, fill the frame, avoid glare, and keep the VIN/odometer legible when prompted." : "Proceed to analysis, reviewer decisions, and report release."}</small>
                </div>
                <div className="field-capture-metrics" aria-label="Image quality status">
                  <span><strong>{readyPhotoRows.length}</strong><small>Usable</small></span>
                  <span><strong>{retakePhotoRows.length}</strong><small>Retake</small></span>
                  <span><strong>{reviewPhotoRows.length}</strong><small>QA review</small></span>
                  <span><strong>{missingAngles.length}</strong><small>Missing</small></span>
                </div>
                {guidanceIssues.length > 0 ? (
                  <div className="field-capture-issues">
                    {guidanceIssues.map((row, index) => (
                      <span key={row.photo?.id ?? `${row.view.label}-${index}`} className={`quality-${row.view.status}`}>
                        <strong>{row.photo ? photoDisplayName(row.photo) : row.view.label}</strong>
                        <small>{row.view.detail}{row.view.scores.length > 0 ? ` · ${row.view.scores.join(" · ")}` : ""}</small>
                      </span>
                    ))}
                  </div>
                ) : null}
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
                    <span>Required-angle match</span>
                  </div>
                  <section className="photo-grid evidence-photos">
                    {bundle.photos.length === 0 ? (
                      <div className="empty-image-slot">
                        <ImagePlus size={20} />
                        <span>No images yet</span>
                      </div>
                    ) : bundle.photos.map((photo) => {
                      const confidenceLabel = typeof photo.detectedAngleConfidence === "number" ? `${Math.round(photo.detectedAngleConfidence * 100)}%` : "Pending";
                      const angleConfidenceLabel = confidenceLabel === "Pending" ? "Angle pending" : `Angle ${confidenceLabel}`;
                      const job = imageJobByPhotoId.get(photo.id);
                      const analysis = analysisResultByPhotoId.get(photo.id);
                      const providerLabel = analysis?.provider === "bedrockVisionProvider"
                        ? "Bedrock"
                        : analysis?.provider === "seededImportProvider"
                          ? "Imported"
                          : analysis?.provider ? "AI" : null;
                      const quality = photoQualityView(photo, qualitySuggestionsByPhotoId.get(photo.id), job?.status);
                      return (
                        <article className={`photo-tile quality-${quality.status}`} key={photo.id}>
                          <ProtectedPhotoImage photo={photo} />
                          <div title={`${photo.originalFilename} · ${quality.detail}`}>
                            <strong>{photoDisplayName(photo)}</strong>
                            <span className={`photo-confidence-badge ${confidenceLabel === "Pending" ? "pending" : ""}`} aria-label={`Required-angle match confidence ${confidenceLabel}`}>
                              {angleConfidenceLabel}
                            </span>
                            <span className="photo-file-name">{quality.label}</span>
                            {photo.sourceUrl ? (
                              <a className="photo-source-chip" href={photo.sourceUrl} target="_blank" rel="noreferrer">{photoSourceLabel(photo)}</a>
                            ) : (
                              <span className="photo-source-chip">{photoSourceLabel(photo)}</span>
                            )}
                            <span className={`analysis-job-chip job-${job?.status ?? photo.analysisStatus}`}>
                              Analysis {formatJobStatus(job?.status ?? photo.analysisStatus)}
                            </span>
                            {providerLabel ? (
                              <span className={`analysis-provider-chip ${providerLabel === "Bedrock" ? "provider-bedrock" : "provider-imported"}`}>
                                {providerLabel}
                              </span>
                            ) : null}
                            <span className={`photo-quality-chip quality-${quality.status}`}>
                              {quality.status === "ready" ? <Check size={12} /> : <AlertTriangle size={12} />}
                              {quality.label}
                            </span>
                            <em>{quality.detail}{quality.scores.length > 0 ? ` · ${quality.scores.join(" · ")}` : ""}</em>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                </div>
              </div>

              <div className="sample-actions evidence-actions">
                {isFinalizedInspection ? (
                  <span className="finalized-lock-note"><ShieldCheck size={15} /> Finalized record: evidence is locked for buyer-facing release.</span>
                ) : referenceEvidenceEnabled ? (
                  <>
                    <select value={sampleKey} onChange={(event) => setSampleKey(event.target.value)} disabled={!matchedSamplePhotoSet}>
                      <option value="vehicle-required-set">
                        {matchedSamplePhotoSet?.label ?? "No model-matched reference set"}
                      </option>
                    </select>
                    <button
                      className="primary-button"
                      disabled={sampleAttachDisabled}
                      title={!canCaptureEvidence ? "Inspector or Admin access required" : matchedSamplePhotoSet ? undefined : "Upload captured photos for vehicles without a matched reference set."}
                      onClick={() => void runAction("sample", () => api(`/api/inspections/${id}/photos/sample`, { method: "POST", body: JSON.stringify({ sampleKey }) }, actor))}
                    >
                      <ImagePlus size={16} /> Load reference set
                    </button>
                  </>
                ) : null}
                {!isFinalizedInspection ? (
                <label className={`file-button ${!canCaptureEvidence ? "disabled-control" : ""}`} title={canCaptureEvidence ? undefined : "Inspector or Admin access required"} aria-disabled={!canCaptureEvidence}>
                  <ImagePlus size={16} /> Upload photo
                  <input type="file" accept="image/*" disabled={!canCaptureEvidence || busy !== null} onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void runAction("upload", async () => {
                      return uploadInspectionPhoto(id, file, actor);
                    });
                  }} />
                </label>
                ) : null}
                {!isFinalizedInspection ? <button className="secondary-button" disabled={analysisDisabled} title={finalizedActionTitle ?? (canAnalyzePhotos ? undefined : "Inspector or Admin access required")} onClick={() => void runAction("analyze", async () => {
                  const photosToAnalyze = bundle.photos.filter((photo) => photo.analysisStatus !== "completed");
                  const forceCompletedEvidence = photosToAnalyze.length === 0 && bundle.photos.length > 0;
                  const targetPhotos = forceCompletedEvidence ? bundle.photos : photosToAnalyze;
                  await api(`/api/inspections/${id}/photos/analyze`, { method: "POST", body: JSON.stringify({ idempotencyKeyPrefix: `analysis-${id}`, force: forceCompletedEvidence }) }, actor);
                  await waitForPhotoAnalysisCompletion(id, targetPhotos.map((photo) => photo.id), actor);
                })}>
                  <Play size={16} /> Analyze photos
                </button> : null}
              </div>
            </section>
          </div>
        </main>

          <section className="bottom-dock">
            <article className="dock-panel">
              <div className="dock-tabs" role="tablist" aria-label="Condition review">
                <button type="button" role="tab" aria-selected={conditionDockTab === "grading"} className={conditionDockTab === "grading" ? "active" : ""} onClick={() => setConditionDockTab("grading")}>Condition grading</button>
                <button type="button" role="tab" aria-selected={conditionDockTab === "damage"} className={conditionDockTab === "damage" ? "active" : ""} onClick={() => setConditionDockTab("damage")}>Damage items</button>
              </div>
              {conditionDockTab === "grading" ? (
                <div className="dock-body grading-dock-body">
                  <div className="panel-header">
                    <h2>Condition grading</h2>
                    <span>{bundle.conditionGrade ? `${bundle.conditionGrade.grade} grade` : "Not calculated"}</span>
                  </div>
                  <div className="grade-result-card">
                    <strong>{bundle.conditionGrade ? `${bundle.conditionGrade.score}/100` : "Grade pending"}</strong>
                    <span>{bundle.conditionGrade ? "Deterministic score based on required evidence, mileage, age, and confirmed damage." : "Calculate the grade after required photo evidence is confirmed."}</span>
                  </div>
                  <div className="grading-stat-grid">
                    <span><strong>{capturedEvidencePercent}%</strong><small>Evidence complete</small></span>
                    <span><strong>{bundle.damageItems.length}</strong><small>Confirmed damage</small></span>
                    <span><strong>{marketplaceReadiness.reconditioningEstimate}</strong><small>Recon estimate</small></span>
                    <span><strong>{reportReadiness.label}</strong><small>{reportReadiness.detail}</small></span>
                  </div>
                  <div className="grade-detail-list compact-list">
                    {gradeDeductions.length > 0 ? gradeDeductions.map((deduction) => (
                      <span key={`${deduction.reason}-${deduction.points}`}>
                        <strong>{deduction.reason}</strong>
                        <small>-{deduction.points} pts</small>
                      </span>
                    )) : <p className="empty-dock-state">No damage deductions recorded.</p>}
                    {bundle.conditionGrade ? (
                      <>
                        <span><strong>Evidence completion penalty</strong><small>-{gradeExplanation.completionPenalty ?? 0} pts</small></span>
                        <span><strong>Mileage adjustment</strong><small>-{gradeExplanation.mileageAdjustment ?? 0} pts</small></span>
                        <span><strong>Age adjustment</strong><small>-{gradeExplanation.ageAdjustment ?? 0} pts</small></span>
                      </>
                    ) : null}
                  </div>
                  <div className="dock-actions">
                    <button className="secondary-button" disabled={gradeDisabled} title={finalizedActionTitle ?? (canGrade ? undefined : "Reviewer or Admin access required")} onClick={() => void runAction("grade", () => api(`/api/inspections/${id}/grade`, { method: "POST", body: JSON.stringify({ idempotencyKey: `grade-${id}` }) }, actor))}>
                      <ShieldCheck size={16} /> Calculate grade
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dock-body damage-dock-body">
                  <div className="panel-header">
                    <h2>Damage items</h2>
                    <span>{bundle.damageItems.length} confirmed</span>
                  </div>
                  <div className="damage-list compact-list">
                    {bundle.damageItems.length > 0 ? bundle.damageItems.map((item) => (
                      <div key={item.id} className="damage-row">
                        <strong>{item.location}</strong>
                        <span>{item.severity} {item.damageType.replaceAll("_", " ")}</span>
                        <small>{item.source === "vision_suggestion" ? "AI-suggested, human-confirmed" : "Manual"}</small>
                      </div>
                    )) : <p className="empty-dock-state">No confirmed damage items.</p>}
                  </div>
                  <div className="damage-form">
                    <input disabled={damageDisabled} value={damageForm.location} onChange={(event) => setDamageForm((current) => ({ ...current, location: event.target.value }))} />
                    <select disabled={damageDisabled} value={damageForm.damageType} onChange={(event) => setDamageForm((current) => ({ ...current, damageType: event.target.value }))}>
                      {["scratch", "dent", "crack", "paint_damage", "glass_damage", "wheel_damage", "interior_wear", "unknown"].map((value) => <option key={value}>{value}</option>)}
                    </select>
                    <select disabled={damageDisabled} value={damageForm.severity} onChange={(event) => setDamageForm((current) => ({ ...current, severity: event.target.value }))}>
                      {["minor", "moderate", "severe", "unknown"].map((value) => <option key={value}>{value}</option>)}
                    </select>
                    <button className="secondary-button" disabled={damageDisabled} title={finalizedActionTitle ?? (canConfirmDamage ? undefined : "Reviewer or Admin access required")} onClick={() => void runAction("damage", () => api(`/api/inspections/${id}/damage`, { method: "POST", body: JSON.stringify(damageForm) }, actor))}>
                      <Pencil size={16} /> Add
                    </button>
                  </div>
                </div>
              )}
            </article>

            <article className="dock-panel report-panel">
              <div className="dock-tabs" role="tablist" aria-label="Report review">
                <button type="button" role="tab" aria-selected={reportDockTab === "draft"} className={reportDockTab === "draft" ? "active" : ""} onClick={() => setReportDockTab("draft")}>Report draft</button>
                <button type="button" role="tab" aria-selected={reportDockTab === "summary"} className={reportDockTab === "summary" ? "active" : ""} onClick={() => setReportDockTab("summary")}>Condition summary</button>
              </div>
              {reportDockTab === "draft" ? (
                <div className="dock-body report-dock-body">
                  <div className="report-actions dock-actions">
                    <button className="secondary-button" disabled={draftReportDisabled} title={draftReportDisabledReason || undefined} onClick={() => void runAction("report", () => api(`/api/inspections/${id}/ai-report`, { method: "POST", body: JSON.stringify({ idempotencyKey: `report-${id}` }) }, actor))}>
                      <Bot size={16} /> {draftReportButtonLabel}
                    </button>
                  </div>
                  {draftReportDisabledReason ? <p className="action-help-text">{draftReportDisabledReason}</p> : null}
                  {bundle.inspection.status === "REPORT_FAILED" ? (
                    <div className="status-explanation status-explanation-warning">
                      <strong>Draft generation failed</strong>
                      <span>The condition grade is saved. Retry the report draft after sign-in, or review the audit trail for the failed provider job.</span>
                    </div>
                  ) : null}
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
                  <textarea value={reportBody} disabled={editReportDisabled} onChange={(event) => setReportBody(event.target.value)} placeholder="Generate a report draft to review buyer-ready language." />
                  <div className="report-actions">
                    <button className="secondary-button" disabled={!bundle.finalReport || editReportDisabled} title={finalizedActionTitle ?? (canEditReport ? undefined : "Reviewer or Admin access required")} onClick={() => bundle.finalReport && void runAction("save-report", () => api(`/api/reports/${bundle.finalReport!.id}`, { method: "PATCH", body: JSON.stringify({ reportBody }) }, actor))}>
                      <FileText size={16} /> Save report edits
                    </button>
                    <button className="secondary-button" disabled={!bundle.finalReport} onClick={() => bundle.finalReport && void runAction("export-report", () => downloadBuyerReport(bundle.finalReport!.id, actor))}>
                      <Download size={16} /> Export buyer report
                    </button>
                    <button className="primary-button" disabled={finalizeReportDisabled} title={finalizedActionTitle ?? (canFinalizeReport ? undefined : "Reviewer or Admin access required")} onClick={() => bundle.finalReport && void runAction("finalize", () => api(`/api/reports/${bundle.finalReport!.id}/finalize`, { method: "POST", body: JSON.stringify({}) }, actor))}>
                      <Check size={16} /> Finalize
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dock-body summary-dock-body">
                  <div className="panel-header">
                    <h2>Condition summary</h2>
                    <span>{bundle.finalReport?.finalizedAt ? "Finalized" : bundle.finalReport ? "Draft ready" : "Needs draft"}</span>
                  </div>
                  <div className="summary-section summary-primary">
                    <strong>Condition Summary</strong>
                    <p>{reportSummary}</p>
                  </div>
                  {(bundle.identityVerifications?.length ?? 0) > 0 ? (
                    <div className="summary-section">
                      <strong>Verified Vehicle Data</strong>
                      <ul className="summary-list">
                        {bundle.identityVerifications?.map((item) => (
                          <li key={item.id}>{item.field === "vin" ? "VIN" : "Odometer"}: {item.field === "odometer" ? `${Number(item.value.replace(/[^0-9]/g, "") || item.value).toLocaleString()} mi` : item.value}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="summary-section">
                    <strong>Notable Items</strong>
                    {notableDefects.length > 0 ? (
                      <ul className="summary-list">
                        {notableDefects.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : <p>No notable items recorded.</p>}
                  </div>
                  <div className="summary-section">
                    <strong>Release Notes</strong>
                    <p>{reportOutput.recommendedDisclosure ?? (missingEvidence.length > 0 ? missingEvidence.join(" ") : "Evidence is complete. Reviewer can finalize once the draft is approved.")}</p>
                  </div>
                </div>
              )}
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
            <strong>{reviewRailTitle}</strong>
            {!canReviewSuggestions && !isFinalizedInspection ? <span>Reviewer or Admin action required.</span> : null}
          </div>
          {pendingSuggestions.length === 0 ? (
            <div className={`review-empty-state ${isFinalizedInspection ? "complete" : ""}`}>
              <p>{reviewRailBody}</p>
              <dl className="review-summary-grid">
                <div>
                  <dt>Accepted</dt>
                  <dd>{acceptedSuggestions.length}</dd>
                </div>
                <div>
                  <dt>Rejected</dt>
                  <dd>{rejectedSuggestions.length}</dd>
                </div>
                <div>
                  <dt>Analyzed</dt>
                  <dd>{analyzedPhotoCount}/{bundle.photos.length}</dd>
                </div>
              </dl>
              {confirmedReviewItems.length > 0 ? (
                <div className="review-confirmed-list">
                  <strong>Confirmed findings</strong>
                  {confirmedReviewItems.map((item) => <span key={item}>{item}</span>)}
                </div>
              ) : null}
            </div>
          ) : null}
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
          <ProtectedPhotoImage photo={photo} />
        </div>
      ) : null}
      {photo ? <span className="suggestion-source-line">{photoSourceLabel(photo)} · {photo.originalFilename}</span> : null}
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
