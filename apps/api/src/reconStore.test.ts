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

  it("seeds distinct operational states without asserting unsupported vehicle damage", () => {
    const store = new MemoryStore();
    seedStore(store);

    const records = store.recon.listOperations(reconActor);
    expect(records).toHaveLength(6);
    expect(records[0].urgency.urgencyScore).toBeGreaterThanOrEqual(records[1].urgency.urgencyScore);

    const ford = records.find((record) => record.inspection.vin === "1FMCU9H6XNUB81389");
    expect(ford).toBeDefined();
    expect(ford?.intake.inspectionWorkflowStatus).toBe("CR_PUBLISHED");
    expect(ford?.recommendations).toHaveLength(3);
    expect(ford?.recommendations.every((recommendation) => recommendation.damageItemId === null)).toBe(true);
    expect(ford?.recommendations.some((recommendation) => recommendation.status === "DECLINED")).toBe(true);
    expect(ford?.workOrders.every((workOrder) => workOrder.status === "COMPLETED")).toBe(true);
    expect(ford?.readiness.saleReady).toBe(true);

    const nissan = records.find((record) => record.inspection.vin === "KNMAT2MV6KP514068");
    expect(nissan?.recommendations).toHaveLength(4);
    expect(nissan?.recommendations.every((recommendation) => recommendation.damageItemId === null)).toBe(true);
    expect(nissan?.recommendations.some((recommendation) => recommendation.status === "AUTHORIZATION_PENDING")).toBe(true);
    expect(nissan?.recommendations.some((recommendation) => recommendation.status === "REAUTHORIZATION_REQUIRED")).toBe(true);
    expect(nissan?.workOrders.some((workOrder) => workOrder.status === "BLOCKED")).toBe(true);
    expect(nissan?.workOrders.some((workOrder) => workOrder.qualityControl?.status === "FAILED")).toBe(true);
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

    const tireOrder = store.recon.getWorkOrder(
      nissan.workOrders.find((workOrder) => workOrder.serviceDepartment === "TIRE")!.id
    );
    expect(tireOrder.status).toBe("BLOCKED");
    expect(tireOrder.blockedReason).toContain("exceeds authorized amount");
    const tireTask = store.recon.tasksForWorkOrder(tireOrder.id)[0];
    const tireAuthorization = store.recon.latestAuthorizationForRecommendation(tireTask.recommendationId);
    expect(tireAuthorization?.decision).toBe("PENDING");
    if (!tireAuthorization) return;
    store.recon.decideAuthorization(tireAuthorization.id, {
      decision: "APPROVE",
      decisionReason: "Approved the revised tire-service estimate before the sale deadline.",
      authorizedAmount: tireOrder.currentEstimatedCost,
      expectedVersion: tireAuthorization.version
    }, consignorActor);

    store.recon.updateWorkOrder(tireOrder.id, {
      action: "START",
      expectedVersion: tireOrder.version
    }, reconActor);
    store.recon.updateWorkOrder(tireOrder.id, {
      action: "SEND_TO_QC",
      expectedVersion: tireOrder.version
    }, reconActor);
    store.recon.recordQualityControl(tireOrder.id, {
      decision: "PASS",
      notes: "Reauthorized tire-service scope verified.",
      expectedVersion: tireOrder.version
    }, reconActor);
    expect(tireOrder.status).toBe("COMPLETED");

    const glassOrder = store.recon.getWorkOrder(
      nissan.workOrders.find((workOrder) => workOrder.serviceDepartment === "GLASS")!.id
    );
    expect(store.recon.latestQualityControlForWorkOrder(glassOrder.id)?.status).toBe("FAILED");
    store.recon.updateWorkOrder(glassOrder.id, {
      action: "SEND_TO_QC",
      expectedVersion: glassOrder.version
    }, reconActor);
    store.recon.recordQualityControl(glassOrder.id, {
      decision: "PASS",
      notes: "Corrected glass-preparation scope verified.",
      expectedVersion: glassOrder.version
    }, reconActor);

    const pendingBody = store.recon.authorizationsForInspection(nissan.inspection.id)
      .find((authorization) => authorization.decision === "PENDING");
    expect(pendingBody).toBeDefined();
    if (pendingBody) {
      store.recon.decideAuthorization(pendingBody.id, {
        decision: "DECLINE",
        decisionReason: "Optional cosmetic allowance is not required for this sale.",
        expectedVersion: pendingBody.version
      }, consignorActor);
    }

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
