export type AgencyRole = "agency_admin";
export type ClientRole = "client_admin" | "client_user";
export type EffectiveClientRole = AgencyRole | ClientRole;

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  client_admin: "Client Admin",
  client_user: "Client User",
};

export const EFFECTIVE_ROLE_LABELS: Record<EffectiveClientRole, string> = {
  agency_admin: "Agency Admin",
  ...CLIENT_ROLE_LABELS,
};

export function canRoleMutateClientWorkflow(role: EffectiveClientRole): boolean {
  return (
    role === "agency_admin" ||
    role === "client_admin" ||
    role === "client_user"
  );
}

export function canRoleManageClientUsers(role: EffectiveClientRole): boolean {
  return role === "agency_admin" || role === "client_admin";
}

export function canRoleManageClientSetup(role: EffectiveClientRole): boolean {
  return role === "agency_admin" || role === "client_admin";
}

export function canRoleManageResearchSources(
  role: EffectiveClientRole,
): boolean {
  return role === "agency_admin" || role === "client_admin";
}

export function canRoleRunResearchAgent(role: EffectiveClientRole): boolean {
  return role === "agency_admin" || role === "client_admin";
}

export function canRoleManageWorkflowReview(
  role: EffectiveClientRole,
): boolean {
  return role === "agency_admin" || role === "client_admin";
}

export function canRoleViewOperationalLogs(
  role: EffectiveClientRole,
): boolean {
  return role === "agency_admin";
}
