import type { AuthorizationSource } from "@inspectiq/shared";
import type { ReconOperationsRecord } from "./types.js";

export type OperationsFilters = {
  query: string;
  facility: string;
  department: string;
  urgency: string;
  workflow: string;
  authorization: string;
};

export type OperationsMetrics = {
  activeVehicles: number;
  highUrgency: number;
  conditionReportsAwaitingReview: number;
  reconAwaitingAuthorization: number;
  automaticallyAuthorizedRecon: number;
  workInProgress: number;
  reauthorizationRequired: number;
  qualityControlFailures: number;
  saleReady: number;
};

export function authorizationSourceLabel(source: AuthorizationSource | null): string {
  if (source === "CONSIGNOR_POLICY") return "Consignor policy · automatic";
  if (source === "MANAGED_PROGRAM_POLICY") return "Managed program policy · automatic";
  if (source === "CONSIGNOR_USER") return "Consignor user · manual";
  if (source === "ADMINISTRATIVE_OVERRIDE") return "Administrative override";
  return "Decision pending";
}

export function operationsMetrics(records: ReconOperationsRecord[]): OperationsMetrics {
  return {
    activeVehicles: records.filter((record) => record.saleAssignment.status !== "SCHEDULED").length,
    highUrgency: records.filter((record) => record.urgency.urgencyScore >= 4).length,
    conditionReportsAwaitingReview: records.filter((record) => !record.conditionReport?.finalizedAt).length,
    reconAwaitingAuthorization: records.filter((record) =>
      record.authorizations.some((authorization) => authorization.decision === "PENDING")
    ).length,
    automaticallyAuthorizedRecon: records.filter((record) =>
      record.authorizations.some((authorization) =>
        authorization.decision === "AUTHORIZED" &&
        (authorization.authorizationSource === "CONSIGNOR_POLICY" ||
          authorization.authorizationSource === "MANAGED_PROGRAM_POLICY")
      )
    ).length,
    workInProgress: records.filter((record) =>
      record.workOrders.some((workOrder) => workOrder.status === "IN_PROGRESS")
    ).length,
    reauthorizationRequired: records.filter((record) =>
      record.recommendations.some((recommendation) => recommendation.status === "REAUTHORIZATION_REQUIRED")
    ).length,
    qualityControlFailures: records.filter((record) =>
      record.workOrders.some((workOrder) => workOrder.qualityControl?.status === "FAILED")
    ).length,
    saleReady: records.filter((record) => record.readiness.saleReady).length
  };
}

export function filterOperations(
  records: ReconOperationsRecord[],
  filters: OperationsFilters
): ReconOperationsRecord[] {
  const query = filters.query.trim().toLowerCase();
  return records
    .filter((record) => {
      if (filters.facility !== "ALL" && record.intake.facility !== filters.facility) return false;
      if (filters.department !== "ALL" && !record.workOrders.some((order) => order.serviceDepartment === filters.department)) {
        return false;
      }
      if (filters.urgency !== "ALL" && record.urgency.urgencyClassification !== filters.urgency) return false;
      if (filters.workflow !== "ALL" && record.intake.inspectionWorkflowStatus !== filters.workflow) return false;
      if (filters.authorization !== "ALL" && record.reconStatus !== filters.authorization) return false;
      if (!query) return true;
      const searchable = [
        record.inspection.vin,
        record.inspection.year,
        record.inspection.make,
        record.inspection.model,
        record.consignor.name,
        record.intake.facility,
        record.intake.yardZone,
        record.intake.parkingSpace,
        record.saleAssignment.lane,
        record.saleAssignment.runNumber,
        ...record.workOrders.map((order) => order.workOrderNumber)
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    })
    .sort((left, right) => {
      const urgencyDifference = right.urgency.urgencyScore - left.urgency.urgencyScore;
      if (urgencyDifference !== 0) return urgencyDifference;
      return left.saleAssignment.saleDateTime.localeCompare(right.saleAssignment.saleDateTime);
    });
}
