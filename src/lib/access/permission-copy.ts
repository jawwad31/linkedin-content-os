import { CLIENT_PERMISSION_LABELS, hasClientPermission, type ClientPermission, type EffectiveClientRole } from "./roles";

/** Capability names as the Virel Phase 1 wireframes (1h, 5d) show them: one list, shared with the Team access screen. */
export const CAPABILITY_DISPLAY_NAMES: Record<ClientPermission, string> = CLIENT_PERMISSION_LABELS;

/** The capabilities from `required` that this person does not hold. Admins hold all of them. */
export function missingPermissions(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[],
  required: readonly ClientPermission[],
): ClientPermission[] {
  return required.filter((permission) => !hasClientPermission(role, permissions, permission));
}

/**
 * The one-line reason shown beside a disabled control, for example
 * "You cannot draft posts. Ask an account admin to add the Draft posts capability."
 * `action` is a short verb phrase such as "draft posts". Returns null when nothing is missing.
 */
export function cannotReason(action: string, missing: readonly ClientPermission[]): string | null {
  if (missing.length === 0) return null;
  const names = missing.map((permission) => CAPABILITY_DISPLAY_NAMES[permission]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const noun = names.length > 1 ? "capabilities" : "capability";
  return `You cannot ${action}. Ask an account admin to add the ${list} ${noun}.`;
}
