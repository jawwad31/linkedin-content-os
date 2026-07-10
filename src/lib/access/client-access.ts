import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  canRoleManageClientSetup,
  canRoleManageClientUsers,
  canRoleManageResearchSources,
  canRoleManageWorkflowReview,
  canRoleMutateClientWorkflow,
  canRoleRunResearchAgent,
  canRoleViewOperationalLogs,
  type AgencyRole,
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

export async function getCurrentUserRoleForClient(
  userId: string,
  clientId: string,
): Promise<EffectiveClientRole | null> {
  return (
    (await getUserAgencyRoleForClient(userId, clientId)) ??
    (await getUserClientRole(userId, clientId))
  );
}

export async function canAccessClient(
  userId: string,
  clientId: string,
): Promise<boolean> {
  return Boolean(await getCurrentUserRoleForClient(userId, clientId));
}

export async function canMutateClientWorkflow(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const role = await getCurrentUserRoleForClient(userId, clientId);
  return role ? canRoleMutateClientWorkflow(role) : false;
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

  const role = await getCurrentUserRoleForClient(user.id, clientIdResult.data);
  if (!role) return { ok: false };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, agency_id, agencies(name)")
    .eq("id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<ClientShellRow>();

  if (error || !data) return { ok: false };

  const accessibleClientCount =
    role === "agency_admin"
      ? 0
      : await getDirectClientAccessCount(user.id);

  return {
    ok: true,
    clientId: data.id,
    clientName: data.name,
    agencyId: data.agency_id,
    agencyName: data.agencies?.name ?? null,
    role,
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
