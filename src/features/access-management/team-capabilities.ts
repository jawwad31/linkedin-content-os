import {
  CLIENT_PERMISSION_LABELS,
  type ClientPermission,
  type ClientRole,
} from "@/lib/access/roles";

/**
 * The capability badges on a Team access row. An Account Admin holds every capability
 * (see `hasClientPermission`), so the row says so instead of listing them. An Account User
 * shows the capabilities selected on the membership; an empty list means none.
 */
export function teamCapabilityLabels(
  role: ClientRole,
  permissions: readonly ClientPermission[],
): string[] {
  if (role === "client_admin") return ["All capabilities"];
  return permissions.map((permission) => CLIENT_PERMISSION_LABELS[permission]);
}
