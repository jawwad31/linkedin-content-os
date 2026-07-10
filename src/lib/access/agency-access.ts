import "server-only";

import { createClient } from "@/lib/supabase/server";

export type AgencyAccess = {
  agencyId: string;
  agencyName: string;
  agency: { id: string; name: string | null };
};

export type AgencyAccessFailureReason =
  | "none"
  | "multiple_memberships"
  | "query_failed";

export type AgencyAccessResult =
  | { ok: true; access: AgencyAccess }
  | { ok: false; reason: AgencyAccessFailureReason };

type AgencyMemberRow = {
  agency_id: string;
  agencies: { name: string | null } | null;
};

export async function getAgencyAccessForUser(
  userId: string,
): Promise<AgencyAccessResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agency_members")
    .select("agency_id, agencies(name)")
    .eq("user_id", userId)
    .eq("role", "agency_admin")
    .eq("invitation_status", "accepted")
    .returns<AgencyMemberRow[]>();

  if (error) {
    return { ok: false, reason: "query_failed" };
  }

  if (data.length === 0) {
    return { ok: false, reason: "none" };
  }

  if (data.length > 1) {
    return { ok: false, reason: "multiple_memberships" };
  }

  const row = data[0];
  const agency = {
    id: row.agency_id,
    name: row.agencies?.name ?? null,
  };

  return {
    ok: true,
    access: {
      agencyId: agency.id,
      agencyName: agency.name ?? "Agency",
      agency,
    },
  };
}
