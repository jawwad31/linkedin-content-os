import "server-only";

import type { EffectiveClientRole } from "@/lib/access/roles";
import { createClient } from "@/lib/supabase/server";

export type AccessibleClient = {
  id: string;
  name: string;
  founderName: string | null;
  industry: string | null;
  updatedAt: string;
  role: EffectiveClientRole;
};

export type AccessibleClientsResult =
  | { ok: true; clients: AccessibleClient[] }
  | { ok: false };

type ClientAccessRow = {
  client_id: string;
  role: "client_admin" | "client_user";
};
type ClientRow = {
  id: string;
  name: string;
  founder_name: string | null;
  industry: string | null;
  updated_at: string;
};

/** The accounts this person belongs to. Normally one; a person added to several sees them all. */
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

  if (accessError) return { ok: false };
  if (accessRows.length === 0) return { ok: true, clients: [] };

  const { data: clientRows, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, founder_name, industry, updated_at")
    .in("id", accessRows.map((row) => row.client_id))
    .is("deleted_at", null)
    .returns<ClientRow[]>();

  if (clientsError) return { ok: false };

  const roleByClientId = new Map(accessRows.map((row) => [row.client_id, row.role]));

  const clients = clientRows
    .map((row) => {
      const role = roleByClientId.get(row.id);
      if (!role) return null;
      return {
        id: row.id,
        name: row.name,
        founderName: row.founder_name,
        industry: row.industry,
        updatedAt: row.updated_at,
        role,
      };
    })
    .filter((client): client is AccessibleClient => client !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, clients };
}
