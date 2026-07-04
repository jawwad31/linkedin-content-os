import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ClientRole = "owner" | "editor" | "viewer";

export type AccessibleClient = {
  id: string;
  name: string;
  founderName: string | null;
  industry: string | null;
  updatedAt: string;
  role: ClientRole;
};

export type AccessibleClientsResult =
  | { ok: true; clients: AccessibleClient[] }
  | { ok: false };

type ClientAccessRow = { client_id: string; role: ClientRole };
type ClientRow = {
  id: string;
  name: string;
  founder_name: string | null;
  industry: string | null;
  updated_at: string;
};

/**
 * Clients the given user has accepted access to, with their role for each.
 * Always scoped by the authenticated user's own id, never by a
 * client-supplied id, and always filtered to accepted access only. RLS on
 * both tables enforces the same rules server-side as defense in depth.
 */
export async function getAccessibleClients(
  userId: string,
): Promise<AccessibleClientsResult> {
  const supabase = await createClient();

  const { data: accessRows, error: accessError } = await supabase
    .from("client_access")
    .select("client_id, role")
    .eq("user_id", userId)
    .eq("invitation_status", "accepted")
    .returns<ClientAccessRow[]>();

  if (accessError) {
    return { ok: false };
  }

  if (accessRows.length === 0) {
    return { ok: true, clients: [] };
  }

  const clientIds = accessRows.map((row) => row.client_id);

  const { data: clientRows, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, founder_name, industry, updated_at")
    .in("id", clientIds)
    .is("deleted_at", null)
    .returns<ClientRow[]>();

  if (clientsError) {
    return { ok: false };
  }

  const roleByClientId = new Map(
    accessRows.map((row) => [row.client_id, row.role]),
  );

  const clients = clientRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      founderName: row.founder_name,
      industry: row.industry,
      updatedAt: row.updated_at,
      role: roleByClientId.get(row.id),
    }))
    .filter((client): client is AccessibleClient => client.role !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, clients };
}
