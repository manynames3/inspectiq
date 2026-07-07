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

const mutableEnvKeys = [
  "AUTH_MODE",
  "OIDC_ISSUER",
  "OIDC_AUDIENCE",
  "OIDC_JWKS_JSON",
  "DEFAULT_AUTH_ROLE",
  "OIDC_DEFAULT_ROLE",
  "REQUIRE_JWT_ROLE_CLAIM",
  "AUTH_ADMIN_EMAILS",
  "AUTH_REVIEWER_EMAILS",
  "AUTH_INSPECTOR_EMAILS",
  "ENABLE_REFERENCE_EVIDENCE",
  "ENABLE_EVALUATION_MODE",
  "IMAGE_UPLOAD_MODE",
  "IMAGE_BUCKET"
] as const;
const originalEnv = Object.fromEntries(mutableEnvKeys.map((key) => [key, process.env[key]]));

function restoreAuthEnv(): void {
  for (const key of mutableEnvKeys) {
    const original = originalEnv[key];
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

  it("loads confirmed damage for the reference reviewer queue", async () => {
    const listed = await request(api).get("/api/inspections").set(reviewerHeaders).expect(200);
    const details = await Promise.all(
      listed.body.data.map((inspection: { id: string }) =>
        request(api).get(`/api/inspections/${inspection.id}`).set(reviewerHeaders).expect(200)
      )
    );

    const damageItems = details.flatMap((response) => response.body.data.damageItems);

    expect(damageItems.length).toBeGreaterThanOrEqual(2);
    expect(damageItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        location: "Driver-side front door",
        damageType: "scratch",
        severity: "minor",
        source: "vision_suggestion",
        confirmedBy: "review-lead"
      }),
      expect.objectContaining({
        location: "Rear bumper",
        damageType: "dent",
        severity: "moderate",
        source: "vision_suggestion",
        confirmedBy: "review-lead"
      })
    ]));
  });

  it("loads reference report coverage for reviewer metrics", async () => {
    const listed = await request(api).get("/api/inspections").set(reviewerHeaders).expect(200);
    const details = await Promise.all(
      listed.body.data.map((inspection: { id: string }) =>
        request(api).get(`/api/inspections/${inspection.id}`).set(reviewerHeaders).expect(200)
      )
    );

    const bundles = details.map((response) => response.body.data);
    const reports = bundles.filter((bundle) => bundle.finalReport);
    const finalized = reports.filter((bundle) => bundle.finalReport.finalizedAt);
    const humanReviewDrafts = bundles.filter((bundle) => bundle.aiReportDraft?.humanReviewRequired);

    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(finalized.length).toBeGreaterThanOrEqual(1);
    expect(humanReviewDrafts.length).toBeGreaterThanOrEqual(1);
    expect(reports).toEqual(expect.arrayContaining([
      expect.objectContaining({
        inspection: expect.objectContaining({ vin: "1FMCU9H6XNUB81389" }),
        finalReport: expect.objectContaining({ finalizedBy: "review-lead" })
      }),
      expect.objectContaining({
        inspection: expect.objectContaining({ vin: "KNMAT2MV6KP514068" }),
        aiReportDraft: expect.objectContaining({ humanReviewRequired: true }),
        finalReport: expect.objectContaining({ finalizedAt: null })
      })
    ]));
  });

  it("blocks reference evidence loading when the production guard is disabled", async () => {
    process.env.ENABLE_REFERENCE_EVIDENCE = "false";
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;

    const response = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey: "front-clean" })
      .expect(400);

    expect(response.body.error.message).toBe("Reference evidence loading is disabled. Upload captured photos for this inspection.");
  });

  it("allows read-only evaluation access without a bearer token and blocks workflow mutation", async () => {
    process.env.AUTH_MODE = "jwt";
    process.env.ENABLE_EVALUATION_MODE = "true";
    api = createApp(new MemoryStore());

    const session = await request(api)
      .get("/api/evaluation/auth/session")
      .set("x-actor-role", "reviewer")
      .expect(200);

    expect(session.body.data.actor).toMatchObject({
      id: "evaluation-reviewer",
      role: "reviewer"
    });

    const inspections = await request(api)
      .get("/api/evaluation/inspections")
      .set("x-actor-role", "reviewer")
      .expect(200);

    expect(inspections.body.data.length).toBeGreaterThan(0);

    const adapterRewrittenInspections = await request(api)
      .get("/api/inspections")
      .set("x-evaluation-mode", "true")
      .set("x-actor-role", "reviewer")
      .expect(200);

    expect(adapterRewrittenInspections.body.data.length).toBeGreaterThan(0);

    const blockedCreate = await request(api)
      .post("/api/evaluation/inspections")
      .set("x-actor-role", "admin")
      .send({
        vin: "5NMS2DAJ5RH654321",
        year: 2024,
        make: "Hyundai",
        model: "Tucson",
        trim: "SEL",
        mileage: 14250,
        exteriorColor: "Gray",
        sellerSource: "Evaluation",
        inspectorName: "Evaluation Admin"
      })
      .expect(403);

    expect(blockedCreate.body.error.message).toBe("Evaluation workspace is read-only. Sign in with Cognito to perform workflow actions.");
  });

  it("can disable the public evaluation route", async () => {
    process.env.AUTH_MODE = "jwt";
    process.env.ENABLE_EVALUATION_MODE = "false";
    api = createApp(new MemoryStore());

    const response = await request(api)
      .get("/api/evaluation/auth/session")
      .set("x-actor-role", "reviewer")
      .expect(401);

    expect(response.body.error.message).toBe("Evaluation workspace is not enabled for this environment.");
  });

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
    expect(angleSuggestion.assignedToRole).toBe("inspector");
    expect(angleSuggestion.assignedToUserId).toBeNull();
    expect(Date.parse(angleSuggestion.dueAt)).toBeGreaterThan(Date.parse(angleSuggestion.createdAt));
    expect(angleSuggestion.resolvedAt).toBeNull();

    await request(api)
      .post(`/api/vision-suggestions/${angleSuggestion.id}/accept`)
      .set(inspectorHeaders)
      .send({})
      .expect(403);

    const acceptedSuggestion = await request(api)
      .post(`/api/vision-suggestions/${angleSuggestion.id}/accept`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);
    expect(acceptedSuggestion.body.data.reviewedBy).toBe("test-reviewer");
    expect(acceptedSuggestion.body.data.resolvedAt).toBe(acceptedSuggestion.body.data.reviewedAt);

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
      "cognito:groups": ["InspectIQReviewer"]
    });
    const defaultInspectorToken = jwt.token({
      sub: "jwt-default-inspector",
      email: "default.inspector@example.com"
    });
    const mappedAdminToken = jwt.token({
      sub: "jwt-mapped-admin",
      email: "owner@example.com"
    });
    process.env.AUTH_ADMIN_EMAILS = "owner@example.com";

    await request(jwtApi)
      .get("/api/inspections")
      .expect(401);

    const defaultSession = await request(jwtApi)
      .get("/api/auth/session")
      .set("authorization", `Bearer ${defaultInspectorToken}`)
      .expect(200);
    expect(defaultSession.body.data.actor).toMatchObject({
      id: "jwt-default-inspector",
      name: "default.inspector@example.com",
      role: "inspector"
    });

    const reviewerSession = await request(jwtApi)
      .get("/api/auth/session")
      .set("authorization", `Bearer ${reviewerToken}`)
      .expect(200);
    expect(reviewerSession.body.data.actor.role).toBe("reviewer");

    const mappedAdminSession = await request(jwtApi)
      .get("/api/auth/session")
      .set("authorization", `Bearer ${mappedAdminToken}`)
      .expect(200);
    expect(mappedAdminSession.body.data.actor.role).toBe("admin");

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

  it("allows read-only evaluation preview without allowing mutations", async () => {
    process.env.AUTH_MODE = "jwt";
    process.env.ENABLE_EVALUATION_MODE = "true";
    api = createApp(store);

    const inspections = await request(api)
      .get("/api/evaluation/inspections")
      .set("x-actor-role", "admin")
      .expect(200);
    expect(inspections.body.data.length).toBeGreaterThan(0);

    const bundle = await request(api)
      .get(`/api/evaluation/inspections/${inspections.body.data[0].id}`)
      .set("x-actor-role", "admin")
      .expect(200);
    expect(bundle.body.data.photos.length).toBeGreaterThan(0);

    const imagePreview = await request(api)
      .get(`/api/evaluation/photos/${bundle.body.data.photos[0].id}/image?intent=preview`)
      .set("x-actor-role", "admin")
      .expect(200);
    expect(imagePreview.body.data.imageUrl).toBeTruthy();

    const mutation = await request(api)
      .post("/api/evaluation/inspections")
      .set("x-actor-role", "admin")
      .send({
        vin: "5NMS2DAJ5RH654321",
        year: 2024,
        make: "Hyundai",
        model: "Tucson",
        trim: "SEL",
        mileage: 14250,
        exteriorColor: "Gray",
        sellerSource: "Dealer trade",
        inspectorName: "Evaluation Reviewer"
      })
      .expect(403);
    expect(mutation.body.error.message).toContain("Evaluation workspace is read-only");

    await request(api).get("/api/inspections").expect(401);
  });

  it("can require explicit JWT role claims for stricter deployments", async () => {
    const jwt = createTestJwtFactory();
    process.env.AUTH_MODE = "jwt";
    process.env.OIDC_ISSUER = "https://issuer.test/inspectiq";
    process.env.OIDC_AUDIENCE = "inspectiq-web";
    process.env.OIDC_JWKS_JSON = jwt.jwksJson;
    process.env.REQUIRE_JWT_ROLE_CLAIM = "true";
    clearAuthCacheForTests();

    const jwtApi = createApp(new MemoryStore());
    const tokenWithoutRole = jwt.token({
      sub: "jwt-no-role",
      email: "no-role@example.com"
    });

    const response = await request(jwtApi)
      .get("/api/auth/session")
      .set("authorization", `Bearer ${tokenWithoutRole}`)
      .expect(401);
    expect(response.body.error.message).toBe("JWT is missing an InspectIQ role claim.");
    expect(response.body.error.details.expectedClaims).toContain("custom:role");
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
    expect(qualitySuggestion.assignedToRole).toBe("inspector");
    expect(Date.parse(qualitySuggestion.dueAt)).toBeGreaterThan(Date.parse(qualitySuggestion.createdAt));
    expect(qualitySuggestion.resolvedAt).toBeNull();
    expect(qualitySuggestion.suggestedValueJson.imageQuality.blurScore).toBeLessThan(0.6);

    const audit = await request(api).get(`/api/inspections/${inspectionId}/audit-events`).set(inspectorHeaders).expect(200);
    const analyzedEvent = audit.body.data.find((event: { eventType: string }) => event.eventType === "photo.analyzed");
    expect(analyzedEvent.detailsJson.imageQuality.retakeRequired).toBe(true);

    const health = await request(api).get("/api/platform-health").expect(200);
    const retakeMetric = health.body.data.operationalMetrics.find((metric: { metric: string }) => metric.metric === "image_quality_retake_rate");
    expect(Number.parseInt(retakeMetric.value, 10)).toBeGreaterThan(0);
    expect(retakeMetric.evidence).toContain("completed analyses require image retake");
    const queueMetric = health.body.data.operationalMetrics.find((metric: { metric: string }) => metric.metric === "image_analysis_queue_latency");
    expect(queueMetric).toBeTruthy();
    expect(health.body.data.runtimeProof.visionProvider).toBeTruthy();
    expect(health.body.data.evidencePack.vehicleSets.length).toBeGreaterThanOrEqual(3);
    expect(health.body.data.roleProof.map((item: { role: string }) => item.role)).toEqual(["inspector", "reviewer", "admin"]);
  });

  it("lets admins simulate and recover failed image jobs for the operations drill", async () => {
    const simulated = await request(api)
      .post("/api/platform-health/simulate-failed-image-job")
      .set(adminHeaders)
      .send({})
      .expect(201);

    expect(simulated.body.data.job.status).toBe("failed");
    expect(simulated.body.data.photo.analysisStatus).toBe("failed");

    const blocked = await request(api)
      .post("/api/platform-health/recover-failed-jobs")
      .set(reviewerHeaders)
      .send({})
      .expect(403);
    expect(blocked.body.error.message).toContain("Switch to Admin");

    const beforeRecovery = await request(api).get("/api/platform-health").set(adminHeaders).expect(200);
    expect(beforeRecovery.body.data.failedJobRecovery.liveStatus.failedImageJobs).toBeGreaterThan(0);
    expect(beforeRecovery.body.data.runtimeProof.latestFailedOrRecoveredJob.type).toBe("failed_job");

    const recovered = await request(api)
      .post("/api/platform-health/recover-failed-jobs")
      .set(adminHeaders)
      .send({ reason: "Vitest recovery drill" })
      .expect(200);

    expect(recovered.body.data.requeued).toBeGreaterThan(0);
    expect(recovered.body.data.jobs.every((job: { status: string }) => job.status === "queued")).toBe(true);

    const afterRecovery = await request(api).get("/api/platform-health").set(adminHeaders).expect(200);
    expect(afterRecovery.body.data.failedJobRecovery.liveStatus.failedImageJobs).toBe(0);
    expect(afterRecovery.body.data.runtimeProof.latestFailedOrRecoveredJob.type).toBe("recovered_job");
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

  it("rejects unsafe production upload metadata", async () => {
    process.env.IMAGE_UPLOAD_MODE = "presigned";
    process.env.IMAGE_BUCKET = "inspectiq-test-bucket";
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;

    await request(api)
      .post(`/api/inspections/${inspectionId}/photos/upload`)
      .set(inspectorHeaders)
      .send({
        originalFilename: "diagram.svg",
        mimeType: "image/svg+xml",
        objectBucket: "inspectiq-test-bucket",
        objectKey: `inspections/${inspectionId}/photos/front.svg`,
        byteSize: 120000,
        checksumSha256: "a".repeat(64)
      })
      .expect(400);

    await request(api)
      .post(`/api/inspections/${inspectionId}/photos/upload`)
      .set(inspectorHeaders)
      .send({
        originalFilename: "front.jpg",
        mimeType: "image/jpeg",
        objectBucket: "inspectiq-test-bucket",
        objectKey: `other-inspection/photos/front.jpg`,
        byteSize: 120000,
        checksumSha256: "a".repeat(64)
      })
      .expect(400);

    await request(api)
      .post(`/api/inspections/${inspectionId}/photos/upload`)
      .set(inspectorHeaders)
      .send({
        originalFilename: "front.jpg",
        mimeType: "image/jpeg",
        objectBucket: "wrong-bucket",
        objectKey: `inspections/${inspectionId}/photos/front.jpg`,
        byteSize: 120000,
        checksumSha256: "a".repeat(64)
      })
      .expect(400);

    await request(api)
      .post(`/api/inspections/${inspectionId}/photos/upload`)
      .set(inspectorHeaders)
      .send({
        originalFilename: "front.jpg",
        mimeType: "image/jpeg",
        objectBucket: "inspectiq-test-bucket",
        objectKey: `inspections/${inspectionId}/photos/front.jpg`,
        byteSize: 120000
      })
      .expect(400);
  });

  it("force reanalysis stores a fresh result instead of reusing stale completed output", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    await analyzeSamplePhoto(inspectionId, "front-clean");

    const firstBundle = await request(api)
      .get(`/api/inspections/${inspectionId}`)
      .set(reviewerHeaders)
      .expect(200);
    expect(firstBundle.body.data.photoAnalysisResults).toHaveLength(1);

    await request(api)
      .post(`/api/inspections/${inspectionId}/photos/analyze`)
      .set(inspectorHeaders)
      .send({ force: true, idempotencyKeyPrefix: "force-test" })
      .expect(200);

    const secondBundle = await request(api)
      .get(`/api/inspections/${inspectionId}`)
      .set(reviewerHeaders)
      .expect(200);
    expect(secondBundle.body.data.photoAnalysisResults).toHaveLength(2);
    expect(secondBundle.body.data.photoAnalysisResults[0].createdAt >= secondBundle.body.data.photoAnalysisResults[1].createdAt).toBe(true);
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
