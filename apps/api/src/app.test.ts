import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { MemoryStore } from "./store.js";

const actorHeaders = {
  "x-actor-id": "test-reviewer",
  "x-actor-name": "Test Reviewer",
  "x-actor-role": "reviewer"
};

describe("InspectIQ API", () => {
  let store: MemoryStore;
  let api: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new MemoryStore();
    api = createApp(store);
  });

  it("validates inspection creation", async () => {
    const response = await request(api).post("/api/inspections").send({ vin: "x" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.requestId).toBeTruthy();
  });

  it("runs a full backend create to finalization flow with audit trail", async () => {
    const created = await request(api)
      .post("/api/inspections")
      .set(actorHeaders)
      .send({
        vin: "SYNTHVIN24E2E0001",
        year: 2024,
        make: "Mazda",
        model: "CX-5",
        trim: "Touring",
        mileage: 18420,
        exteriorColor: "Red",
        sellerSource: "Portfolio demo",
        inspectorName: "Test Reviewer"
      })
      .expect(201);

    const inspectionId = created.body.data.id;
    const attached = await request(api)
      .post(`/api/inspections/${inspectionId}/photos/sample`)
      .set(actorHeaders)
      .send({ sampleKey: "complete-clean-set" })
      .expect(201);

    for (const photo of attached.body.data) {
      await request(api).post(`/api/photos/${photo.id}/analyze`).set(actorHeaders).send({}).expect(200);
    }

    const suggestions = await request(api)
      .get(`/api/inspections/${inspectionId}/vision-suggestions`)
      .expect(200);

    for (const suggestion of suggestions.body.data.filter((item: { suggestionType: string }) => item.suggestionType === "photo_angle")) {
      await request(api).post(`/api/vision-suggestions/${suggestion.id}/accept`).set(actorHeaders).send({}).expect(200);
    }

    const damageCandidate = suggestions.body.data.find((item: { suggestionType: string }) => item.suggestionType === "damage_candidate");
    expect(damageCandidate).toBeTruthy();
    await request(api).post(`/api/vision-suggestions/${damageCandidate.id}/accept`).set(actorHeaders).send({}).expect(200);

    await request(api)
      .post(`/api/inspections/${inspectionId}/damage`)
      .set(actorHeaders)
      .send({
        location: "left rear wheel",
        damageType: "wheel_damage",
        severity: "minor",
        notes: "Manual reviewer note from integration test."
      })
      .expect(201);

    const graded = await request(api)
      .post(`/api/inspections/${inspectionId}/grade`)
      .set(actorHeaders)
      .send({ idempotencyKey: "grade-e2e" })
      .expect(200);
    expect(graded.body.data.score).toBeGreaterThan(0);

    const report = await request(api)
      .post(`/api/inspections/${inspectionId}/ai-report`)
      .set(actorHeaders)
      .set("idempotency-key", "report-e2e")
      .send({})
      .expect(200);
    expect(report.body.data.draft.outputJson.summary).toContain("Mazda");
    expect(report.body.data.finalReport.id).toBeTruthy();

    const finalized = await request(api)
      .post(`/api/reports/${report.body.data.finalReport.id}/finalize`)
      .set(actorHeaders)
      .send({})
      .expect(200);
    expect(finalized.body.data.finalizedAt).toBeTruthy();

    const audit = await request(api).get(`/api/inspections/${inspectionId}/audit-events`).expect(200);
    const eventTypes = audit.body.data.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toContain("inspection.created");
    expect(eventTypes).toContain("photo.analyzed");
    expect(eventTypes).toContain("condition.grade_generated");
    expect(eventTypes).toContain("ai_report.generated");
    expect(eventTypes).toContain("report.finalized");
  });

  it("prevents finalization before a valid report exists", async () => {
    const response = await request(api).post("/api/reports/00000000-0000-0000-0000-000000000000/finalize").send({});
    expect(response.status).toBe(404);
  });
});

