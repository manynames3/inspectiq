#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const requiredAngles = [
  "front",
  "rear",
  "driver_side",
  "passenger_side",
  "interior",
  "engine_bay",
  "odometer",
  "vin_plate"
];

const imageExtensionPattern = /\.(jpe?g|png|webp)$/i;

function usage() {
  return `
Live uploaded-photo proof

Required:
  LIVE_ID_TOKEN=...                         Cognito/OIDC JWT with Inspector or Admin permissions
  LIVE_REVIEWER_TOKEN=...                   Optional; Cognito/OIDC JWT with Reviewer or Admin permissions
                                             If omitted, LIVE_ID_TOKEN must also review suggestions and reports.
  LIVE_PHOTO_DIR=/absolute/path/to/photos   Directory with one JPEG/PNG/WebP per required angle

Photo filename angle tokens:
  front, rear, driver, passenger, interior, engine, odometer, vin

Optional:
  LIVE_API_BASE_URL=https://...             Defaults to terraform output api_endpoint when available
  LIVE_TEST_VIN=...                         Defaults to a generated VIN-like test value
  LIVE_VEHICLE_YEAR=2024
  LIVE_VEHICLE_MAKE=Hyundai
  LIVE_VEHICLE_MODEL=Tucson
  LIVE_VEHICLE_TRIM=SEL
  LIVE_VEHICLE_MILEAGE=14250
  LIVE_VEHICLE_COLOR=Gray
  LIVE_REQUIRE_BEDROCK=false                Allow non-Bedrock provider for nonproduction validation
  LIVE_REQUIRE_OBJECT_STORAGE=false         Allow inline/local upload mode for nonproduction validation
  LIVE_REQUIRE_SEPARATE_ROLES=true          Require Inspector capture token and Reviewer review token
  LIVE_ANALYSIS_TIMEOUT_MS=300000

Example:
  LIVE_API_BASE_URL=https://imml0cczh7.execute-api.us-east-1.amazonaws.com \\
  LIVE_ID_TOKEN="$INSPECTIQ_INSPECTOR_JWT" \\
  LIVE_REVIEWER_TOKEN="$INSPECTIQ_REVIEWER_JWT" \\
  LIVE_PHOTO_DIR=/Users/aiden/Pictures/inspectiq-live-set \\
  npm run test:live-upload
`;
}

