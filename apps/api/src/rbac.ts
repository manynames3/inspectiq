import { canRole, roleActionLabels, rolesForAction, type RoleAction } from "@inspectiq/shared";
import { forbidden } from "./errors.js";
import type { Actor } from "./domain.js";

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function requireAction(actor: Actor, action: RoleAction): void {
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
