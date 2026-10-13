import { describe, expect, it } from "vitest";
import {
  CreateReconRecommendationSchema,
  assessSaleReadiness,
  calculateReconTotals,
  evaluateAuthorizationPolicy
} from "@inspectiq/shared";

const policy = {
  approvalMode: "AUTO_APPROVE_UNDER_LIMIT" as const,
  totalVehicleLimit: 500,
  serviceRules: {
    DETAIL: { enabled: true, automaticApprovalLimit: 200 },
    BODY: { enabled: true, automaticApprovalLimit: 0 }
  },
  costOverrunTolerance: 25
};

describe("recon contracts", () => {
  it("separates automatic, manual, pending, and declined totals", () => {
    expect(calculateReconTotals([
      { estimatedCost: 175, authorizationStatus: "AUTHORIZED", authorizationSource: "CONSIGNOR_POLICY" },
      { estimatedCost: 300, authorizationStatus: "AUTHORIZED", authorizationSource: "CONSIGNOR_USER" },
      { estimatedCost: 500, authorizationStatus: "PENDING", authorizationSource: null },
      { estimatedCost: 125, authorizationStatus: "DECLINED", authorizationSource: "CONSIGNOR_USER" }
    ])).toEqual({
      recommendedCost: 1_100,
      automaticallyAuthorizedCost: 175,
      manuallyAuthorizedCost: 300,
      declinedCost: 125,
      pendingCost: 500
    });
  });

  it("applies service and combined vehicle policy limits", () => {
    expect(evaluateAuthorizationPolicy(policy, { serviceType: "DETAIL", estimatedCost: 175 }, 0)).toMatchObject({
      decision: "AUTO_AUTHORIZED",
      authorizationSource: "CONSIGNOR_POLICY"
    });
    expect(evaluateAuthorizationPolicy(policy, { serviceType: "BODY", estimatedCost: 50 }, 0).decision).toBe("MANUAL_REQUIRED");
    expect(evaluateAuthorizationPolicy(policy, { serviceType: "DETAIL", estimatedCost: 150 }, 400)).toMatchObject({
      decision: "MANUAL_REQUIRED",
      reason: expect.stringContaining("combined authorized work")
    });
  });

  it("returns structured sale-readiness blockers", () => {
    const readiness = assessSaleReadiness({
      requiredEvidenceComplete: true,
      conditionReportPublished: true,
      requiredReconDecisionsComplete: false,
      authorizedRequiredWorkComplete: false,
      reauthorizationRequired: true,
      qualityControlPassed: false,
      qualityControlFailed: true,
      disclosuresComplete: true,
      otherBlockingIssues: []
    });

    expect(readiness.saleReady).toBe(false);
    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([
      "RECON_DECISION_PENDING",
      "RECON_WORK_INCOMPLETE",
      "REAUTHORIZATION_REQUIRED",
      "QUALITY_CONTROL_FAILED"
    ]);
  });

  it("rejects malformed recon recommendations at the API boundary", () => {
    expect(() => CreateReconRecommendationSchema.parse({
      serviceType: "BODY",
      recommendedAction: "",
      estimatedCost: -1,
      estimatedDurationHours: 0,
      expectedGradeLift: 8,
      supportingPhotoIds: [],
      notes: ""
    })).toThrow();
  });
});
