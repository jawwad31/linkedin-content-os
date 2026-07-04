import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { ClientRole } from "./schemas";

/**
 * The current user's role for one client, or null if they have no
 * accepted access. Always scoped by both client_id and user_id together —
 * never by client_id alone.
 */
export async function getCurrentUserRoleForClient(
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
    .maybeSingle<{ role: ClientRole }>();

  if (error || !data) return null;

  return data.role;
}

export type ClientAccessMember = {
  id: string;
  role: ClientRole;
  invitedEmail: string | null;
  invitationStatus: "pending" | "accepted" | "revoked";
  createdAt: string;
};

export type ClientAccessListResult =
  | { ok: true; members: ClientAccessMember[] }
  | { ok: false };

/**
 * All non-revoked access rows for one client (pending + accepted), for the
 * owner-only "Team Access" section. Explicitly scoped by client_id; RLS
 * additionally requires the caller to be an accepted owner of that client.
 */
export async function getClientAccessList(
  clientId: string,
): Promise<ClientAccessListResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_access")
    .select("id, role, invited_email, invitation_status, created_at")
    .eq("client_id", clientId)
    .neq("invitation_status", "revoked")
    .order("created_at", { ascending: true });

  if (error) return { ok: false };

  const members: ClientAccessMember[] = data.map((row) => ({
    id: row.id,
    role: row.role,
    invitedEmail: row.invited_email,
    invitationStatus: row.invitation_status,
    createdAt: row.created_at,
  }));

  return { ok: true, members };
}

export type PendingInvitation = {
  id: string;
  clientId: string;
  role: ClientRole;
  createdAt: string;
};

export type PendingInvitationsResult =
  | { ok: true; invitations: PendingInvitation[] }
  | { ok: false };

/**
 * Pending, unclaimed invitations for the current session's own verified
 * email. Relies entirely on RLS (client_access_select_pending_by_email) to
 * scope the result — there is no client-supplied identifier here at all.
 */
export async function getPendingInvitationsForCurrentUser(): Promise<PendingInvitationsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_access")
    .select("id, client_id, role, created_at")
    .is("user_id", null)
    .eq("invitation_status", "pending");

  if (error) return { ok: false };

  const invitations: PendingInvitation[] = data.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    role: row.role,
    createdAt: row.created_at,
  }));

  return { ok: true, invitations };
}
