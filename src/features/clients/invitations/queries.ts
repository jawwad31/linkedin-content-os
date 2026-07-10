import "server-only";

import { getCurrentUserRoleForClient } from "@/lib/access/client-access";
import { createClient } from "@/lib/supabase/server";

import type { ClientRole } from "./schemas";

export { getCurrentUserRoleForClient };

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
 * All non-revoked direct Client Workspace access rows for one workspace.
 * Agency admins have implicit access through agency_members and are not
 * duplicated into this list.
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
