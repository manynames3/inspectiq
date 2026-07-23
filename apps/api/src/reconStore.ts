import {
  assessSaleReadiness,
  calculateReconTotals,
  calculateUrgency,
  estimateGradeAfterAuthorizedRecon,
  evaluateAuthorizationPolicy,
  type CreateConsignorAccountSchema,
  type CreateReconAuthorizationPolicySchema,
  type CreateReconRecommendationSchema,
  type CreateVehicleIntakeSchema,
  type ReconAuthorizationStatus,
  type VehicleLocationUpdateSchema,
  type WorkOrderUpdateSchema,
  type QualityControlDecisionSchema
} from "@inspectiq/shared";
import type { z } from "zod";
import type { Actor, DomainEventOutbox } from "./domain.js";
import type { MemoryStore } from "./store.js";
import type {
  ConsignorAccount,
  InspectionAssignment,
  QualityControlResult,
  ReconAuthorization,
  ReconAuthorizationPolicy,
  ReconOperationsRecord,
  ReconRecommendation,
  SaleAssignment,
  SaleReadinessAssessment,
  VehicleIntake,
  VehicleLocationEvent,
  WorkOrder,
  WorkOrderTask
} from "./reconDomain.js";
import { conflict, notFound, versionConflict } from "./errors.js";
import {
  assertBusinessTransition,
  inspectionWorkflowTransitions,
  workOrderTransitions
} from "./stateMachine.js";

type ConsignorInput = z.infer<typeof CreateConsignorAccountSchema>;
type PolicyInput = z.infer<typeof CreateReconAuthorizationPolicySchema>;
type IntakeInput = z.infer<typeof CreateVehicleIntakeSchema>;
type RecommendationInput = z.infer<typeof CreateReconRecommendationSchema>;
type LocationInput = z.infer<typeof VehicleLocationUpdateSchema>;
type WorkOrderUpdate = z.infer<typeof WorkOrderUpdateSchema>;
type QualityControlDecision = z.infer<typeof QualityControlDecisionSchema>;

const id = () => crypto.randomUUID();

function now(): string {
  const fixedNow = process.env.INSPECTIQ_FIXED_NOW;
  if (fixedNow && !Number.isNaN(Date.parse(fixedNow))) return new Date(fixedNow).toISOString();
  return new Date().toISOString();
}

function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

function nextWorkOrderNumber(existingCount: number): string {
  return `IQ-WO-${String(existingCount + 1).padStart(5, "0")}`;
}

export class ReconStore {
  consignorAccounts = new Map<string, ConsignorAccount>();
  reconPolicies = new Map<string, ReconAuthorizationPolicy>();
  vehicleIntakes = new Map<string, VehicleIntake>();
  inspectionAssignments = new Map<string, InspectionAssignment>();
  saleAssignments = new Map<string, SaleAssignment>();
  vehicleLocationEvents = new Map<string, VehicleLocationEvent>();
  reconRecommendations = new Map<string, ReconRecommendation>();
  reconAuthorizations = new Map<string, ReconAuthorization>();
  workOrders = new Map<string, WorkOrder>();
  workOrderTasks = new Map<string, WorkOrderTask>();
  qualityControlResults = new Map<string, QualityControlResult>();
  saleReadinessAssessments = new Map<string, SaleReadinessAssessment>();

  constructor(private readonly host: MemoryStore) {}

  reset(): void {
    this.consignorAccounts.clear();
    this.reconPolicies.clear();
    this.vehicleIntakes.clear();
    this.inspectionAssignments.clear();
    this.saleAssignments.clear();
    this.vehicleLocationEvents.clear();
    this.reconRecommendations.clear();
    this.reconAuthorizations.clear();
    this.workOrders.clear();
    this.workOrderTasks.clear();
    this.qualityControlResults.clear();
    this.saleReadinessAssessments.clear();
  }

