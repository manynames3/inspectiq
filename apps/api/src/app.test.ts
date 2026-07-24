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

const reconCoordinatorHeaders = {
  "x-actor-id": "recon-coordinator",
  "x-actor-name": "Alex Rivera",
  "x-actor-role": "recon_coordinator"
};

const consignorApproverHeaders = {
  "x-actor-id": "consignor-approver-sdg",
  "x-actor-name": "Morgan Ellis",
  "x-actor-role": "consignor_approver"
};

const unrelatedConsignorHeaders = {
  "x-actor-id": "consignor-approver-unrelated",
  "x-actor-name": "Unrelated Consignor",
  "x-actor-role": "consignor_approver"
};

const mutableEnvKeys = [
  "AUTH_MODE",
  "OIDC_ISSUER",
  "OIDC_AUDIENCE",
  "OIDC_JWKS_JSON",
  "DEFAULT_AUTH_ROLE",
  "OIDC_DEFAULT_ROLE",
  "REQUIRE_JWT_ROLE_CLAIM",
  "ALLOW_JWT_DEFAULT_ROLE",
  "AUTH_ADMIN_EMAILS",
  "AUTH_REVIEWER_EMAILS",
  "AUTH_INSPECTOR_EMAILS",
  "ENABLE_REFERENCE_EVIDENCE",
  "ENABLE_EVALUATION_MODE",
  "IMAGE_UPLOAD_MODE",
  "IMAGE_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN"
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

  it("loads only evidence-supported confirmed damage for the reference reviewer queue", async () => {
    const listed = await request(api).get("/api/inspections").set(reviewerHeaders).expect(200);
    const details = await Promise.all(
      listed.body.data.map((inspection: { id: string }) =>
        request(api).get(`/api/inspections/${inspection.id}`).set(reviewerHeaders).expect(200)
      )
    );

    const damageItems = details.flatMap((response) => response.body.data.damageItems);

    expect(damageItems).toEqual([]);
    expect(damageItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        inspectionId: details.find((response) => response.body.data.inspection.vin === "1FMCU9H6XNUB81389")?.body.data.inspection.id,
        location: "Driver-side front door",
        damageType: "scratch"
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
        finalReport: expect.objectContaining({ finalizedBy: "review-lead" })
      }),
      expect.objectContaining({
        inspection: expect.objectContaining({ vin: "1HGCV1F49LA129627" }),
        aiReportDraft: expect.objectContaining({ humanReviewRequired: true }),
        finalReport: expect.objectContaining({ finalizedAt: null })
      })
    ]));
  });

  it("lets the assigned inspector and an admin add manual damage while evaluation roles remain read-only", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;

    await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(inspectorHeaders)
      .send({
        location: "right rear wheel",
        damageType: "wheel_damage",
        severity: "minor",
        notes: "Inspector-confirmed curb rash."
      })
      .expect(201);

    await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(adminHeaders)
      .send({
        location: "front bumper",
        damageType: "scratch",
        severity: "minor",
        notes: "Admin-confirmed paint transfer."
      })
      .expect(201);

    process.env.ENABLE_EVALUATION_MODE = "true";
    for (const role of ["inspector", "admin"]) {
      await request(api)
        .post(`/api/evaluation/inspections/${inspectionId}/damage`)
        .set("x-actor-role", role)
        .send({
          location: "left rear door",
          damageType: "dent",
          severity: "minor",
          notes: "Evaluation attempt."
        })
        .expect(403);
    }

    expect(store.listDamage(inspectionId)).toHaveLength(2);
  });

  it("enforces consignor scope and completes estimate-overrun recovery through the API", async () => {
    const queue = await request(api)
      .get("/api/operations/recon")
      .set(reconCoordinatorHeaders)
      .expect(200);
    const nissan = queue.body.data.find((record: { inspection: { vin: string } }) =>
      record.inspection.vin === "KNMAT2MV6KP514068"
    );
    expect(nissan).toBeDefined();

    await request(api)
      .get(`/api/operations/recon/${nissan.inspection.id}`)
      .set(unrelatedConsignorHeaders)
      .expect(403);

    const scoped = await request(api)
      .get(`/api/operations/recon/${nissan.inspection.id}`)
      .set(consignorApproverHeaders)
      .expect(200);
    const mechanicalOrder = scoped.body.data.workOrders.find((order: { serviceDepartment: string }) =>
      order.serviceDepartment === "MECHANICAL"
    );
    const mechanicalTask = mechanicalOrder.tasks[0];
    const mechanicalAuthorization = scoped.body.data.authorizations.find((authorization: { recommendationId: string }) =>
      authorization.recommendationId === mechanicalTask.recommendationId
    );

    await request(api)
      .post(`/api/recon/authorizations/${mechanicalAuthorization.id}/decision`)
      .set(consignorApproverHeaders)
      .send({
        decision: "APPROVE",
        decisionReason: "Approved the revised verification estimate before the sale deadline.",
        authorizedAmount: mechanicalOrder.currentEstimatedCost,
        expectedVersion: mechanicalAuthorization.version
      })
      .expect(200);

    const operationAfterApproval = await request(api)
      .get(`/api/operations/recon/${nissan.inspection.id}`)
      .set(reconCoordinatorHeaders)
      .expect(200);
    const approvedMechanicalOrder = operationAfterApproval.body.data.workOrders.find(
      (order: { id: string }) => order.id === mechanicalOrder.id
    );

    const started = await request(api)
      .patch(`/api/work-orders/${mechanicalOrder.id}`)
      .set(reconCoordinatorHeaders)
      .send({ action: "START", expectedVersion: approvedMechanicalOrder.version })
      .expect(200);
    const sentToQc = await request(api)
      .patch(`/api/work-orders/${mechanicalOrder.id}`)
      .set(reconCoordinatorHeaders)
      .send({ action: "SEND_TO_QC", expectedVersion: started.body.data.version })
      .expect(200);
    await request(api)
      .post(`/api/work-orders/${mechanicalOrder.id}/quality-control`)
      .set(reconCoordinatorHeaders)
      .send({
        decision: "PASS",
        notes: "Reauthorized condition-verification scope completed.",
        expectedVersion: sentToQc.body.data.version
      })
      .expect(201);

    const readiness = await request(api)
      .post(`/api/inspections/${nissan.inspection.id}/sale-readiness`)
      .set(reconCoordinatorHeaders)
      .send({})
      .expect(200);
    expect(readiness.body.data).toMatchObject({ saleReady: true, blockers: [] });
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

  it("keeps rights-cleared evaluator images out of inspection evidence", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;

    const response = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey: "skoda-roomster-rear-quarter-dent" })
      .expect(400);

    expect(response.body.error.message).toBe("Offline evaluation images cannot be attached to an inspection.");
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

    const damagePayload = {
      location: "left rear wheel",
      damageType: "wheel_damage",
      severity: "minor",
      notes: "Manual reviewer note from integration test.",
      idempotencyKey: "damage-e2e"
    };
    const damage = await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(reviewerHeaders)
      .set("idempotency-key", damagePayload.idempotencyKey)
      .send(damagePayload)
      .expect(201);
    const duplicateDamage = await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(reviewerHeaders)
      .set("idempotency-key", damagePayload.idempotencyKey)
      .send(damagePayload)
      .expect(200);
    expect(duplicateDamage.body.data.id).toBe(damage.body.data.id);

    const grade = await request(api)
      .post(`/api/inspections/${inspectionId}/grade`)
      .set(reviewerHeaders)
      .send({ idempotencyKey: "grade-e2e" })
      .expect(200);

    await request(api)
      .post(`/api/inspections/${inspectionId}/condition-grade/approve`)
      .set(reviewerHeaders)
      .send({ approvedGrade: grade.body.data.suggestedGrade })
      .expect(200);

    const report = await request(api)
      .post(`/api/inspections/${inspectionId}/ai-report`)
      .set(reviewerHeaders)
      .set("idempotency-key", "report-e2e")
      .send({})
      .expect(200);

    const approved = await request(api)
      .post(`/api/reports/${report.body.data.finalReport.id}/approve`)
      .set(reviewerHeaders)
      .send({
        expectedVersion: report.body.data.finalReport.version,
        reviewerComment: "Reviewed against confirmed evidence."
      })
      .expect(200);

    await request(api)
      .post(`/api/reports/${report.body.data.finalReport.id}/finalize`)
      .set(reviewerHeaders)
      .send({ expectedVersion: approved.body.data.version })
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

    const missingRoleSession = await request(jwtApi)
      .get("/api/auth/session")
      .set("authorization", `Bearer ${defaultInspectorToken}`)
      .expect(401);
    expect(missingRoleSession.body.error.message).toContain("InspectIQ role claim");

    process.env.ALLOW_JWT_DEFAULT_ROLE = "true";
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

  it("previews the same private reference object that image analysis reads", async () => {
    process.env.IMAGE_UPLOAD_MODE = "presigned";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    delete process.env.AWS_SESSION_TOKEN;
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    const storageKey = "https://example.test/reference-evidence/passenger-side.jpg";
    const photo = store.addPhoto({
      inspectionId,
      originalFilename: "2020-honda-accord-passenger-side.jpg",
      mimeType: "image/jpeg",
      objectBucket: "inspectiq-test-images",
      objectKey: `uploads/reference-evidence/${inspectionId}/passenger-side.jpg`,
      storageKey,
      byteSize: 2048,
      checksumSha256: "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=",
      uploadedBy: inspectorHeaders["x-actor-id"],
      declaredAngle: "passenger_side"
    }, { id: inspectorHeaders["x-actor-id"], name: inspectorHeaders["x-actor-name"], role: "inspector" });

    const imagePreview = await request(api)
      .get(`/api/photos/${photo.id}/image?intent=preview`)
      .set(reviewerHeaders)
      .expect(200);

    expect(imagePreview.body.data).toMatchObject({
      expiresInSeconds: 900,
      source: "object-storage"
    });
    expect(imagePreview.body.data.imageUrl).toContain("inspectiq-test-images");
    expect(imagePreview.body.data.imageUrl).toContain("passenger-side.jpg");
    expect(imagePreview.body.data.imageUrl).not.toBe(storageKey);
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
    expect(graded.body.data.suggestedGrade).toBeGreaterThan(0);
    expect(graded.body.data.approvedGrade).toBeNull();
    const duplicateGrade = await request(api)
      .post(`/api/inspections/${inspectionId}/grade`)
      .set(reviewerHeaders)
      .send({ idempotencyKey: "grade-e2e" })
      .expect(200);
    expect(duplicateGrade.body.data.id).toBe(graded.body.data.id);

    await request(api)
      .post(`/api/inspections/${inspectionId}/condition-grade/approve`)
      .set(reviewerHeaders)
      .send({ approvedGrade: graded.body.data.suggestedGrade })
      .expect(200);

    const report = await request(api)
      .post(`/api/inspections/${inspectionId}/ai-report`)
      .set(reviewerHeaders)
      .set("idempotency-key", "report-e2e")
      .send({})
      .expect(200);
    expect(report.body.data.draft.outputJson.summary).toContain("Mazda");
    expect(report.body.data.draft.outputJson.inspectionType).toBe("VISUAL_CONDITION_REPORT");
    expect(report.body.data.draft.outputJson.conditionReportSections).toHaveLength(20);
    expect(report.body.data.draft.outputJson.conditionReportSections).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "VIN_VERIFICATION", title: "VIN verification" }),
      expect.objectContaining({ key: "STRUCTURAL_OBSERVATIONS" }),
      expect.objectContaining({ key: "ANNOUNCEMENTS_AND_DISCLOSURES" })
    ]));
    expect(report.body.data.finalReport.id).toBeTruthy();
    const duplicateReport = await request(api)
      .post(`/api/inspections/${inspectionId}/ai-report`)
      .set(reviewerHeaders)
      .set("idempotency-key", "report-e2e")
      .send({})
      .expect(200);
    expect(duplicateReport.body.data.job.id).toBe(report.body.data.job.id);
    expect(duplicateReport.body.data.draft.id).toBe(report.body.data.draft.id);
    expect(duplicateReport.body.data.finalReport.id).toBe(report.body.data.finalReport.id);

    const approved = await request(api)
      .post(`/api/reports/${report.body.data.finalReport.id}/approve`)
      .set(reviewerHeaders)
      .send({ expectedVersion: report.body.data.finalReport.version, reviewerComment: "Evidence reviewed." })
      .expect(200);

    const finalized = await request(api)
      .post(`/api/reports/${report.body.data.finalReport.id}/finalize`)
      .set(reviewerHeaders)
      .send({ expectedVersion: approved.body.data.version })
      .expect(200);
    expect(finalized.body.data.finalizedAt).toBeTruthy();

    const audit = await request(api).get(`/api/inspections/${inspectionId}/audit-events`).set(reviewerHeaders).expect(200);
    const eventTypes = audit.body.data.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toContain("inspection.created");
    expect(eventTypes).toContain("image_analysis.queued");
    expect(eventTypes).toContain("image_analysis.started");
    expect(eventTypes).toContain("photo.analyzed");
    expect(eventTypes).toContain("condition.grade_generated");
    expect(eventTypes).toContain("condition.grade_approved");
    expect(eventTypes).toContain("ai_report.generated");
    expect(eventTypes).toContain("damage.added");
    expect(eventTypes).toContain("report.finalized");
    expect([...store.domainEvents.values()].some((event) =>
      event.inspectionId === inspectionId && event.eventType === "condition_report.published"
    )).toBe(true);
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

    await request(api)
      .post(`/api/vision-suggestions/${qualitySuggestion.id}/accept`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);

    const bundleAfterAccept = await request(api)
      .get(`/api/inspections/${inspectionId}`)
      .set(reviewerHeaders)
      .expect(200);
    expect(bundleAfterAccept.body.data.readinessIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "image_quality_retake",
        label: expect.stringContaining("Retake front"),
        action: expect.stringContaining("replacement image")
      })
    ]));
    expect(bundleAfterAccept.body.data.readinessIssues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "image_analysis_failed"
      })
    ]));

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

  it("materializes accepted VIN and odometer OCR findings as identity verifications", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    const attached = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(inspectorHeaders)
      .send({ sampleKey: "odometer-closeup-64231" })
      .expect(201);
    const [photo] = attached.body.data;

    const analyzed = await request(api)
      .post(`/api/photos/${photo.id}/analyze`)
      .set(inspectorHeaders)
      .send({})
      .expect(200);
    const extractedText = analyzed.body.data.suggestions.find((item: { suggestionType: string }) => item.suggestionType === "extracted_text");
    expect(extractedText).toBeTruthy();

    await request(api)
      .post(`/api/vision-suggestions/${extractedText.id}/accept`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);

    const bundle = await request(api)
      .get(`/api/inspections/${inspectionId}`)
      .set(reviewerHeaders)
      .expect(200);
    expect(bundle.body.data.identityVerifications).toEqual([
      expect.objectContaining({
        field: "odometer",
        value: "64231",
        sourceSuggestionId: extractedText.id,
        verifiedBy: "test-reviewer"
      })
    ]);

    const audit = await request(api).get(`/api/inspections/${inspectionId}/audit-events`).set(reviewerHeaders).expect(200);
    expect(audit.body.data.map((event: { eventType: string }) => event.eventType)).toContain("identity.verified");
  });

  it("retries failed report jobs by creating a new draft job", async () => {
    const inspector = store.addUser({ id: "test-inspector", name: "Test Inspector", role: "inspector" });
    const reviewer = store.addUser({ id: "test-reviewer", name: "Test Reviewer", role: "reviewer" });
    const inspection = store.createInspection({
      vin: "JM3KFBDM7R0123456",
      year: 2024,
      make: "Mazda",
      model: "CX-5",
      trim: "Touring",
      mileage: 18420,
      exteriorColor: "Red",
      sellerSource: "Portfolio inspection",
      inspectorName: "Test Inspector"
    }, inspector);
    inspection.status = "READY_FOR_GRADING";
    inspection.completenessPercentage = 100;
    store.saveGrade(inspection.id, {
      suggestedGrade: 4.4,
      conditionGradeBeforeRecon: 4.4,
      evidenceBlockers: [],
      explanationJson: { deductions: [] },
      gradingVersion: "test-grader"
    }, reviewer);
    store.approveGrade(inspection.id, 4.4, null, reviewer);
    const failedJob = store.createReportJob(inspection.id, "test-failed-report", reviewer);
    store.markJobRunning(failedJob.id);
    store.failReportJob(failedJob.id, "Provider timeout", reviewer);

    const retried = await request(api)
      .post(`/api/ai-report-jobs/${failedJob.id}/retry`)
      .set(reviewerHeaders)
      .send({})
      .expect(200);

    expect(retried.body.data.job.id).not.toBe(failedJob.id);
    expect(retried.body.data.job.status).toBe("completed");
    expect(retried.body.data.draft).toEqual(expect.objectContaining({
      inspectionId: inspection.id,
      validationStatus: "valid"
    }));
    expect(store.getInspection(inspection.id).status).toBe("HUMAN_REVIEW_REQUIRED");
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

  it("uses one stable object key for retried mobile upload operations", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    const operationId = crypto.randomUUID();
    const body = {
      inspectionId,
      originalFilename: "front.jpg",
      mimeType: "image/jpeg",
      byteSize: 120000,
      checksumSha256: "b".repeat(64),
      operationId,
      captureSource: "mobile"
    };

    const first = await request(api).post("/api/uploads/intent").set(inspectorHeaders).send(body).expect(201);
    const retried = await request(api).post("/api/uploads/intent").set(inspectorHeaders).send(body).expect(201);
    expect(first.body.data.objectKey).toBe(retried.body.data.objectKey);
    expect(first.body.data.objectKey).toContain(operationId);

    await request(api)
      .post("/api/uploads/intent")
      .set(inspectorHeaders)
      .send({ ...body, operationId: undefined })
      .expect(400);
  });

  it("limits operational projections to administrators", async () => {
    await request(api).get("/api/operations/projections").set(reviewerHeaders).expect(403);
    const response = await request(api).get("/api/operations/projections?limit=10").set(adminHeaders).expect(200);
    expect(response.body.data).toEqual(expect.objectContaining({
      health: expect.any(Object),
      events: expect.any(Array),
      usage: expect.any(Object),
      eventDlq: expect.any(Object)
    }));
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
    expect(exported.text).toContain("VIN verification");
    expect(exported.text).toContain("Announcements and disclosures");
    expect(exported.text).not.toContain("VisionOutputSchema");
    expect(exported.text).not.toContain("validated schema");
  });

  it("rejects stale inspection updates with an explicit version conflict", async () => {
    const created = await createInspection();
    const response = await request(api)
      .patch(`/api/inspections/${created.body.data.id}`)
      .set(adminHeaders)
      .send({ mileage: 20000, expectedVersion: created.body.data.version + 1 })
      .expect(409);

    expect(response.body.error.code).toBe("VERSION_CONFLICT");
    expect(response.body.error.details.actualVersion).toBe(created.body.data.version);
  });

  it("deduplicates mobile photo confirmation by operation id", async () => {
    const created = await createInspection();
    const operationId = crypto.randomUUID();
    const payload = {
      originalFilename: "mobile-front.jpg",
      mimeType: "image/jpeg",
      declaredAngle: "front",
      storageKey: "data:image/jpeg;base64,AA==",
      operationId,
      capturedAt: new Date().toISOString(),
      deviceId: "field-device-1",
      captureSource: "mobile"
    };
    const first = await request(api)
      .post(`/api/inspections/${created.body.data.id}/photos/upload`)
      .set(inspectorHeaders)
      .send(payload)
      .expect(201);
    const second = await request(api)
      .post(`/api/inspections/${created.body.data.id}/photos/upload`)
      .set(inspectorHeaders)
      .send(payload)
      .expect(201);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(store.listPhotos(created.body.data.id)).toHaveLength(1);
  });

  it("assigns actionable suggestions and records a versioned audit update", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    await analyzeSamplePhoto(inspectionId, "front-clean");
    const [suggestion] = store.listSuggestions(inspectionId);
    const initialVersion = suggestion.version;
    const assigned = await request(api)
      .patch(`/api/vision-suggestions/${suggestion.id}/assignment`)
      .set(reviewerHeaders)
      .send({
        assignedToRole: "reviewer",
        assignedToUserId: "test-reviewer",
        expectedVersion: initialVersion
      })
      .expect(200);

    expect(assigned.body.data.assignedToUserId).toBe("test-reviewer");
    expect(assigned.body.data.version).toBe(initialVersion + 1);
    expect(store.auditForInspection(inspectionId).some((event) => event.eventType === "suggestion.assigned")).toBe(true);
  });

  it("converts only quality and angle findings into bulk retake work", async () => {
    const created = await createInspection();
    const inspectionId = created.body.data.id as string;
    await analyzeSamplePhoto(inspectionId, "front-clean");
    const angleSuggestion = store.listSuggestions(inspectionId).find((item) => item.suggestionType === "photo_angle");
    expect(angleSuggestion).toBeTruthy();

    const response = await request(api)
      .post("/api/vision-suggestions/bulk-retake")
      .set(reviewerHeaders)
      .send({ suggestionIds: [angleSuggestion?.id], reason: "Angle needs direct framing." })
      .expect(200);

    expect(response.body.data[0].assignedToRole).toBe("inspector");
    expect(response.body.data[0].explanation).toContain("Inspector retake required");
    expect(store.auditForInspection(inspectionId).some((event) => event.eventType === "suggestion.retake_requested")).toBe(true);
  });

  it("records immutable report versions for generation, approval, and finalization", async () => {
    const { report } = await finalizeCompleteInspection();
    const versions = await request(api)
      .get(`/api/reports/${report.finalReport.id}/versions`)
      .set(reviewerHeaders)
      .expect(200);

    expect(versions.body.data.map((version: { changeType: string }) => version.changeType)).toEqual([
      "finalized",
      "approved",
      "generated"
    ]);
    expect(new Set(versions.body.data.map((version: { version: number }) => version.version)).size).toBe(3);
  });

  it("creates versioned domain events without VIN or image URLs in the payload", async () => {
    const created = await createInspection();
    const event = [...store.domainEvents.values()].find((row) =>
      row.eventType === "inspection.created" && row.inspectionId === created.body.data.id
    );
    expect(event).toBeTruthy();
    expect(event?.inspectionId).toBe(created.body.data.id);
    expect(event?.schemaVersion).toBe("1.0");
    expect(JSON.stringify(event?.payloadJson)).not.toContain(created.body.data.vin);
    expect(JSON.stringify(event?.payloadJson)).not.toContain("http");
  });
});
