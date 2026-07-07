import { canRole, roleActionLabels, rolesForAction, type RoleAction } from "@inspectiq/shared";
import { forbidden } from "./errors.js";
import type { Actor, Inspection } from "./domain.js";

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function requireAction(actor: Actor, action: RoleAction): void {
  if (isEvaluationActor(actor)) {
    throw forbidden("Evaluation workspace is read-only. Sign in with Cognito to perform workflow actions.", {
      action,
      actorId: actor.id,
      actorRole: actor.role
    });
  }

  if (canRole(actor.role, action)) return;

  const allowedRoles = rolesForAction(action).map(roleLabel).join(" or ");
  throw forbidden(
    `${roleLabel(actor.role)} role cannot ${roleActionLabels[action]}. Switch to ${allowedRoles}.`,
    {
      action,
      actorRole: actor.role,
      allowedRoles: rolesForAction(action)
    }
  );
}

export function isEvaluationActor(actor: Actor): boolean {
  return actor.id.startsWith("evaluation-");
}

export function canAccessInspection(actor: Actor, inspection: Inspection): boolean {
  if (actor.role === "admin" || actor.role === "reviewer") return true;
  return inspection.createdBy === actor.id || inspection.inspectorName === actor.name;
}

export function requireInspectionAccess(actor: Actor, inspection: Inspection, action = "access this inspection"): void {
  if (canAccessInspection(actor, inspection)) return;
  throw forbidden(
    `${roleLabel(actor.role)} role cannot ${action} because the inspection is assigned to another operator.`,
    {
      actorId: actor.id,
      actorRole: actor.role,
      inspectionId: inspection.id,
      createdBy: inspection.createdBy,
      inspectorName: inspection.inspectorName
    }
  );
}