  createConsignorAccount(input: ConsignorInput, actor: Actor): ConsignorAccount {
    const timestamp = now();
    const account: ConsignorAccount = {
      id: id(),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.consignorAccounts.set(account.id, account);
    return account;
  }

  createPolicy(input: PolicyInput, actor: Actor): ReconAuthorizationPolicy {
    this.getConsignorAccount(input.consignorAccountId);
    const timestamp = now();
    const policy: ReconAuthorizationPolicy = {
      id: id(),
      ...input,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.reconPolicies.set(policy.id, policy);
    return policy;
  }

  createVehicleIntake(input: IntakeInput, actor: Actor): VehicleIntake {
    const inspection = this.host.getInspection(input.inspectionId);
    this.getConsignorAccount(input.consignorAccountId);
    if (this.intakeForInspection(input.inspectionId)) {
      throw conflict("Vehicle intake already exists for this inspection.");
    }
    const timestamp = now();
    const intake: VehicleIntake = {
      id: id(),
      inspectionId: input.inspectionId,
      consignorAccountId: input.consignorAccountId,
      facility: input.facility,
      yardZone: input.yardZone,
      parkingSpace: input.parkingSpace,
      lastLocationTimestamp: timestamp,
      inspectionType: input.inspectionType,
      inspectionWorkflowStatus: "ASSIGNED",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const saleAssignment: SaleAssignment = {
      id: id(),
      inspectionId: inspection.id,
      saleDateTime: input.saleDateTime,
      lane: input.lane,
      runNumber: input.runNumber,
      saleEventId: input.saleEventId ?? null,
      status: "BLOCKED",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.vehicleIntakes.set(intake.id, intake);
    this.saleAssignments.set(saleAssignment.id, saleAssignment);
    this.recordLocation(inspection.id, input, "Vehicle check-in", actor);
    this.host.addAudit(inspection.id, actor, "vehicle.checked_in", {
      consignorAccountId: input.consignorAccountId,
      facility: input.facility,
      yardZone: input.yardZone,
      parkingSpace: input.parkingSpace,
      saleDateTime: input.saleDateTime,
      lane: input.lane,
      runNumber: input.runNumber
    });
    this.emit("vehicle.checked_in", inspection.id, actor, {
      consignorAccountId: input.consignorAccountId,
      facility: input.facility
    });
    this.assessReadiness(inspection.id, actor);
    return intake;
  }

  assignInspection(inspectionId: string, assignedToUserId: string, dueAt: string, actor: Actor): InspectionAssignment {
    const inspection = this.host.getInspection(inspectionId);
    const timestamp = now();
    inspection.assignedToUserId = assignedToUserId;
    inspection.updatedAt = timestamp;
    inspection.version += 1;
    const assignment: InspectionAssignment = {
      id: id(),
      inspectionId,
      assignedToUserId,
      assignedByUserId: actor.id,
      dueAt,
      status: "ASSIGNED",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.inspectionAssignments.set(assignment.id, assignment);
    this.host.addAudit(inspectionId, actor, "inspection.assigned", { assignedToUserId, dueAt });
    this.emit("inspection.assigned", inspectionId, actor, { assignedToUserId, dueAt });
    return assignment;
  }

  transitionInspection(inspectionId: string, nextStatus: VehicleIntake["inspectionWorkflowStatus"], actor: Actor): VehicleIntake {
    const intake = this.requireIntake(inspectionId);
    assertBusinessTransition("inspection workflow", inspectionWorkflowTransitions, intake.inspectionWorkflowStatus, nextStatus);
    const previousStatus = intake.inspectionWorkflowStatus;
    intake.inspectionWorkflowStatus = nextStatus;
    intake.updatedAt = now();
    this.host.addAudit(inspectionId, actor, "inspection.workflow_status_changed", {
      previousStatus,
      nextStatus
    });
    if (nextStatus === "CR_PUBLISHED") {
      this.emit("inspection.completed", inspectionId, actor, { inspectionWorkflowStatus: nextStatus });
    }
    return intake;
  }

  updateLocation(inspectionId: string, input: LocationInput, actor: Actor): VehicleLocationEvent {
    const intake = this.requireIntake(inspectionId);
    intake.facility = input.facility;
    intake.yardZone = input.yardZone;
    intake.parkingSpace = input.parkingSpace;
    intake.lastLocationTimestamp = now();
    intake.updatedAt = intake.lastLocationTimestamp;
    const event = this.recordLocation(inspectionId, input, input.reason, actor);
    this.host.addAudit(inspectionId, actor, "vehicle.location_updated", {
      facility: input.facility,
      yardZone: input.yardZone,
      parkingSpace: input.parkingSpace,
      reason: input.reason
    });
    this.emit("vehicle.location_updated", inspectionId, actor, {
      facility: input.facility,
      yardZone: input.yardZone,
      parkingSpace: input.parkingSpace
    });
    return event;
  }

  createRecommendation(inspectionId: string, input: RecommendationInput, actor: Actor): ReconRecommendation {
    this.requireIntake(inspectionId);
    const report = this.host.latestFinalReport(inspectionId);
    if (!report?.finalizedAt) {
      throw conflict("Publish the condition report before creating recon recommendations.");
    }
    if (input.damageItemId) {
      const damage = this.host.getDamage(input.damageItemId);
      if (damage.inspectionId !== inspectionId) {
        throw conflict("The damage item does not belong to this vehicle.");
      }
    }
    for (const photoId of input.supportingPhotoIds) {
      const photo = this.host.getPhoto(photoId);
      if (photo.inspectionId !== inspectionId) {
        throw conflict("Supporting evidence must belong to the same vehicle.");
      }
    }
    const timestamp = now();
    const recommendation: ReconRecommendation = {
      id: id(),
      inspectionId,
      damageItemId: input.damageItemId ?? null,
      serviceType: input.serviceType,
      recommendedAction: input.recommendedAction,
      estimatedCost: input.estimatedCost,
      estimatedDurationHours: input.estimatedDurationHours,
      expectedGradeLift: input.expectedGradeLift,
      estimateCreatorId: actor.id,
      supportingPhotoIds: input.supportingPhotoIds,
      notes: input.notes,
      status: "DRAFT",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.reconRecommendations.set(recommendation.id, recommendation);
    this.host.addAudit(inspectionId, actor, "recon.estimate_created", {
      recommendationId: recommendation.id,
      serviceType: recommendation.serviceType,
      estimatedCost: recommendation.estimatedCost,
      expectedGradeLift: recommendation.expectedGradeLift
    });
    this.emit("recon.estimate_created", inspectionId, actor, {
      recommendationId: recommendation.id,
      serviceType: recommendation.serviceType,
      estimatedCost: recommendation.estimatedCost
    });
    this.assessReadiness(inspectionId, actor);
    return recommendation;
  }

  submitEstimate(inspectionId: string, recommendationIds: string[], actor: Actor): ReconOperationsRecord {
    const intake = this.requireIntake(inspectionId);
    const policy = this.policyForAccount(intake.consignorAccountId);
    if (!policy) throw conflict("A consignor authorization policy is required before submitting recon estimates.");

    let alreadyAuthorizedCost = this.authorizationsForInspection(inspectionId)
      .filter((authorization) => authorization.decision === "AUTHORIZED")
      .reduce((sum, authorization) => sum + authorization.authorizedAmount, 0);

    for (const recommendationId of recommendationIds) {
      const recommendation = this.getRecommendation(recommendationId);
      if (recommendation.inspectionId !== inspectionId) {
        throw conflict("Every submitted recommendation must belong to the same vehicle.");
      }
      if (recommendation.status !== "DRAFT" && recommendation.status !== "REAUTHORIZATION_REQUIRED") {
        continue;
      }
      const evaluation = evaluateAuthorizationPolicy(policy, recommendation, alreadyAuthorizedCost);
      const timestamp = now();
      const snapshot = {
        approvalMode: policy.approvalMode,
        totalVehicleLimit: policy.totalVehicleLimit,
        serviceRules: policy.serviceRules,
        costOverrunTolerance: policy.costOverrunTolerance,
        policyId: policy.id,
        policyVersion: policy.version
      };
      const authorization: ReconAuthorization = {
        id: id(),
        inspectionId,
        recommendationId,
        decision: evaluation.decision === "AUTO_AUTHORIZED"
          ? "AUTHORIZED"
          : evaluation.decision === "POLICY_DECLINED"
            ? "DECLINED"
            : "PENDING",
        authorizedAmount: evaluation.decision === "AUTO_AUTHORIZED" ? recommendation.estimatedCost : 0,
        authorizationSource: evaluation.authorizationSource,
        consignorUserId: null,
        policySnapshot: snapshot,
        decisionReason: evaluation.reason,
        decisionTimestamp: evaluation.decision === "MANUAL_REQUIRED" ? null : timestamp,
        expiresAt: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      this.reconAuthorizations.set(authorization.id, authorization);
      recommendation.status = authorization.decision === "AUTHORIZED"
        ? "AUTHORIZED"
        : authorization.decision === "DECLINED"
          ? "DECLINED"
          : "AUTHORIZATION_PENDING";
      recommendation.version += 1;
      recommendation.updatedAt = timestamp;

      if (authorization.decision === "AUTHORIZED") {
        alreadyAuthorizedCost += authorization.authorizedAmount;
        this.host.addAudit(inspectionId, actor, "recon.item_auto_authorized", {
          recommendationId,
          authorizationId: authorization.id,
          authorizationSource: authorization.authorizationSource,
          authorizedAmount: authorization.authorizedAmount,
          policySnapshot: snapshot
        });
        this.emit("recon.item_auto_authorized", inspectionId, actor, {
          recommendationId,
          authorizationId: authorization.id,
          authorizationSource: authorization.authorizationSource,
          authorizedAmount: authorization.authorizedAmount
        });
      } else if (authorization.decision === "PENDING") {
        this.host.addAudit(inspectionId, actor, "recon.authorization_requested", {
          recommendationId,
          authorizationId: authorization.id,
          reason: authorization.decisionReason
        });
        this.emit("recon.authorization_requested", inspectionId, actor, {
          recommendationId,
          authorizationId: authorization.id
        });
      } else {
        this.host.addAudit(inspectionId, actor, "recon.item_declined", {
          recommendationId,
          authorizationId: authorization.id,
          reason: authorization.decisionReason,
          source: "CONSIGNOR_POLICY"
        });
        this.emit("recon.item_declined", inspectionId, actor, {
          recommendationId,
          authorizationId: authorization.id
        });
      }
    }

    this.generateAuthorizedWorkOrders(inspectionId, actor);
    this.updateProjectedGrade(inspectionId);
    this.assessReadiness(inspectionId, actor);
    return this.operationsRecord(inspectionId, actor);
  }

  decideAuthorization(
    authorizationId: string,
    input: {
      decision: "APPROVE" | "DECLINE" | "REQUEST_REVISION";
      decisionReason: string;
      authorizedAmount?: number;
      expectedVersion: number;
    },
    actor: Actor,
    source: "CONSIGNOR_USER" | "ADMINISTRATIVE_OVERRIDE" = "CONSIGNOR_USER",
    overrideReason?: string
  ): ReconAuthorization {
    const authorization = this.getAuthorization(authorizationId);
    if (authorization.version !== input.expectedVersion) {
      throw versionConflict("recon authorization", input.expectedVersion, authorization.version);
    }
    const recommendation = this.getRecommendation(authorization.recommendationId);
    if (authorization.decision !== "PENDING" && recommendation.status !== "REAUTHORIZATION_REQUIRED") {
      throw conflict("Only pending or reauthorization-required items can receive a decision.");
    }
    const timestamp = now();
    authorization.consignorUserId = source === "CONSIGNOR_USER" ? actor.id : null;
    authorization.authorizationSource = source;
    authorization.decisionReason = source === "ADMINISTRATIVE_OVERRIDE"
      ? `${input.decisionReason} Administrative override: ${overrideReason}`
      : input.decisionReason;
    authorization.decisionTimestamp = timestamp;
    authorization.updatedAt = timestamp;
    authorization.version += 1;

    if (input.decision === "APPROVE") {
      authorization.decision = "AUTHORIZED";
      authorization.authorizedAmount = input.authorizedAmount ?? recommendation.estimatedCost;
      recommendation.status = "AUTHORIZED";
    } else if (input.decision === "DECLINE") {
      authorization.decision = "DECLINED";
      authorization.authorizedAmount = 0;
      recommendation.status = "DECLINED";
    } else {
      authorization.decision = "REVISION_REQUESTED";
      authorization.authorizedAmount = 0;
      recommendation.status = "DRAFT";
    }
    recommendation.version += 1;
    recommendation.updatedAt = timestamp;

    const eventType = authorization.decision === "AUTHORIZED"
      ? "recon.item_authorized"
      : authorization.decision === "DECLINED"
        ? "recon.item_declined"
        : "recon.estimate_revision_requested";
    this.host.addAudit(authorization.inspectionId, actor, eventType, {
      authorizationId,
      recommendationId: recommendation.id,
      decision: authorization.decision,
      authorizationSource: authorization.authorizationSource,
      authorizedAmount: authorization.authorizedAmount,
      decisionReason: authorization.decisionReason
    });
    if (eventType !== "recon.estimate_revision_requested") {
      this.emit(eventType, authorization.inspectionId, actor, {
        authorizationId,
        recommendationId: recommendation.id,
        authorizationSource: authorization.authorizationSource,
        authorizedAmount: authorization.authorizedAmount
      });
    }
    this.generateAuthorizedWorkOrders(authorization.inspectionId, actor);
    this.refreshWorkOrderAuthorizations(authorization.inspectionId);
    this.updateProjectedGrade(authorization.inspectionId);
    this.assessReadiness(authorization.inspectionId, actor);
    return authorization;
  }

  generateAuthorizedWorkOrders(inspectionId: string, actor: Actor): WorkOrder[] {
    const intake = this.requireIntake(inspectionId);
    const sale = this.saleAssignmentForInspection(inspectionId);
    if (!sale) throw conflict("A sale assignment is required before work-order generation.");
    const generated: WorkOrder[] = [];
    const authorized = this.authorizationsForInspection(inspectionId).filter((item) => item.decision === "AUTHORIZED");

    for (const authorization of authorized) {
      const existingTask = [...this.workOrderTasks.values()].find((task) => task.recommendationId === authorization.recommendationId);
      if (existingTask) continue;
      const recommendation = this.getRecommendation(authorization.recommendationId);
      let workOrder = this.workOrdersForInspection(inspectionId).find((candidate) =>
        candidate.serviceDepartment === recommendation.serviceType &&
        candidate.facility === intake.facility &&
        candidate.status !== "COMPLETED"
      );
      if (!workOrder) {
        const timestamp = now();
        workOrder = {
          id: id(),
          workOrderNumber: nextWorkOrderNumber(this.workOrders.size),
          inspectionId,
          facility: intake.facility,
          serviceDepartment: recommendation.serviceType,
          authorizedAmount: 0,
          currentEstimatedCost: 0,
          actualCost: null,
          assignedTechnician: null,
          instructions: recommendation.recommendedAction,
          saleDeadline: sale.saleDateTime,
          status: "QUEUED",
          blockedReason: null,
          version: 1,
          createdAt: timestamp,
          startedAt: null,
          completedAt: null,
          updatedAt: timestamp
        };
        this.workOrders.set(workOrder.id, workOrder);
        generated.push(workOrder);
      }
      const task: WorkOrderTask = {
        id: id(),
        workOrderId: workOrder.id,
        recommendationId: recommendation.id,
        description: recommendation.recommendedAction,
        authorizedAmount: authorization.authorizedAmount,
        status: "QUEUED",
        createdAt: now(),
        updatedAt: now()
      };
      this.workOrderTasks.set(task.id, task);
      workOrder.authorizedAmount += authorization.authorizedAmount;
      workOrder.currentEstimatedCost += recommendation.estimatedCost;
      workOrder.updatedAt = now();
      this.host.addAudit(inspectionId, actor, "work_order.created", {
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        recommendationId: recommendation.id,
        authorizedAmount: authorization.authorizedAmount,
        serviceDepartment: workOrder.serviceDepartment
      });
      this.emit("work_order.created", inspectionId, actor, {
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        serviceDepartment: workOrder.serviceDepartment
      });
    }
    return generated;
  }

  updateWorkOrder(workOrderId: string, input: WorkOrderUpdate, actor: Actor): WorkOrder {
    const workOrder = this.getWorkOrder(workOrderId);
    if (workOrder.version !== input.expectedVersion) {
      throw versionConflict("work order", input.expectedVersion, workOrder.version);
    }
    const timestamp = now();
    if (input.action === "ASSIGN_TECHNICIAN") {
      if (!input.assignedTechnician) throw conflict("A technician is required for assignment.");
      workOrder.assignedTechnician = input.assignedTechnician;
    } else if (input.action === "START") {
      const unauthorizedTask = this.tasksForWorkOrder(workOrder.id).find((task) =>
        this.latestAuthorizationForRecommendation(task.recommendationId)?.decision !== "AUTHORIZED"
      );
      if (unauthorizedTask) {
        throw conflict("Every active work-order task must be authorized before work can start.", {
          workOrderId,
          taskId: unauthorizedTask.id
        });
      }
      const tolerance = this.policyForInspection(workOrder.inspectionId)?.costOverrunTolerance ?? 0;
      if (workOrder.currentEstimatedCost > workOrder.authorizedAmount + tolerance) {
        throw conflict("The current estimate exceeds authorization and must be reauthorized before work can start.", {
          authorizedAmount: workOrder.authorizedAmount,
          currentEstimatedCost: workOrder.currentEstimatedCost,
          tolerance
        });
      }
      assertBusinessTransition("work order", workOrderTransitions, workOrder.status, "IN_PROGRESS");
      workOrder.status = "IN_PROGRESS";
      workOrder.startedAt ??= timestamp;
      workOrder.blockedReason = null;
      this.emit("work_order.started", workOrder.inspectionId, actor, { workOrderId });
    } else if (input.action === "BLOCK") {
      if (!input.blockedReason) throw conflict("A blocked reason is required.");
      assertBusinessTransition("work order", workOrderTransitions, workOrder.status, "BLOCKED");
      workOrder.status = "BLOCKED";
      workOrder.blockedReason = input.blockedReason;
      this.emit("work_order.blocked", workOrder.inspectionId, actor, { workOrderId, blockedReason: input.blockedReason });
    } else if (input.action === "REVISE_ESTIMATE") {
      if (input.currentEstimatedCost === undefined) throw conflict("A revised estimate is required.");
      workOrder.currentEstimatedCost = input.currentEstimatedCost;
      const tolerance = this.policyForInspection(workOrder.inspectionId)?.costOverrunTolerance ?? 0;
      if (workOrder.currentEstimatedCost > workOrder.authorizedAmount + tolerance) {
        workOrder.status = "BLOCKED";
        workOrder.blockedReason = "Revised estimate exceeds authorized amount and tolerance.";
        for (const task of this.tasksForWorkOrder(workOrder.id)) {
          const recommendation = this.getRecommendation(task.recommendationId);
          recommendation.status = "REAUTHORIZATION_REQUIRED";
          recommendation.version += 1;
          recommendation.updatedAt = timestamp;
          const authorization = this.latestAuthorizationForRecommendation(recommendation.id);
          if (authorization) {
            authorization.decision = "PENDING";
            authorization.authorizationSource = null;
            authorization.decisionReason = workOrder.blockedReason;
            authorization.decisionTimestamp = null;
            authorization.updatedAt = timestamp;
            authorization.version += 1;
          }
        }
        this.host.addAudit(workOrder.inspectionId, actor, "recon.reauthorization_required", {
          workOrderId,
          authorizedAmount: workOrder.authorizedAmount,
          revisedEstimate: workOrder.currentEstimatedCost,
          tolerance
        });
        this.emit("recon.reauthorization_required", workOrder.inspectionId, actor, {
          workOrderId,
          authorizedAmount: workOrder.authorizedAmount,
          revisedEstimate: workOrder.currentEstimatedCost
        });
      }
    } else if (input.action === "SEND_TO_QC") {
      assertBusinessTransition("work order", workOrderTransitions, workOrder.status, "QC_REQUIRED");
      workOrder.status = "QC_REQUIRED";
      for (const task of this.tasksForWorkOrder(workOrder.id)) {
        task.status = "COMPLETED";
        task.updatedAt = timestamp;
      }
    } else if (input.action === "COMPLETE") {
      const qc = this.latestQualityControlForWorkOrder(workOrder.id);
      if (qc?.status !== "PASSED") throw conflict("Quality control must pass before work can be completed.");
      assertBusinessTransition("work order", workOrderTransitions, workOrder.status, "COMPLETED");
      workOrder.status = "COMPLETED";
      workOrder.actualCost = input.actualCost ?? workOrder.currentEstimatedCost;
      workOrder.completedAt = timestamp;
      this.emit("work_order.completed", workOrder.inspectionId, actor, { workOrderId, actualCost: workOrder.actualCost });
    }
    workOrder.version += 1;
    workOrder.updatedAt = timestamp;
    this.host.addAudit(workOrder.inspectionId, actor, "work_order.updated", {
      workOrderId,
      action: input.action,
      status: workOrder.status,
      assignedTechnician: workOrder.assignedTechnician,
      currentEstimatedCost: workOrder.currentEstimatedCost,
      blockedReason: workOrder.blockedReason
    });
    this.assessReadiness(workOrder.inspectionId, actor);
    return workOrder;
  }

  recordQualityControl(workOrderId: string, input: QualityControlDecision, actor: Actor): QualityControlResult {
    const workOrder = this.getWorkOrder(workOrderId);
    if (workOrder.version !== input.expectedVersion) {
      throw versionConflict("work order", input.expectedVersion, workOrder.version);
    }
    if (workOrder.status !== "QC_REQUIRED") throw conflict("Work order must be QC_REQUIRED before a quality-control decision.");
    const result: QualityControlResult = {
      id: id(),
      workOrderId,
      status: input.decision === "PASS" ? "PASSED" : "FAILED",
      notes: input.notes,
      inspectedByUserId: actor.id,
      inspectedAt: now()
    };
    this.qualityControlResults.set(result.id, result);
    if (result.status === "PASSED") {
      workOrder.status = "COMPLETED";
      workOrder.completedAt = result.inspectedAt;
      workOrder.actualCost ??= workOrder.currentEstimatedCost;
      this.emit("quality_control.passed", workOrder.inspectionId, actor, { workOrderId, qualityControlResultId: result.id });
      this.emit("work_order.completed", workOrder.inspectionId, actor, { workOrderId, actualCost: workOrder.actualCost });
    } else {
      workOrder.status = "IN_PROGRESS";
      workOrder.blockedReason = `QC failed: ${input.notes}`;
      this.emit("quality_control.failed", workOrder.inspectionId, actor, { workOrderId, qualityControlResultId: result.id });
    }
    workOrder.version += 1;
    workOrder.updatedAt = result.inspectedAt;
    this.host.addAudit(workOrder.inspectionId, actor, `quality_control.${result.status.toLowerCase()}`, {
      workOrderId,
      qualityControlResultId: result.id,
      notes: result.notes
    });
    this.assessReadiness(workOrder.inspectionId, actor);
    return result;
  }

  assessReadiness(inspectionId: string, actor: Actor): SaleReadinessAssessment {
    const intake = this.requireIntake(inspectionId);
    const sale = this.saleAssignmentForInspection(inspectionId);
    if (!sale) throw conflict("Sale assignment is missing.");
    const report = this.host.latestFinalReport(inspectionId);
    const recommendations = this.recommendationsForInspection(inspectionId);
    const authorizations = this.authorizationsForInspection(inspectionId);
    const workOrders = this.workOrdersForInspection(inspectionId);
    const requiredDecisionPending = recommendations.some((recommendation) =>
      recommendation.status === "DRAFT" ||
      recommendation.status === "AUTHORIZATION_PENDING" ||
      recommendation.status === "REAUTHORIZATION_REQUIRED"
    );
    const reauthorizationRequired = recommendations.some((recommendation) => recommendation.status === "REAUTHORIZATION_REQUIRED");
    const requiredWorkComplete = workOrders.every((workOrder) => workOrder.status === "COMPLETED");
    const failedQc = workOrders.some((workOrder) => this.latestQualityControlForWorkOrder(workOrder.id)?.status === "FAILED");
    const qualityControlPassed = workOrders.length === 0 || workOrders.every((workOrder) =>
      this.latestQualityControlForWorkOrder(workOrder.id)?.status === "PASSED"
    );
    const existingBlockers = this.host.readinessIssues(inspectionId)
      .filter((issue) => issue.severity === "blocker" && issue.type !== "final_report_missing")
      .map((issue) => issue.label);
    const result = assessSaleReadiness({
      requiredEvidenceComplete: this.host.missingRequiredEvidence(inspectionId).length === 0,
      conditionReportPublished: Boolean(report?.finalizedAt),
      requiredReconDecisionsComplete: !requiredDecisionPending,
      authorizedRequiredWorkComplete: requiredWorkComplete,
      reauthorizationRequired,
      qualityControlPassed,
      qualityControlFailed: failedQc,
      disclosuresComplete: Boolean(report?.finalizedAt),
      otherBlockingIssues: existingBlockers
    });
    const previous = this.latestReadinessForInspection(inspectionId);
    const assessment: SaleReadinessAssessment = {
      id: id(),
      inspectionId,
      saleReady: result.saleReady,
      status: result.status,
      blockers: result.blockers,
      assessedByUserId: actor.id,
      assessedAt: now()
    };
    this.saleReadinessAssessments.set(assessment.id, assessment);
    sale.status = assessment.status;
    sale.updatedAt = assessment.assessedAt;
    if (!previous || previous.saleReady !== assessment.saleReady || JSON.stringify(previous.blockers) !== JSON.stringify(assessment.blockers)) {
      this.host.addAudit(inspectionId, actor, "vehicle.sale_readiness_changed", {
        previousStatus: previous?.status ?? null,
        status: assessment.status,
        blockers: assessment.blockers
      });
      this.emit("vehicle.sale_readiness_changed", inspectionId, actor, {
        status: assessment.status,
        blockerCodes: assessment.blockers.map((blocker) => blocker.code)
      });
    }
    intake.updatedAt = assessment.assessedAt;
    return assessment;
  }

  operationsRecord(inspectionId: string, actor: Actor): ReconOperationsRecord {
    const inspection = this.host.getInspection(inspectionId);
    const intake = this.requireIntake(inspectionId);
    const consignor = this.getConsignorAccount(intake.consignorAccountId);
    const saleAssignment = this.saleAssignmentForInspection(inspectionId);
    if (!saleAssignment) throw conflict("Sale assignment is missing.");
    const policy = this.policyForAccount(consignor.id);
    const recommendations = this.recommendationsForInspection(inspectionId);
    const authorizations = this.authorizationsForInspection(inspectionId);
    const workOrders = this.workOrdersForInspection(inspectionId).map((workOrder) => ({
      ...workOrder,
      tasks: this.tasksForWorkOrder(workOrder.id),
      qualityControl: this.latestQualityControlForWorkOrder(workOrder.id)
    }));
    const totals = calculateReconTotals(recommendations.map((recommendation) => {
      const authorization = this.latestAuthorizationForRecommendation(recommendation.id);
      return {
        estimatedCost: recommendation.estimatedCost,
        authorizationStatus: authorization?.decision === "AUTHORIZED"
          ? "AUTHORIZED" as const
          : authorization?.decision === "DECLINED"
            ? "DECLINED" as const
            : "PENDING" as const,
        authorizationSource: authorization?.authorizationSource ?? null
      };
    }));
    const readiness = this.latestReadinessForInspection(inspectionId) ?? this.assessReadiness(inspectionId, actor);
    const retakes = this.host.readinessIssues(inspectionId).filter((issue) => issue.type === "image_quality_retake").length;
    const urgency = calculateUrgency({
      hoursUntilSale: hoursBetween(now(), saleAssignment.saleDateTime),
      conditionReportPublished: Boolean(this.host.latestFinalReport(inspectionId)?.finalizedAt),
      missingRequiredEvidence: this.host.missingRequiredEvidence(inspectionId).length,
      requiredRetakes: retakes,
      authorizationAwaitingDecision: authorizations.some((authorization) => authorization.decision === "PENDING"),
      approvedWorkOverdue: workOrders.some((workOrder) => workOrder.status !== "COMPLETED" && new Date(workOrder.saleDeadline) < new Date(now())),
      reauthorizationRequired: recommendations.some((recommendation) => recommendation.status === "REAUTHORIZATION_REQUIRED"),
      failedQualityControl: workOrders.some((workOrder) => workOrder.qualityControl?.status === "FAILED"),
      wrongFacilityLocation: workOrders.some((workOrder) => workOrder.facility !== intake.facility)
    });
    const reconStatus = this.reconStatus(inspectionId);
    const estimatedCompletionHours = recommendations
      .filter((recommendation) => recommendation.status === "AUTHORIZED")
      .reduce((sum, recommendation) => sum + recommendation.estimatedDurationHours, 0);
    return {
      inspection,
      intake,
      consignor,
      saleAssignment,
      conditionGrade: this.host.latestGrade(inspectionId),
      conditionReport: this.host.latestFinalReport(inspectionId),
      damageItems: this.host.listDamage(inspectionId),
      photos: this.host.listPhotos(inspectionId),
      policy,
      recommendations,
      authorizations,
      workOrders,
      reconStatus,
      urgency,
      readiness,
      totals: {
        ...totals,
        remainingAccountAuthorization: Math.max(0, (policy?.totalVehicleLimit ?? 0) - totals.automaticallyAuthorizedCost - totals.manuallyAuthorizedCost)
      },
      estimatedCompletion: estimatedCompletionHours > 0
        ? new Date(Date.parse(now()) + estimatedCompletionHours * 3_600_000).toISOString()
        : null
    };
  }

  listOperations(actor: Actor): ReconOperationsRecord[] {
    return [...this.vehicleIntakes.values()]
      .map((intake) => this.operationsRecord(intake.inspectionId, actor))
      .sort((left, right) => {
        const urgencyDifference = right.urgency.urgencyScore - left.urgency.urgencyScore;
        if (urgencyDifference !== 0) return urgencyDifference;
        return left.saleAssignment.saleDateTime.localeCompare(right.saleAssignment.saleDateTime);
      });
  }

  getConsignorAccount(accountId: string): ConsignorAccount {
    const account = this.consignorAccounts.get(accountId);
    if (!account) throw notFound("Consignor account not found.");
    return account;
  }

  policyForAccount(accountId: string): ReconAuthorizationPolicy | null {
    return [...this.reconPolicies.values()]
      .filter((policy) => policy.consignorAccountId === accountId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  }

  policyForInspection(inspectionId: string): ReconAuthorizationPolicy | null {
    const intake = this.intakeForInspection(inspectionId);
    return intake ? this.policyForAccount(intake.consignorAccountId) : null;
  }

  intakeForInspection(inspectionId: string): VehicleIntake | null {
    return [...this.vehicleIntakes.values()].find((intake) => intake.inspectionId === inspectionId) ?? null;
  }

  saleAssignmentForInspection(inspectionId: string): SaleAssignment | null {
    return [...this.saleAssignments.values()].find((sale) => sale.inspectionId === inspectionId) ?? null;
  }

  recommendationsForInspection(inspectionId: string): ReconRecommendation[] {
    return [...this.reconRecommendations.values()]
      .filter((recommendation) => recommendation.inspectionId === inspectionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  authorizationsForInspection(inspectionId: string): ReconAuthorization[] {
    return [...this.reconAuthorizations.values()]
      .filter((authorization) => authorization.inspectionId === inspectionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  workOrdersForInspection(inspectionId: string): WorkOrder[] {
    return [...this.workOrders.values()]
      .filter((workOrder) => workOrder.inspectionId === inspectionId)
      .sort((left, right) => left.workOrderNumber.localeCompare(right.workOrderNumber));
  }

  tasksForWorkOrder(workOrderId: string): WorkOrderTask[] {
    return [...this.workOrderTasks.values()].filter((task) => task.workOrderId === workOrderId);
  }

  getRecommendation(recommendationId: string): ReconRecommendation {
    const recommendation = this.reconRecommendations.get(recommendationId);
    if (!recommendation) throw notFound("Recon recommendation not found.");
    return recommendation;
  }

  getAuthorization(authorizationId: string): ReconAuthorization {
    const authorization = this.reconAuthorizations.get(authorizationId);
    if (!authorization) throw notFound("Recon authorization not found.");
    return authorization;
  }

  getWorkOrder(workOrderId: string): WorkOrder {
    const workOrder = this.workOrders.get(workOrderId);
    if (!workOrder) throw notFound("Work order not found.");
    return workOrder;
  }

  latestAuthorizationForRecommendation(recommendationId: string): ReconAuthorization | null {
    return [...this.reconAuthorizations.values()]
      .filter((authorization) => authorization.recommendationId === recommendationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  latestQualityControlForWorkOrder(workOrderId: string): QualityControlResult | null {
    return [...this.qualityControlResults.values()]
      .filter((result) => result.workOrderId === workOrderId)
      .at(-1) ?? null;
  }

  latestReadinessForInspection(inspectionId: string): SaleReadinessAssessment | null {
    return [...this.saleReadinessAssessments.values()]
      .filter((assessment) => assessment.inspectionId === inspectionId)
      .at(-1) ?? null;
  }

  userCanAccessConsignor(actor: Actor, inspectionId: string): boolean {
    if (actor.role === "admin" || actor.role === "reviewer" || actor.role === "recon_coordinator") return true;
    const intake = this.intakeForInspection(inspectionId);
    if (!intake) return false;
    const account = this.getConsignorAccount(intake.consignorAccountId);
    if (actor.role === "consignor_approver") return account.authorizedUserIds.includes(actor.id);
    if (actor.role === "technician") {
      return this.workOrdersForInspection(inspectionId).some((workOrder) => workOrder.assignedTechnician === actor.id || workOrder.assignedTechnician === actor.name);
    }
    return false;
  }

  private requireIntake(inspectionId: string): VehicleIntake {
    const intake = this.intakeForInspection(inspectionId);
    if (!intake) throw notFound("Vehicle intake not found for this inspection.");
    return intake;
  }

  private recordLocation(
    inspectionId: string,
    input: Pick<IntakeInput, "facility" | "yardZone" | "parkingSpace">,
    reason: string,
    actor: Actor
  ): VehicleLocationEvent {
    const event: VehicleLocationEvent = {
      id: id(),
      inspectionId,
      facility: input.facility,
      yardZone: input.yardZone,
      parkingSpace: input.parkingSpace,
      reason,
      actorId: actor.id,
      createdAt: now()
    };
    this.vehicleLocationEvents.set(event.id, event);
    return event;
  }

  private reconStatus(inspectionId: string): ReconAuthorizationStatus {
    const recommendations = this.recommendationsForInspection(inspectionId);
    if (recommendations.length === 0 || recommendations.every((item) => item.status === "DRAFT")) return "ESTIMATE_PENDING";
    if (recommendations.some((item) => item.status === "REAUTHORIZATION_REQUIRED")) return "REAUTHORIZATION_REQUIRED";
    const authorized = recommendations.filter((item) => item.status === "AUTHORIZED").length;
    const declined = recommendations.filter((item) => item.status === "DECLINED").length;
    const pending = recommendations.filter((item) => item.status === "AUTHORIZATION_PENDING").length;
    if (authorized > 0 && (declined > 0 || pending > 0)) return "PARTIALLY_AUTHORIZED";
    if (pending > 0) return "AUTHORIZATION_PENDING";
    if (authorized > 0 && declined > 0) return "PARTIALLY_AUTHORIZED";
    if (authorized === recommendations.length) return "AUTHORIZED";
    if (declined === recommendations.length) return "DECLINED";
    return "AUTHORIZATION_PENDING";
  }

  private updateProjectedGrade(inspectionId: string): void {
    const grade = this.host.latestGrade(inspectionId);
    if (!grade) return;
    const recommendations = this.recommendationsForInspection(inspectionId);
    grade.estimatedGradeAfterRecon = estimateGradeAfterAuthorizedRecon(
      grade.approvedGrade ?? grade.conditionGradeBeforeRecon,
      recommendations.map((recommendation) => ({
        expectedGradeLift: recommendation.expectedGradeLift,
        authorizationStatus: recommendation.status === "AUTHORIZED"
          ? "AUTHORIZED" as const
          : recommendation.status === "DECLINED"
            ? "DECLINED" as const
            : "PENDING" as const
      }))
    );
  }

  private refreshWorkOrderAuthorizations(inspectionId: string): void {
    for (const workOrder of this.workOrdersForInspection(inspectionId)) {
      let authorizedAmount = 0;
      for (const task of this.tasksForWorkOrder(workOrder.id)) {
        const authorization = this.latestAuthorizationForRecommendation(task.recommendationId);
        if (authorization?.decision === "AUTHORIZED") {
          task.authorizedAmount = authorization.authorizedAmount;
          if (task.status === "CANCELLED") task.status = "QUEUED";
          authorizedAmount += authorization.authorizedAmount;
        } else if (authorization?.decision === "DECLINED") {
          task.status = "CANCELLED";
        }
        task.updatedAt = now();
      }
      workOrder.authorizedAmount = authorizedAmount;
      workOrder.updatedAt = now();
    }
  }

  private emit(
    eventType: DomainEventOutbox["eventType"],
    inspectionId: string,
    actor: Actor,
    payload: Record<string, unknown>
  ): void {
    const consignorAccountId = this.intakeForInspection(inspectionId)?.consignorAccountId;
    this.host.emitDomainEvent(eventType, inspectionId, actor, {
      ...(consignorAccountId ? { consignorAccountId } : {}),
      ...payload
    });
  }
}
