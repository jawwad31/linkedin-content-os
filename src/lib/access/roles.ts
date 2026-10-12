export type AgencyRole = "agency_admin";
export type ClientRole = "client_admin" | "client_user";
export type EffectiveClientRole = AgencyRole | ClientRole;

export const CLIENT_PERMISSIONS = [
  "research_contribute",
  "founder_experience_manage",
  "ideas_manage",
  "posts_draft",
  "posts_review",
  "posts_publish",
] as const;

export type ClientPermission = (typeof CLIENT_PERMISSIONS)[number];

export const CLIENT_PERMISSION_LABELS: Record<ClientPermission, string> = {
  research_contribute: "Research",
  founder_experience_manage: "Manage experiences",
  ideas_manage: "Manage ideas",
  posts_draft: "Draft posts",
  posts_review: "Review",
  posts_publish: "Publish",
};

export const CLIENT_PERMISSION_DESCRIPTIONS: Record<ClientPermission, string> = {
  research_contribute:
    "Mark collected articles relevant or irrelevant, add trend reactions, and save research findings to the Content Bank.",
  founder_experience_manage: "Add and edit experiences in the Content Bank.",
  ideas_manage: "Add Content Bank entries to the Calendar and, together with Draft posts, create posts from them.",
  posts_draft: "Draft and redraft posts.",
  posts_review: "Mark Posts as needing edits, approve them, or reject them.",
  posts_publish: "Mark approved Posts as published.",
};

export const DEFAULT_CLIENT_USER_PERMISSIONS: ClientPermission[] = [
  "research_contribute",
  "founder_experience_manage",
  "ideas_manage",
  "posts_draft",
];

export type ClientAccessContext = {
  role: EffectiveClientRole;
  permissions: ClientPermission[];
};

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  client_admin: "Account Admin",
  client_user: "Account User",
};

export const EFFECTIVE_ROLE_LABELS: Record<EffectiveClientRole, string> = {
  agency_admin: "Agency Admin",
  ...CLIENT_ROLE_LABELS,
};

export function hasClientPermission(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[],
  permission: ClientPermission,
): boolean {
  return (
    role === "agency_admin" ||
    role === "client_admin" ||
    permissions.includes(permission)
  );
}

export function canRoleContributeResearch(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[] = [],
): boolean {
  return hasClientPermission(role, permissions, "research_contribute");
}

export function canRoleManageFounderExperiences(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[] = [],
): boolean {
  return hasClientPermission(role, permissions, "founder_experience_manage");
}

export function canRoleManageIdeas(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[] = [],
): boolean {
  return hasClientPermission(role, permissions, "ideas_manage");
}

export function canRoleDraftPosts(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[] = [],
): boolean {
  return hasClientPermission(role, permissions, "posts_draft");
}

export function canRoleReviewPosts(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[] = [],
): boolean {
  return hasClientPermission(role, permissions, "posts_review");
}

export function canRolePublishPosts(
  role: EffectiveClientRole,
  permissions: readonly ClientPermission[] = [],
): boolean {
  return hasClientPermission(role, permissions, "posts_publish");
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
