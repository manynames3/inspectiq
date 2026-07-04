import { createSign, generateKeyPairSync } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { clearAuthCacheForTests } from "./auth.js";
import { MemoryStore } from "./store.js";

const inspectorHeaders = {
  "x-actor-id": "test-inspector",
  "x-actor-name": "Test Inspector",
  "x-actor-role": "inspector"
};

const reviewerHeaders = {
  "x-actor-id": "test-reviewer",
  "x-actor-name": "Test Reviewer",
  "x-actor-role": "reviewer"
};

const adminHeaders = {
  "x-actor-id": "test-admin",
  "x-actor-name": "Test Admin",
  "x-actor-role": "admin"
};

const authEnvKeys = ["AUTH_MODE", "OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_JSON"] as const;
const originalAuthEnv = Object.fromEntries(authEnvKeys.map((key) => [key, process.env[key]]));

function restoreAuthEnv(): void {
  for (const key of authEnvKeys) {
    const original = originalAuthEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  clearAuthCacheForTests();
}

function createTestJwtFactory() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "inspectiq-test-key";
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid,
    alg: "RS256",
    use: "sig"
  };

  function encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  function token(payload: Record<string, unknown>): string {
    const header = encode({ alg: "RS256", typ: "JWT", kid });
    const body = encode({
      iss: "https://issuer.test/inspectiq",
      aud: "inspectiq-web",
      exp: Math.floor(Date.now() / 1000) + 300,
      ...payload
    });
    const signingInput = `${header}.${body}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
  }

  return {
    jwksJson: JSON.stringify({ keys: [jwk] }),
    token
  };
}

describe("InspectIQ API", () => {
  let store: MemoryStore;
  let api: ReturnType<typeof createApp>;

  beforeEach(() => {
    restoreAuthEnv();
    store = new MemoryStore();
    api = createApp(store);
  });

  afterEach(() => {
    restoreAuthEnv();
  });

  async function createInspection() {
    return request(api)
      .post("/api/inspections")
      .set(inspectorHeaders)
      .send({
        vin: "JM3KFBDM7R0123456",
        year: 2024,
        make: "Mazda",
        model: "CX-5",
        trim: "Touring",
        mileage: 18420,
        exteriorColor: "Red",
        sellerSource: "Portfolio inspection",
        inspectorName: "Test Inspector"
      })
      .expect(201);
  }

  async function analyzeSamplePhoto(inspectionId: string, sampleKey: string) {
    const attached = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey })
      .expect(201);

    const [photo] = attached.body.data;
    await request(api).post(`/api/photos/${photo.id}/analyze`).set(inspectorHeaders).send({}).expect(200);
    return photo;
  }

  async function createAnalyzedCompleteInspection() {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    const attached = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey: "complete-clean-set" })
      .expect(201);

    for (const photo of attached.body.data) {
      await request(api).post(`/api/photos/${photo.id}/analyze`).set(inspectorHeaders).send({}).expect(200);
    }

    const suggestions = await request(api)
      .get(`/api/inspections/${inspectionId}/vision-suggestions`)
      .set(reviewerHeaders)
      .expect(200);

    return {
      inspectionId,
      photos: attached.body.data,
      suggestions: suggestions.body.data
    };
  }

  async function finalizeCompleteInspection() {
    const { inspectionId, photos, suggestions } = await createAnalyzedCompleteInspection();

    for (const suggestion of suggestions) {
      await request(api).post(`/api/vision-suggestions/${suggestion.id}/accept`).set(reviewerHeaders).send({}).expect(200);
    }

    await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(reviewerHeaders)
      .send({
        location: "left rear wheel",
        damageType: "wheel_damage",
        severity: "minor",
        notes: "Manual reviewer note from integration test."
      })
      .expect(201);

    await request(api)
      .post(`/api/inspections/${inspectionId}/grade`)
      .set(reviewerHeaders)
      .send({ idempotencyKey: "grade-e2e" })
      .expect(200);

    const report = await request(api)
      .post(`/api/inspections/${inspectionId}/ai-report`)
      .set(reviewerHeaders)
      .set("idempotency-key", "report-e2e")
      .send({})
      .expect(200);

    await request(api)
      .post(`/api/reports/${report.body.data.finalReport.id}/finalize`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);

    return { inspectionId, photos, suggestions, report: report.body.data };
  }

  it("validates inspection creation", async () => {
    const response = await request(api).post("/api/inspections").send({ vin: "x" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.requestId).toBeTruthy();
  });

  it("enforces role-specific workflow permissions", async () => {
    const blockedCreate = await request(api)
      .post("/api/inspections")
      .set(reviewerHeaders)
      .send({
        vin: "5NMS2DAJ5RH654321",
        year: 2024,
        make: "Hyundai",
        model: "Tucson",
        trim: "SEL",
        mileage: 14250,
        exteriorColor: "Gray",
        sellerSource: "Dealer trade",
        inspectorName: "Test Inspector"
      })
      .expect(403);
    expect(blockedCreate.body.error.code).toBe("FORBIDDEN");

    const created = await createInspection();
    const inspectionId = created.body.data.id as string;

    await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(reviewerHeaders)
      .send({ sampleKey: "front-clean" })
      .expect(403);

    const attached = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey: "front-clean" })
      .expect(201);
    const [photo] = attached.body.data;

    await request(api)
      .post(`/api/photos/${photo.id}/analyze`)
      .set(reviewerHeaders)
      .send({})
      .expect(403);

    await request(api)
      .post(`/api/photos/${photo.id}/analyze`)
      .set(inspectorHeaders)
      .send({})
      .expect(200);

    const suggestions = await request(api)
      .get(`/api/inspections/${inspectionId}/vision-suggestions`)
      .set(reviewerHeaders)
      .expect(200);
    const angleSuggestion = suggestions.body.data.find((item: { suggestionType: string }) => item.suggestionType === "photo_angle");
    expect(angleSuggestion).toBeTruthy();

    await request(api)
      .post(`/api/vision-suggestions/${angleSuggestion.id}/accept`)
      .set(inspectorHeaders)
      .send({})
      .expect(403);

    await request(api)
      .post(`/api/vision-suggestions/${angleSuggestion.id}/accept`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);

    const damage = await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(reviewerHeaders)
      .send({
        location: "front bumper",
        damageType: "scratch",
        severity: "minor",
        notes: "Confirmed during reviewer pass."
      })
      .expect(201);

    await request(api)
      .delete(`/api/damage/${damage.body.data.id}`)
      .set(reviewerHeaders)
      .send({})
      .expect(403);

    await request(api)
      .delete(`/api/damage/${damage.body.data.id}`)
      .set(adminHeaders)
      .send({})
      .expect(200);
  });

  it("enforces JWT identity and object-level inspection authorization", async () => {
    const jwt = createTestJwtFactory();
    process.env.AUTH_MODE = "jwt";
    process.env.OIDC_ISSUER = "https://issuer.test/inspectiq";
    process.env.OIDC_AUDIENCE = "inspectiq-web";
    process.env.OIDC_JWKS_JSON = jwt.jwksJson;
    clearAuthCacheForTests();

    const jwtStore = new MemoryStore();
    const jwtApi = createApp(jwtStore);
    const inspectorToken = jwt.token({
      sub: "jwt-inspector-a",
      name: "JWT Inspector A",
      "custom:role": "inspector"
    });
    const otherInspectorToken = jwt.token({
      sub: "jwt-inspector-b",
      name: "JWT Inspector B",
      "custom:role": "inspector"
    });
    const reviewerToken = jwt.token({
      sub: "jwt-reviewer",
      name: "JWT Reviewer",
      "custom:role": "reviewer"
    });

    await request(jwtApi)
      .get("/api/inspections")
      .expect(401);

    const created = await request(jwtApi)
      .post("/api/inspections")
      .set("authorization", `Bearer ${inspectorToken}`)
      .send({
        vin: "WBA5R1C00LFH12345",
        year: 2020,
        make: "BMW",
        model: "330i",
        trim: "xDrive",
        mileage: 44750,
        exteriorColor: "Black",
        sellerSource: "Lease grounding inspection",
        inspectorName: "JWT Inspector A"
      })
      .expect(201);
    const inspectionId = created.body.data.id as string;

    await request(jwtApi)
      .get(`/api/inspections/${inspectionId}`)
      .set("authorization", `Bearer ${otherInspectorToken}`)
      .expect(403);

    const filtered = await request(jwtApi)
      .get("/api/inspections")
      .set("authorization", `Bearer ${otherInspectorToken}`)
      .expect(200);
    expect(filtered.body.data.some((inspection: { id: string }) => inspection.id === inspectionId)).toBe(false);

    const reviewerView = await request(jwtApi)
      .get(`/api/inspections/${inspectionId}`)
      .set("authorization", `Bearer ${reviewerToken}`)
      .expect(200);
    expect(reviewerView.body.data.inspection.id).toBe(inspectionId);

    const uploaded = await request(jwtApi)
      .post(`/api/inspections/${inspectionId}/photos/upload`)
      .set("authorization", `Bearer ${inspectorToken}`)
      .send({
        originalFilename: "front.jpg",
        mimeType: "image/jpeg",
        objectBucket: "inspectiq-test-images",
        objectKey: `inspections/${inspectionId}/photos/front.jpg`,
        storageKey: `/uploads/inspections/${inspectionId}/photos/front.jpg`,
        byteSize: 1024,
        checksumSha256: "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg="
      })
      .expect(201);

    await request(jwtApi)
      .get(`/api/photos/${uploaded.body.data.id}/image?intent=preview`)
      .set("authorization", `Bearer ${otherInspectorToken}`)
      .expect(403);

    const imagePreview = await request(jwtApi)
      .get(`/api/photos/${uploaded.body.data.id}/image?intent=preview`)
      .set("authorization", `Bearer ${reviewerToken}`)
      .expect(200);
    expect(imagePreview.body.data).toMatchObject({
      imageUrl: `/uploads/inspections/${inspectionId}/photos/front.jpg`,
      expiresInSeconds: null,
      source: "object-storage"
    });
  });

  it("analyzes outstanding photos for an inspection in one batch action", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    const attached = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey: "complete-clean-set" })
      .expect(201);

    const analyzed = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/analyze`)
      .set(inspectorHeaders)
      .send({ idempotencyKeyPrefix: "batch-test" })
      .expect(200);

    expect(analyzed.body.data.jobs).toHaveLength(attached.body.data.length);
    expect(analyzed.body.data.jobs.every((job: { status: string }) => job.status === "completed")).toBe(true);
    expect(analyzed.body.data.suggestions.length).toBeGreaterThanOrEqual(attached.body.data.length);

    const bundle = await request(api).get(`/api/inspections/${inspectionId}`).set(inspectorHeaders).expect(200);
    expect(bundle.body.data.photos.every((photo: { analysisStatus: string }) => photo.analysisStatus === "completed")).toBe(true);
  });

  it("runs a full backend create to finalization flow with audit trail", async () => {
    const { inspectionId, suggestions } = await createAnalyzedCompleteInspection();

    for (const suggestion of suggestions) {
      await request(api).post(`/api/vision-suggestions/${suggestion.id}/accept`).set(reviewerHeaders).send({}).expect(200);
    }

    await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(reviewerHeaders)
      .send({
        location: "left rear wheel",
        damageType: "wheel_damage",
        severity: "minor",
        notes: "Manual reviewer note from integration test."
      })
      .expect(201);

    const graded = await request(api)
      .post(`/api/inspections/${inspectionId}/grade`)
      .set(reviewerHeaders)
      .send({ idempotencyKey: "grade-e2e" })
      .expect(200);
    expect(graded.body.data.score).toBeGreaterThan(0);

    const report = await request(api)
      .post(`/api/inspections/${inspectionId}/ai-report`)
      .set(reviewerHeaders)
      .set("idempotency-key", "report-e2e")
      .send({})
      .expect(200);
    expect(report.body.data.draft.outputJson.summary).toContain("Mazda");
    expect(report.body.data.finalReport.id).toBeTruthy();

    const finalized = await request(api)
      .post(`/api/reports/${report.body.data.finalReport.id}/finalize`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);
    expect(finalized.body.data.finalizedAt).toBeTruthy();

    const audit = await request(api).get(`/api/inspections/${inspectionId}/audit-events`).set(reviewerHeaders).expect(200);
    const eventTypes = audit.body.data.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toContain("inspection.created");
    expect(eventTypes).toContain("image_analysis.queued");
    expect(eventTypes).toContain("image_analysis.started");
    expect(eventTypes).toContain("photo.analyzed");
    expect(eventTypes).toContain("condition.grade_generated");
    expect(eventTypes).toContain("ai_report.generated");
    expect(eventTypes).toContain("damage.added");
    expect(eventTypes).toContain("report.finalized");
  });

  it("persists image-quality scores and retake policy from analysis output", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    const attached = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey: "blurry-front" })
      .expect(201);
    const [photo] = attached.body.data;

    const analyzed = await request(api)
      .post(`/api/photos/${photo.id}/analyze`)
      .set(inspectorHeaders)
      .send({})
      .expect(200);

    expect(analyzed.body.data.job.status).toBe("completed");
    expect(analyzed.body.data.analysis.validatedOutputJson.imageQuality.grade).toBe("retake");
    expect(analyzed.body.data.analysis.validatedOutputJson.imageQuality.retakeRequired).toBe(true);

    const qualitySuggestion = analyzed.body.data.suggestions.find((item: { suggestionType: string }) => item.suggestionType === "quality_warning");
    expect(qualitySuggestion).toBeTruthy();
    expect(qualitySuggestion.suggestedValueJson.imageQuality.blurScore).toBeLessThan(0.6);

    const audit = await request(api).get(`/api/inspections/${inspectionId}/audit-events`).set(inspectorHeaders).expect(200);
    const analyzedEvent = audit.body.data.find((event: { eventType: string }) => event.eventType === "photo.analyzed");
    expect(analyzedEvent.detailsJson.imageQuality.retakeRequired).toBe(true);

    const health = await request(api).get("/api/platform-health").expect(200);
    const retakeMetric = health.body.data.operationalMetrics.find((metric: { metric: string }) => metric.metric === "image_quality_retake_rate");
    expect(retakeMetric.value).toBe("100%");
    const queueMetric = health.body.data.operationalMetrics.find((metric: { metric: string }) => metric.metric === "image_analysis_queue_latency");
    expect(queueMetric).toBeTruthy();
  });

  it("creates upload intent metadata for object-storage based image capture", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;

    const intent = await request(api)
      .post("/api/uploads/intent")
      .set(inspectorHeaders)
      .send({
        inspectionId,
        originalFilename: "front.jpg",
        mimeType: "image/jpeg",
        byteSize: 120000,
        checksumSha256: "a".repeat(64)
      })
      .expect(201);

    expect(intent.body.data.objectBucket).toBeTruthy();
    expect(intent.body.data.objectKey).toContain(`inspections/${inspectionId}/photos/`);
    expect(intent.body.data.requiredHeaders["x-amz-checksum-sha256"]).toBe("a".repeat(64));
  });

  it("returns backend readiness blockers before buyer-visible release", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    await analyzeSamplePhoto(inspectionId, "front-clean");

    const readiness = await request(api)
      .get(`/api/inspections/${inspectionId}/readiness`)
      .set(inspectorHeaders)
      .expect(200);

    expect(readiness.body.data.buyerVisibleReady).toBe(false);
    expect(readiness.body.data.issues.map((issue: { type: string }) => issue.type)).toContain("missing_required_angle");
    expect(readiness.body.data.issues.map((issue: { type: string }) => issue.type)).toContain("unreviewed_ai_suggestion");
  });

  it("does not let edited photo-angle suggestions count as evidence until accepted", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    await analyzeSamplePhoto(inspectionId, "front-clean");

    const suggestions = await request(api)
      .get(`/api/inspections/${inspectionId}/vision-suggestions`)
      .set(reviewerHeaders)
      .expect(200);
    const angleSuggestion = suggestions.body.data.find((item: { suggestionType: string }) => item.suggestionType === "photo_angle");
    expect(angleSuggestion).toBeTruthy();

    await request(api)
      .patch(`/api/vision-suggestions/${angleSuggestion.id}`)
      .set(reviewerHeaders)
      .send({
        suggestedValue: { photoAngle: "front" },
        explanation: "Reviewer corrected the angle before accepting it."
      })
      .expect(200);

    const beforeAccept = await request(api)
      .post(`/api/inspections/${inspectionId}/grade`)
      .set(reviewerHeaders)
      .send({})
      .expect(409);
    expect(beforeAccept.body.error.details.missingEvidence).toContain("front");

    await request(api)
      .post(`/api/vision-suggestions/${angleSuggestion.id}/accept`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);

    const afterAccept = await request(api)
      .post(`/api/inspections/${inspectionId}/grade`)
      .set(reviewerHeaders)
      .send({})
      .expect(409);
    expect(afterAccept.body.error.details.missingEvidence).not.toContain("front");
  });

  it("validates reviewer-edited suggestion payloads against the suggestion schema", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    await analyzeSamplePhoto(inspectionId, "front-clean");

    const suggestions = await request(api)
      .get(`/api/inspections/${inspectionId}/vision-suggestions`)
      .set(reviewerHeaders)
      .expect(200);
    const angleSuggestion = suggestions.body.data.find((item: { suggestionType: string }) => item.suggestionType === "photo_angle");
    expect(angleSuggestion).toBeTruthy();

    const response = await request(api)
      .patch(`/api/vision-suggestions/${angleSuggestion.id}`)
      .set(reviewerHeaders)
      .send({
        suggestedValue: { photoAngle: "sideways" },
        explanation: "Invalid angle should be rejected."
      })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("keeps finalized inspections immutable through material workflow endpoints", async () => {
    const { inspectionId, photos, suggestions } = await finalizeCompleteInspection();

    await request(api)
      .patch(`/api/inspections/${inspectionId}`)
      .set(adminHeaders)
      .send({ mileage: 19000 })
      .expect(409);

    await request(api)
      .patch(`/api/inspections/${inspectionId}`)
      .set(adminHeaders)
      .send({})
      .expect(409);

    await request(api)
      .patch(`/api/inspections/${inspectionId}`)
      .set(adminHeaders)
      .send({ status: "FINALIZED" })
      .expect(409);

    await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(reviewerHeaders)
      .send({
        location: "front bumper",
        damageType: "scratch",
        severity: "minor",
        notes: "Should not mutate after finalization."
      })
      .expect(409);

    const pendingSuggestion = suggestions.find((item: { suggestionType: string }) => item.suggestionType === "extracted_text") ?? suggestions[0];
    expect(pendingSuggestion).toBeTruthy();
    await request(api)
      .post(`/api/vision-suggestions/${pendingSuggestion.id}/reject`)
      .set(reviewerHeaders)
      .send({})
      .expect(409);

    await request(api)
      .post(`/api/photos/${photos[0].id}/analyze`)
      .set(inspectorHeaders)
      .send({ force: true })
      .expect(409);
  });

  it("prevents finalization before a valid report exists", async () => {
    const response = await request(api)
      .post("/api/reports/00000000-0000-0000-0000-000000000000/finalize")
      .set(reviewerHeaders)
      .send({});
    expect(response.status).toBe(404);
  });

  it("exports a buyer-ready condition report without internal schema language", async () => {
    const { report } = await finalizeCompleteInspection();

    const exported = await request(api)
      .get(`/api/reports/${report.finalReport.id}/export`)
      .set(reviewerHeaders)
      .expect(200);

    expect(exported.text).toContain("Condition Report:");
    expect(exported.text).toContain("Confirmed Damage");
    expect(exported.text).not.toContain("VisionOutputSchema");
    expect(exported.text).not.toContain("validated schema");
  });
});
