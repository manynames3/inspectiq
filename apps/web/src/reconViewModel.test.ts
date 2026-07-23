import { describe, expect, it } from "vitest";
import type { ReconOperationsRecord } from "./types.js";
import {
  authorizationSourceLabel,
  filterOperations,
  operationsMetrics
} from "./reconViewModel.js";

function record(overrides: {
  vin: string;
  urgency: 1 | 2 | 3 | 4 | 5;
  facility: string;
  workOrderNumber?: string;
  department?: "DETAIL" | "TIRE";
  authorizationSource?: "CONSIGNOR_POLICY" | "CONSIGNOR_USER";
  authorizationDecision?: "PENDING" | "AUTHORIZED";
  workStatus?: "IN_PROGRESS" | "BLOCKED";
  workflow?: "CR_PUBLISHED" | "RETAKE_REQUIRED";
  reauthorization?: boolean;
  failedQc?: boolean;
  saleReady?: boolean;
}): ReconOperationsRecord {
  const workOrders = overrides.workOrderNumber ? [{
    id: `wo-${overrides.vin}`,
    workOrderNumber: overrides.workOrderNumber,
    inspectionId: overrides.vin,
    facility: overrides.facility,
    serviceDepartment: overrides.department ?? "DETAIL",
    authorizedAmount: 100,
    currentEstimatedCost: 100,
    actualCost: null,
    assignedTechnician: null,
    instructions: "Test scope",
    saleDeadline: "2026-08-01T10:00:00.000Z",
    status: overrides.workStatus ?? "IN_PROGRESS",
    blockedReason: overrides.reauthorization ? "Reauthorization required" : null,
    version: 1,
    tasks: [],
    qualityControl: overrides.failedQc ? {
      id: "qc",
      workOrderId: `wo-${overrides.vin}`,
      status: "FAILED" as const,
      notes: "Failed",
      inspectedByUserId: "reviewer",
      inspectedAt: "2026-07-30T10:00:00.000Z"
    } : null
  }] : [];
  return {
    inspection: {
      id: overrides.vin,
      vin: overrides.vin,
      year: 2022,
      make: "Ford",
      model: "Escape",
      trim: "SEL",
      mileage: 20_000,
      exteriorColor: "Blue",
      sellerSource: "Dealer",
      inspectorName: "Inspector",
      status: "FINALIZED",
      completenessPercentage: 100,
      updatedAt: "2026-07-30T10:00:00.000Z",
      finalizedAt: null
    },
    intake: {
      id: `intake-${overrides.vin}`,
      inspectionId: overrides.vin,
      consignorAccountId: "account",
      facility: overrides.facility,
      yardZone: "A",
      parkingSpace: "12",
      lastLocationTimestamp: "2026-07-30T10:00:00.000Z",
      inspectionType: "VISUAL_CONDITION_REPORT",
      inspectionWorkflowStatus: overrides.workflow ?? "CR_PUBLISHED"
    },
    consignor: { id: "account", name: "Dealer Group", accountType: "DEALERSHIP", authorizedUserIds: [] },
    saleAssignment: {
      id: `sale-${overrides.vin}`,
      inspectionId: overrides.vin,
      saleDateTime: "2026-08-01T10:00:00.000Z",
      lane: "Lane 1",
      runNumber: "10",
      saleEventId: null,
      status: overrides.saleReady ? "READY" : "BLOCKED"
    },
    conditionGrade: null,
    conditionReport: overrides.workflow === "RETAKE_REQUIRED" ? null : {
      id: "report",
      reportBody: "",
      finalizedBy: "reviewer",
      finalizedAt: "2026-07-30T10:00:00.000Z",
      version: 1,
      approvalStatus: "finalized",
      reviewerComment: "",
      approvedBy: "reviewer",
      approvedAt: "2026-07-30T09:00:00.000Z"
    },
    damageItems: [],
    photos: [],
    policy: null,
    recommendations: overrides.reauthorization ? [{
      id: "recommendation",
      inspectionId: overrides.vin,
      damageItemId: null,
      serviceType: overrides.department ?? "DETAIL",
      recommendedAction: "Test",
      estimatedCost: 100,
      estimatedDurationHours: 1,
      expectedGradeLift: 0,
      estimateCreatorId: "estimator",
      supportingPhotoIds: [],
      notes: "",
      status: "REAUTHORIZATION_REQUIRED",
      version: 1
    }] : [],
    authorizations: overrides.authorizationDecision ? [{
      id: "authorization",
      inspectionId: overrides.vin,
      recommendationId: "recommendation",
      decision: overrides.authorizationDecision,
      authorizedAmount: overrides.authorizationDecision === "AUTHORIZED" ? 100 : 0,
      authorizationSource: overrides.authorizationSource ?? null,
      consignorUserId: null,
      decisionReason: "",
      decisionTimestamp: null,
      version: 1
    }] : [],
    workOrders,
    reconStatus: overrides.reauthorization ? "REAUTHORIZATION_REQUIRED" : "AUTHORIZED",
    urgency: {
      urgencyScore: overrides.urgency,
      urgencyClassification: overrides.urgency >= 4 ? "HIGH" : overrides.urgency >= 2 ? "MEDIUM" : "LOW",
      urgencyReasons: []
    },
    readiness: {
      id: "readiness",
      inspectionId: overrides.vin,
      saleReady: Boolean(overrides.saleReady),
      status: overrides.saleReady ? "READY" : "BLOCKED",
      blockers: [],
      assessedByUserId: "system",
      assessedAt: "2026-07-30T10:00:00.000Z"
    },
    totals: {
      recommendedCost: 100,
      automaticallyAuthorizedCost: 0,
      manuallyAuthorizedCost: 0,
      declinedCost: 0,
      pendingCost: 0,
      remainingAccountAuthorization: 0
    },
    estimatedCompletion: null
  };
}

describe("recon operations view model", () => {
  const records = [
    record({
      vin: "HIGHVIN",
      urgency: 5,
      facility: "Atlanta Main",
      workOrderNumber: "IQ-WO-100",
      department: "TIRE",
      authorizationDecision: "PENDING",
      reauthorization: true,
      failedQc: true
    }),
    record({
      vin: "READYVIN",
      urgency: 1,
      facility: "Atlanta South",
      workOrderNumber: "IQ-WO-200",
      authorizationDecision: "AUTHORIZED",
      authorizationSource: "CONSIGNOR_POLICY",
      saleReady: true
    })
  ];

  it("counts operational metrics without sorting to count high urgency", () => {
    expect(operationsMetrics(records)).toMatchObject({
      activeVehicles: 2,
      highUrgency: 1,
      reconAwaitingAuthorization: 1,
      automaticallyAuthorizedRecon: 1,
      reauthorizationRequired: 1,
      qualityControlFailures: 1,
      saleReady: 1
    });
  });

  it("filters by work-order number, facility, department, and urgency", () => {
    expect(filterOperations(records, {
      query: "IQ-WO-100",
      facility: "Atlanta Main",
      department: "TIRE",
      urgency: "HIGH",
      workflow: "ALL",
      authorization: "ALL"
    }).map((item) => item.inspection.vin)).toEqual(["HIGHVIN"]);
  });

  it("makes automatic and manual authorization sources explicit", () => {
    expect(authorizationSourceLabel("CONSIGNOR_POLICY")).toContain("automatic");
    expect(authorizationSourceLabel("CONSIGNOR_USER")).toContain("manual");
  });
});
