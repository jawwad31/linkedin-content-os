import "server-only";

import type { EffectiveClientRole } from "@/lib/access/roles";
import { createClient } from "@/lib/supabase/server";

export type AccessibleClient = {
  id: string;
  name: string;
  agencyName: string | null;
  founderName: string | null;
  industry: string | null;
  updatedAt: string;
  role: EffectiveClientRole;
};

export type AccessibleClientsResult =
  | { ok: true; clients: AccessibleClient[] }
  | { ok: false };

type AgencyMemberRow = { agency_id: string; role: "agency_admin" };
type ClientAccessRow = {
  client_id: string;
  role: "client_admin" | "client_user";
};
type ClientRow = {
  id: string;
  name: string;
  agency_id: string;
  founder_name: string | null;
  industry: string | null;
  updated_at: string;
  agencies: { name: string | null } | null;
};

export async function getAccessibleClients(
  userId: string,
): Promise<AccessibleClientsResult> {
  const supabase = await createClient();

  const [agencyResult, accessResult] = await Promise.all([
    supabase
      .from("agency_members")
      .select("agency_id, role")
      .eq("user_id", userId)
      .eq("role", "agency_admin")
      .eq("invitation_status", "accepted")
      .returns<AgencyMemberRow[]>(),
    supabase
      .from("client_access")
      .select("client_id, role")
      .eq("user_id", userId)
      .eq("invitation_status", "accepted")
      .returns<ClientAccessRow[]>(),
  ]);

  if (agencyResult.error || accessResult.error) {
    return { ok: false };
  }

  const agencyIds = agencyResult.data.map((row) => row.agency_id);
  const directClientIds = accessResult.data.map((row) => row.client_id);

  if (agencyIds.length === 0 && directClientIds.length === 0) {
    return { ok: true, clients: [] };
  }

  let query = supabase
    .from("clients")
    .select("id, name, agency_id, founder_name, industry, updated_at, agencies(name)")
    .is("deleted_at", null);

  const filters: string[] = [];
  if (directClientIds.length > 0) {
    filters.push(`id.in.(${directClientIds.join(",")})`);
  }
  if (agencyIds.length > 0) {
    filters.push(`agency_id.in.(${agencyIds.join(",")})`);
  }
  query = query.or(filters.join(","));

  const { data: clientRows, error: clientsError } =
    await query.returns<ClientRow[]>();

  if (clientsError) {
    return { ok: false };
  }

  const agencyIdSet = new Set(agencyIds);
  const roleByClientId = new Map(
    accessResult.data.map((row) => [row.client_id, row.role]),
  );

  const clients = clientRows
    .map((row) => {
      const role = agencyIdSet.has(row.agency_id)
        ? "agency_admin"
        : roleByClientId.get(row.id);
      if (!role) return null;

      return {
        id: row.id,
        name: row.name,
        agencyName: row.agencies?.name ?? null,
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
