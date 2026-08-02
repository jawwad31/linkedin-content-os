import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  CLIENT_PERMISSIONS,
  canRoleManageClientSetup,
  canRoleManageClientUsers,
  canRoleManageResearchSources,
  canRoleManageWorkflowReview,
  canRoleRunResearchAgent,
  canRoleViewOperationalLogs,
  type AgencyRole,
  type ClientAccessContext,
  type ClientPermission,
  type ClientRole,
  type EffectiveClientRole,
} from "./roles";

const uuidSchema = z.string().uuid();

export type ClientShellAccess =
  | {
      ok: true;
      clientId: string;
      clientName: string;
      agencyId: string;
      agencyName: string | null;
      role: EffectiveClientRole;
      permissions: ClientPermission[];
      accessibleClientCount: number;
    }
  | { ok: false };

type ClientShellRow = {
  id: string;
  name: string;
  agency_id: string;
  agencies: { name: string | null } | null;
};

type RoleRow<T extends string> = { role: T };
type ClientAccessRow = {
  role: ClientRole;
  permissions: unknown;
};

function toClientPermissions(value: unknown): ClientPermission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(CLIENT_PERMISSIONS);
  return value.filter(
    (permission): permission is ClientPermission =>
      typeof permission === "string" && allowed.has(permission),
  );
}

export async function getUserAgencyRoleForClient(
  userId: string,
  clientId: string,
): Promise<AgencyRole | null> {
  const supabase = await createClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("agency_id")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<{ agency_id: string }>();

  if (clientError || !client) return null;

  const { data, error } = await supabase
    .from("agency_members")
    .select("role")
    .eq("agency_id", client.agency_id)
    .eq("user_id", userId)
    .eq("role", "agency_admin")
    .eq("invitation_status", "accepted")
    .maybeSingle<RoleRow<AgencyRole>>();

  if (error || !data) return null;
  return data.role;
}

export async function getUserClientRole(
  userId: string,
  clientId: string,
): Promise<ClientRole | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_access")
    .select("role")
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .eq("invitation_status", "accepted")
    .maybeSingle<RoleRow<ClientRole>>();

  if (error || !data) return null;
  return data.role;
}

export async function getUserClientAccess(
  userId: string,
  clientId: string,
): Promise<ClientAccessRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_access")
    .select("role, permissions")
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .eq("invitation_status", "accepted")
    .maybeSingle<ClientAccessRow>();

  if (error || !data) return null;
  return data;
}

export async function getCurrentUserAccessForClient(
  userId: string,
  clientId: string,
): Promise<ClientAccessContext | null> {
  const agencyRole = await getUserAgencyRoleForClient(userId, clientId);
  if (agencyRole) return { role: agencyRole, permissions: [] };

  const access = await getUserClientAccess(userId, clientId);
  if (!access) return null;

  return {
    role: access.role,
    permissions: toClientPermissions(access.permissions),
  };
}

export async function getCurrentUserRoleForClient(
  userId: string,
  clientId: string,
): Promise<EffectiveClientRole | null> {
  return (await getCurrentUserAccessForClient(userId, clientId))?.role ?? null;
}

async function canUseClientPermission(
  userId: string,
  clientId: string,
  permission: ClientPermission,
): Promise<boolean> {
  const access = await getCurrentUserAccessForClient(userId, clientId);
  if (!access) return false;
  return (
    access.role === "agency_admin" ||
    access.role === "client_admin" ||
    access.permissions.includes(permission)
  );
}

export function canContributeResearch(userId: string, clientId: string) {
  return canUseClientPermission(userId, clientId, "research_contribute");
}

export function canManageFounderExperiences(userId: string, clientId: string) {
  return canUseClientPermission(userId, clientId, "founder_experience_manage");
}

export function canManageIdeas(userId: string, clientId: string) {
  return canUseClientPermission(userId, clientId, "ideas_manage");
}

export function canDraftPosts(userId: string, clientId: string) {
  return canUseClientPermission(userId, clientId, "posts_draft");
}

export function canReviewPosts(userId: string, clientId: string) {
  return canUseClientPermission(userId, clientId, "posts_review");
}

export function canPublishPosts(userId: string, clientId: string) {
  return canUseClientPermission(userId, clientId, "posts_publish");
}

export async function canAccessClient(
  userId: string,
  clientId: string,
): Promise<boolean> {
  return Boolean(await getCurrentUserRoleForClient(userId, clientId));
}

export async function canManageClientUsers(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getCurrentUserRoleForClient(userId, clientId);
  return role ? canRoleManageClientUsers(role) : false;
}

export async function canManageClientSetup(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getCurrentUserRoleForClient(userId, clientId);
  return role ? canRoleManageClientSetup(role) : false;
}

export async function canManageResearchSources(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getCurrentUserRoleForClient(userId, clientId);
  return role ? canRoleManageResearchSources(role) : false;
}

export async function canRunResearchAgent(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getCurrentUserRoleForClient(userId, clientId);
  return role ? canRoleRunResearchAgent(role) : false;
}

export async function canManageWorkflowReview(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getCurrentUserRoleForClient(userId, clientId);
  return role ? canRoleManageWorkflowReview(role) : false;
}

export async function canManageAgency(
  userId: string,
  agencyId: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agency_members")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("user_id", userId)
    .eq("role", "agency_admin")
    .eq("invitation_status", "accepted")
    .maybeSingle<{ id: string }>();

  return !error && Boolean(data);
}

export async function canViewOperationalLogs(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getUserAgencyRoleForClient(userId, clientId);
  return role ? canRoleViewOperationalLogs(role) : false;
}

/**
 * The app-level per-client authorization gate. src/proxy.ts only checks that
 * a user is authenticated, so this verifies effective Client Workspace access
 * and returns the role shown by the shell. RLS remains the backstop.
 */
export async function getClientShellAccess(
  clientId: string,
): Promise<ClientShellAccess> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) return { ok: false };

  const { user } = await getServerUser();
  if (!user) return { ok: false };

  const currentAccess = await getCurrentUserAccessForClient(
    user.id,
    clientIdResult.data,
  );
  if (!currentAccess) return { ok: false };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, agency_id, agencies(name)")
    .eq("id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<ClientShellRow>();

  if (error || !data) return { ok: false };

  const accessibleClientCount =
    currentAccess.role === "agency_admin"
      ? 0
      : await getDirectClientAccessCount(user.id);

  return {
    ok: true,
    clientId: data.id,
    clientName: data.name,
    agencyId: data.agency_id,
    agencyName: data.agencies?.name ?? null,
    role: currentAccess.role,
    permissions: currentAccess.permissions,
    accessibleClientCount,
  };
}

async function getDirectClientAccessCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_access")
    .select("client_id")
    .eq("user_id", userId)
    .eq("invitation_status", "accepted")
    .returns<{ client_id: string }[]>();

  if (error) return 0;

  return new Set(data.map((row) => row.client_id)).size;
}

export async function canUserDeleteBusinessRecords(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getCurrentUserRoleForClient(userId, clientId);
  return role === "agency_admin" || role === "client_admin";
}