function terraformOutput(name) {
  try {
    return execFileSync("terraform", ["-chdir=infra/terraform", "output", "-raw", name], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function cleanBaseUrl(value) {
  return value?.trim().replace(/\/+$/, "") || null;
}

function cleanToken(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^Bearer\s+/i, "");
}

function generateVin(vehicle = {}) {
  const make = String(vehicle.make ?? "").toLowerCase();
  const model = String(vehicle.model ?? "").toLowerCase();
  const prefix = make.includes("ford") && model.includes("escape")
    ? "1FMCU9H6"
    : make.includes("toyota") && model.includes("camry")
      ? "4T1G11AK"
      : "5NMJF3DE";
  const suffix = Date.now().toString(36).toUpperCase().replace(/[IOQ]/g, "X").slice(-9);
  return `${prefix}${suffix}`.padEnd(17, "0").slice(0, 17);
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function angleFromFilename(filePath) {
  const name = path.basename(filePath).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/\bvin\b|\bvin plate\b|\bvinplate\b/.test(name)) return "vin_plate";
  if (/\bodometer\b|\bmileage\b|\bodo\b/.test(name)) return "odometer";
  if (/\bengine\b|\bengine bay\b|\benginebay\b|\bunder hood\b/.test(name)) return "engine_bay";
  if (/\bdriver\b|\bleft side\b|\bleft\b/.test(name)) return "driver_side";
  if (/\bpassenger\b|\bright side\b|\bright\b/.test(name)) return "passenger_side";
  if (/\binterior\b|\bcabin\b|\bdashboard\b|\bdash\b/.test(name)) return "interior";
  if (/\brear\b|\bback\b/.test(name)) return "rear";
  if (/\bfront\b|\bgrille\b|\bnose\b/.test(name)) return "front";
  return null;
}

async function collectPhotoSet(photoDir) {
  const entries = await readdir(photoDir);
  const byAngle = new Map();
  const ignored = [];

  for (const entry of entries.sort()) {
    const filePath = path.join(photoDir, entry);
    const info = await stat(filePath);
    if (!info.isFile() || !imageExtensionPattern.test(entry)) continue;
    const angle = angleFromFilename(entry);
    if (!angle) {
      ignored.push(entry);
      continue;
    }
    if (!byAngle.has(angle)) {
      byAngle.set(angle, {
        angle,
        filePath,
        originalFilename: entry,
        byteSize: info.size,
        mimeType: mimeTypeFor(entry)
      });
    }
  }

  const missing = requiredAngles.filter((angle) => !byAngle.has(angle));
  if (missing.length > 0) {
    throw new Error(`LIVE_PHOTO_DIR is missing required angle file(s): ${missing.join(", ")}. Ignored files: ${ignored.join(", ") || "none"}`);
  }
  return requiredAngles.map((angle) => byAngle.get(angle));
}

async function readPhotoSetMetadata(photoDir) {
  try {
    const raw = await readFile(path.join(photoDir, "metadata.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function api(baseUrl, route, options = {}) {
  const { token, method = "GET", body, expectedStatuses } = options;
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const expected = expectedStatuses ?? [200, 201, 202];
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${route} returned ${response.status}: ${text}`);
  }
  return parsed?.data ?? parsed;
}

function assertPermission(session, permission, label) {
  if (session?.permissions?.includes(permission)) return;
  throw new Error(`${label} token lacks ${permission}. Current role: ${session?.actor?.role ?? "unknown"}.`);
}

async function uploadPhoto(baseUrl, token, inspectionId, photo) {
  const bytes = await readFile(photo.filePath);
  const checksumSha256 = createHash("sha256").update(bytes).digest("base64");
  const intent = await api(baseUrl, "/api/uploads/intent", {
    token,
    method: "POST",
    body: {
      inspectionId,
      originalFilename: photo.originalFilename,
      mimeType: photo.mimeType,
      byteSize: photo.byteSize,
      checksumSha256
    }
  });

  if (intent.uploadUrl) {
    const putResponse = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.requiredHeaders,
      body: bytes
    });
    if (!putResponse.ok) {
      const text = await putResponse.text();
      throw new Error(`PUT ${intent.objectKey} returned ${putResponse.status}: ${text}`);
    }
    return api(baseUrl, `/api/inspections/${inspectionId}/photos/upload`, {
      token,
      method: "POST",
      body: {
        originalFilename: photo.originalFilename,
        mimeType: photo.mimeType,
        declaredAngle: photo.angle,
        objectBucket: intent.objectBucket,
        objectKey: intent.objectKey,
        storageKey: `/api/photos/object/${encodeURIComponent(intent.objectKey)}`,
        byteSize: photo.byteSize,
        checksumSha256,
        sourceName: "Live uploaded photo set"
      }
    });
  }

  const dataUrl = `data:${photo.mimeType};base64,${bytes.toString("base64")}`;
  return api(baseUrl, `/api/inspections/${inspectionId}/photos/upload`, {
    token,
    method: "POST",
    body: {
      originalFilename: photo.originalFilename,
      mimeType: photo.mimeType,
      declaredAngle: photo.angle,
      storageKey: dataUrl,
      byteSize: photo.byteSize,
      checksumSha256,
      sourceName: "Live uploaded photo set"
    }
  });
}

async function waitForAnalysis(baseUrl, token, inspectionId, expectedPhotoCount) {
  const timeoutMs = Number(process.env.LIVE_ANALYSIS_TIMEOUT_MS ?? "300000");
  const intervalMs = 5000;
  const startedAt = Date.now();
  let lastBundle = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastBundle = await api(baseUrl, `/api/inspections/${inspectionId}`, { token });
    const jobs = lastBundle.imageAnalysisJobs ?? [];
    const terminal = jobs.filter((job) => ["completed", "failed", "dead_letter"].includes(job.status));
    if (jobs.length >= expectedPhotoCount && terminal.length >= expectedPhotoCount) {
      const failed = jobs.filter((job) => job.status === "failed" || job.status === "dead_letter");
      if (failed.length > 0) {
        throw new Error(`Image analysis finished with failed job(s): ${failed.map((job) => `${job.id}:${job.errorMessage ?? job.status}`).join(", ")}`);
      }
      return lastBundle;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const jobSummary = (lastBundle?.imageAnalysisJobs ?? []).map((job) => `${job.id}:${job.status}`).join(", ") || "none";
  throw new Error(`Timed out waiting for image analysis. Jobs: ${jobSummary}`);
}

function suggestionValue(suggestion) {
  return suggestion?.suggestedValueJson && typeof suggestion.suggestedValueJson === "object"
    ? suggestion.suggestedValueJson
    : {};
}

async function reviewSuggestions(baseUrl, reviewerToken, bundle, declaredAnglesByPhotoId) {
  let reviewed = 0;
  let editedAngles = 0;

  for (const suggestion of bundle.suggestions ?? []) {
    if (suggestion.status !== "pending" && suggestion.status !== "edited") continue;

    if (suggestion.suggestionType === "photo_angle") {
      const expectedAngle = declaredAnglesByPhotoId.get(suggestion.photoId);
      const currentAngle = suggestionValue(suggestion).photoAngle;
      if (expectedAngle && currentAngle !== expectedAngle) {
        await api(baseUrl, `/api/vision-suggestions/${suggestion.id}`, {
          token: reviewerToken,
          method: "PATCH",
          body: {
            suggestedValue: { photoAngle: expectedAngle },
            explanation: "Reviewer corrected the photo angle from live capture metadata before acceptance."
          }
        });
        editedAngles += 1;
      }
    }

    await api(baseUrl, `/api/vision-suggestions/${suggestion.id}/accept`, {
      token: reviewerToken,
      method: "POST",
      body: {}
    });
    reviewed += 1;
  }

  return { reviewed, editedAngles };
}

async function findInspectionByVin(baseUrl, token, vin) {
  const inspections = await api(baseUrl, "/api/inspections", { token });
  return inspections.find((inspection) => String(inspection.vin).toUpperCase() === vin.toUpperCase()) ?? null;
}

function auditEventTypes(bundle) {
  return new Set((bundle.auditEvents ?? []).map((event) => event.eventType));
}

function analysisProviders(bundle) {
  return [...new Set((bundle.auditEvents ?? [])
    .filter((event) => event.eventType === "photo.analyzed")
    .map((event) => event.detailsJson?.provider)
    .filter(Boolean))];
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage().trim());
    return;
  }

  const baseUrl = cleanBaseUrl(process.env.LIVE_API_BASE_URL)
    ?? cleanBaseUrl(process.env.E2E_API_BASE_URL)
    ?? cleanBaseUrl(terraformOutput("api_endpoint"));
  if (!baseUrl) throw new Error(`LIVE_API_BASE_URL is required.\n\n${usage()}`);

  const captureToken = cleanToken(process.env.LIVE_ID_TOKEN ?? process.env.LIVE_INSPECTOR_TOKEN);
  const reviewerToken = cleanToken(process.env.LIVE_REVIEWER_TOKEN) ?? captureToken;
  if (!captureToken) throw new Error(`LIVE_ID_TOKEN is required.\n\n${usage()}`);

  const photoDir = process.env.LIVE_PHOTO_DIR?.trim();
  if (!photoDir) throw new Error(`LIVE_PHOTO_DIR is required.\n\n${usage()}`);
  const resolvedPhotoDir = path.resolve(photoDir);
  const photos = await collectPhotoSet(resolvedPhotoDir);
  const photoSetMetadata = await readPhotoSetMetadata(resolvedPhotoDir);
  const vehicleMetadata = photoSetMetadata?.vehicle ?? {};

  const captureSession = await api(baseUrl, "/api/auth/session", { token: captureToken });
  const reviewSession = reviewerToken === captureToken
    ? captureSession
    : await api(baseUrl, "/api/auth/session", { token: reviewerToken });
  assertPermission(captureSession, "inspection:create", "Capture");
  assertPermission(captureSession, "photo:capture", "Capture");
  assertPermission(captureSession, "photo:analyze", "Capture");
  assertPermission(reviewSession, "suggestion:review", "Reviewer");
  assertPermission(reviewSession, "grade:calculate", "Reviewer");
  assertPermission(reviewSession, "report:draft", "Reviewer");
  assertPermission(reviewSession, "report:finalize", "Reviewer");
  if (process.env.LIVE_REQUIRE_SEPARATE_ROLES === "true") {
    if (captureToken === reviewerToken) {
      throw new Error("LIVE_REQUIRE_SEPARATE_ROLES=true requires distinct LIVE_ID_TOKEN and LIVE_REVIEWER_TOKEN values.");
    }
    if (captureSession.actor.role !== "inspector") {
      throw new Error(`LIVE_REQUIRE_SEPARATE_ROLES=true expected capture role inspector, got ${captureSession.actor.role}.`);
    }
    if (reviewSession.actor.role !== "reviewer") {
      throw new Error(`LIVE_REQUIRE_SEPARATE_ROLES=true expected reviewer role reviewer, got ${reviewSession.actor.role}.`);
    }
  }

  const sourceVin = typeof vehicleMetadata.vin === "string" ? vehicleMetadata.vin : null;
  const vin = (
    process.env.LIVE_TEST_VIN?.trim()
    || (process.env.LIVE_USE_SOURCE_VIN === "true" ? sourceVin : null)
    || generateVin(vehicleMetadata)
  ).toUpperCase();
  const existingInspection = await findInspectionByVin(baseUrl, captureToken, vin);
  if (existingInspection && process.env.LIVE_ALLOW_DUPLICATE_VIN !== "true") {
    throw new Error(`Inspection VIN ${vin} already exists (${existingInspection.id}). Set LIVE_TEST_VIN to a fresh value or LIVE_ALLOW_DUPLICATE_VIN=true if this duplicate is intentional.`);
  }
  const inspection = await api(baseUrl, "/api/inspections", {
    token: captureToken,
    method: "POST",
    body: {
      vin,
      year: Number(process.env.LIVE_VEHICLE_YEAR ?? vehicleMetadata.year ?? "2024"),
      make: process.env.LIVE_VEHICLE_MAKE ?? vehicleMetadata.make ?? "Hyundai",
      model: process.env.LIVE_VEHICLE_MODEL ?? vehicleMetadata.model ?? "Tucson",
      trim: process.env.LIVE_VEHICLE_TRIM ?? vehicleMetadata.trim ?? "SEL",
      mileage: Number(process.env.LIVE_VEHICLE_MILEAGE ?? vehicleMetadata.mileage ?? "14250"),
      exteriorColor: process.env.LIVE_VEHICLE_COLOR ?? vehicleMetadata.exteriorColor ?? "Gray",
      sellerSource: "Live uploaded evidence verification",
      inspectorName: captureSession.actor.name
    }
  });

  const uploaded = [];
  const declaredAnglesByPhotoId = new Map();
  for (const photo of photos) {
    const saved = await uploadPhoto(baseUrl, captureToken, inspection.id, photo);
    uploaded.push(saved);
    declaredAnglesByPhotoId.set(saved.id, photo.angle);
  }

  await api(baseUrl, `/api/inspections/${inspection.id}/photos/analyze`, {
    token: captureToken,
    method: "POST",
    body: { idempotencyKeyPrefix: `live-proof-${inspection.id}` },
    expectedStatuses: [200, 202]
  });

  let bundle = await waitForAnalysis(baseUrl, captureToken, inspection.id, photos.length);
  const reviewResult = await reviewSuggestions(baseUrl, reviewerToken, bundle, declaredAnglesByPhotoId);
  bundle = await api(baseUrl, `/api/inspections/${inspection.id}`, { token: reviewerToken });

  const missingAngles = (bundle.readinessIssues ?? []).filter((issue) => issue.type === "missing_required_angle");
  if (missingAngles.length > 0) {
    throw new Error(`Required evidence is still missing after review: ${missingAngles.map((issue) => issue.label).join(", ")}`);
  }

  const grade = await api(baseUrl, `/api/inspections/${inspection.id}/grade`, {
    token: reviewerToken,
    method: "POST",
    body: { idempotencyKey: `live-grade-${inspection.id}` }
  });

  const reportResponse = await api(baseUrl, `/api/inspections/${inspection.id}/ai-report`, {
    token: reviewerToken,
    method: "POST",
    body: { idempotencyKey: `live-report-${inspection.id}` }
  });
  if (!reportResponse.finalReport?.id) throw new Error("Report draft did not create a final report record.");

  await api(baseUrl, `/api/reports/${reportResponse.finalReport.id}/finalize`, {
    token: reviewerToken,
    method: "POST",
    body: {}
  });

  bundle = await api(baseUrl, `/api/inspections/${inspection.id}`, { token: reviewerToken });
  const providerNames = analysisProviders(bundle);
  const requireBedrock = process.env.LIVE_REQUIRE_BEDROCK !== "false";
  if (requireBedrock && !providerNames.some((provider) => /bedrock/i.test(String(provider)))) {
    throw new Error(`Expected Bedrock image analysis provider, got: ${providerNames.join(", ") || "none"}. Set LIVE_REQUIRE_BEDROCK=false for local-only validation.`);
  }

  const requireObjectStorage = process.env.LIVE_REQUIRE_OBJECT_STORAGE !== "false";
  if (requireObjectStorage) {
    const inline = bundle.photos.filter((photo) => !photo.objectBucket || photo.objectBucket === "inspectiq-sample-images");
    if (inline.length > 0) {
      throw new Error(`Expected S3/object-storage photos, but found inline/sample photo(s): ${inline.map((photo) => photo.originalFilename).join(", ")}`);
    }
    for (const photo of bundle.photos) {
      const preview = await api(baseUrl, `/api/photos/${photo.id}/image?intent=preview`, { token: reviewerToken });
      if (preview.source !== "object-storage") {
        throw new Error(`Expected object-storage preview for ${photo.originalFilename}, got ${preview.source}.`);
      }
    }
  }

  const events = auditEventTypes(bundle);
  for (const requiredEvent of ["inspection.created", "photo.uploaded", "image_analysis.queued", "photo.analyzed", "suggestion.accepted", "condition.grade_generated", "ai_report.generated", "report.finalized"]) {
    if (!events.has(requiredEvent)) throw new Error(`Missing audit event: ${requiredEvent}`);
  }
  if (!bundle.finalReport?.finalizedAt) throw new Error("Final report was not finalized.");
  if (!bundle.buyerVisibleReady) {
    throw new Error(`Buyer-visible release is still blocked: ${(bundle.readinessIssues ?? []).map((issue) => issue.label).join(", ")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    apiBaseUrl: baseUrl,
    inspectionId: inspection.id,
    vin,
    captureActor: captureSession.actor.name,
    captureRole: captureSession.actor.role,
    reviewerActor: reviewSession.actor.name,
    reviewerRole: reviewSession.actor.role,
    separateRoleProof: captureSession.actor.id !== reviewSession.actor.id,
    uploadedPhotos: uploaded.length,
    suggestionsReviewed: reviewResult.reviewed,
    photoAnglesCorrected: reviewResult.editedAngles,
    providers: providerNames,
    grade: `${grade.grade} ${grade.score}`,
    reportFinalizedAt: bundle.finalReport.finalizedAt,
    buyerVisibleReady: bundle.buyerVisibleReady,
    auditEvents: [...events].sort()
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
