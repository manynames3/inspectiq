import { describe, expect, it } from "vitest";
import { reconcileReconOperations, seedStore } from "./seedData.js";
import { MemoryStore } from "./store.js";
import type { Actor } from "./domain.js";

const reconActor: Actor = {
  id: "recon-coordinator",
  name: "Alex Rivera",
  role: "recon_coordinator"
};

const consignorActor: Actor = {
  id: "consignor-approver-sdg",
  name: "Morgan Ellis",
  role: "consignor_approver"
};

describe("inspection-to-recon operations", () => {
  it("adds missing operational records without replacing persisted vehicles or evidence", () => {
    const store = new MemoryStore();
    seedStore(store);
    const inspectionIds = [...store.inspections.keys()];
    const photoIds = [...store.photos.keys()];
    const vins = [...store.inspections.values()].map((inspection) => inspection.vin);
    store.recon.reset();

    expect(reconcileReconOperations(store)).toBe(true);
    expect([...store.inspections.keys()]).toEqual(inspectionIds);
    expect([...store.photos.keys()]).toEqual(photoIds);
    expect([...store.inspections.values()].map((inspection) => inspection.vin)).toEqual(vins);
    expect(store.vehicleIntakes.size).toBe(store.inspections.size);

    const operationalCounts = {
      intakes: store.vehicleIntakes.size,
      assignments: store.inspectionAssignments.size,
      recommendations: store.reconRecommendations.size,
      workOrders: store.workOrders.size
    };
    expect(reconcileReconOperations(store)).toBe(false);
    expect({
      intakes: store.vehicleIntakes.size,
      assignments: store.inspectionAssignments.size,
      recommendations: store.reconRecommendations.size,
      workOrders: store.workOrders.size
    }).toEqual(operationalCounts);
  });

  it("backfills a newly added damaged vehicle and exposes only a preliminary CR until evidence is complete", () => {
    const store = new MemoryStore();
    seedStore(store);
    const inspection = store.createInspection({
      vin: "1FMCU0G6XNUB32593",
      year: 2022,
      make: "Ford",
      model: "Escape",
      trim: "SE",
      mileage: 72_901,
      exteriorColor: "White",
      sellerSource: "Marketplace intake",
      inspectorName: "Marketplace Inspector"
    }, reconActor);
    store.addDamage({
      inspectionId: inspection.id,
      location: "Rear liftgate and bumper",
      damageType: "dent",
      severity: "severe",
      notes: "Reviewer-confirmed collision damage.",
      source: "vision_suggestion"
    }, reconActor);

    expect(reconcileReconOperations(store)).toBe(true);
    const record = store.recon.operationsRecord(inspection.id, reconActor);

    expect(record.intake.inspectionWorkflowStatus).toBe("CAPTURE_IN_PROGRESS");
    expect(record.conditionGrade).toBeNull();
    expect(record.conditionGradePreview).toEqual({
      value: 4.1,
      status: "PRELIMINARY",
      evidenceBlockers: ["Required inspection photographs are incomplete"]
    });
    expect(record.damageItems).toHaveLength(1);
    expect(reconcileReconOperations(store)).toBe(false);
  });

  it("does not invent published reports or recon estimates while backfilling older data", () => {
    const store = new MemoryStore();
    seedStore(store);
    const ford = [...store.inspections.values()].find((inspection) => inspection.vin === "1FMCU9H6XNUB81389")!;
    const report = store.latestFinalReport(ford.id)!;
    report.finalizedAt = null;
    store.recon.reset();

    expect(reconcileReconOperations(store)).toBe(true);
    const fordIntake = [...store.vehicleIntakes.values()].find((intake) => intake.inspectionId === ford.id);
    expect(fordIntake?.inspectionWorkflowStatus).toBe("REVIEW_READY");
    expect(store.reconRecommendations.size).toBe(0);
    expect(store.vehicleIntakes.size).toBe(store.inspections.size);
  });

  it("seeds distinct operational states without asserting unsupported vehicle damage", () => {
    const store = new MemoryStore();
    seedStore(store);

    const records = store.recon.listOperations(reconActor);
    expect(records).toHaveLength(6);
    expect(records[0].urgency.urgencyScore).toBeGreaterThanOrEqual(records[1].urgency.urgencyScore);

    const ford = records.find((record) => record.inspection.vin === "1FMCU9H6XNUB81389");
    expect(ford).toBeDefined();
    expect(ford?.intake.inspectionWorkflowStatus).toBe("CR_PUBLISHED");
    expect(ford?.conditionGrade?.approvedGrade).toBe(4.7);
    expect(ford?.recommendations).toHaveLength(1);
    expect(ford?.recommendations.every((recommendation) => recommendation.damageItemId === null)).toBe(true);
    expect(ford?.totals.recommendedCost).toBe(175);
    expect(ford?.workOrders.every((workOrder) => workOrder.status === "COMPLETED")).toBe(true);
    expect(ford?.readiness.saleReady).toBe(true);

    const nissan = records.find((record) => record.inspection.vin === "KNMAT2MV6KP514068");
    expect(nissan?.conditionGrade?.approvedGrade).toBe(4.1);
    expect(nissan?.recommendations).toHaveLength(2);
    expect(nissan?.recommendations.every((recommendation) => recommendation.damageItemId === null)).toBe(true);
    expect(nissan?.totals.recommendedCost).toBe(450);
    expect(nissan?.recommendations.some((recommendation) => recommendation.status === "REAUTHORIZATION_REQUIRED")).toBe(true);
    expect(nissan?.workOrders.some((workOrder) => workOrder.status === "BLOCKED")).toBe(true);
    expect(nissan?.urgency.urgencyClassification).toBe("HIGH");

    const workOrderCount = store.recon.workOrders.size;
    store.recon.generateAuthorizedWorkOrders(nissan!.inspection.id, reconActor);
    expect(store.recon.workOrders.size).toBe(workOrderCount);
    expect(new Set([...store.recon.workOrders.values()].map((order) => order.workOrderNumber)).size).toBe(workOrderCount);

    const reconEvent = [...store.domainEvents.values()].find((event) =>
      event.eventType === "recon.item_auto_authorized" &&
      event.inspectionId === nissan!.inspection.id
    );
    expect(reconEvent?.payloadJson).toMatchObject({
      consignorAccountId: nissan?.consignor.id
    });
  });

  it("blocks overruns, requires reauthorization, records QC, and releases a completed vehicle", () => {
    const store = new MemoryStore();
    seedStore(store);
    const nissan = store.recon.listOperations(reconActor)
      .find((record) => record.inspection.vin === "KNMAT2MV6KP514068");
    expect(nissan).toBeDefined();
    if (!nissan) return;

    const mechanicalOrder = store.recon.getWorkOrder(
      nissan.workOrders.find((workOrder) => workOrder.serviceDepartment === "MECHANICAL")!.id
    );
    expect(mechanicalOrder.status).toBe("BLOCKED");
    expect(mechanicalOrder.blockedReason).toContain("exceeds authorized amount");
    const mechanicalTask = store.recon.tasksForWorkOrder(mechanicalOrder.id)[0];
    const mechanicalAuthorization = store.recon.latestAuthorizationForRecommendation(mechanicalTask.recommendationId);
    expect(mechanicalAuthorization?.decision).toBe("PENDING");
    if (!mechanicalAuthorization) return;
    store.recon.decideAuthorization(mechanicalAuthorization.id, {
      decision: "APPROVE",
      decisionReason: "Approved the revised verification estimate before the sale deadline.",
      authorizedAmount: mechanicalOrder.currentEstimatedCost,
      expectedVersion: mechanicalAuthorization.version
    }, consignorActor);

    store.recon.updateWorkOrder(mechanicalOrder.id, {
      action: "START",
      expectedVersion: mechanicalOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(mechanicalOrder.id, {
      action: "SEND_TO_QC",
      expectedVersion: mechanicalOrder.version
    }, reconActor);
    store.recon.recordQualityControl(mechanicalOrder.id, {
      decision: "PASS",
      notes: "Reauthorized verification scope completed.",
      expectedVersion: mechanicalOrder.version
    }, reconActor);
    expect(mechanicalOrder.status).toBe("COMPLETED");

    const readiness = store.recon.assessReadiness(nissan.inspection.id, reconActor);
    expect(readiness.saleReady).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it("rejects stale work-order updates", () => {
    const store = new MemoryStore();
    seedStore(store);
    const order = [...store.workOrders.values()][0];
    expect(() => store.recon.updateWorkOrder(order.id, {
      action: "BLOCK",
      blockedReason: "Parts unavailable.",
      expectedVersion: order.version - 1
    }, reconActor)).toThrow(/changed after it was loaded/i);
  });
});
