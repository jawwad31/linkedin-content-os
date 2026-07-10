import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function resolveAuthenticatedDestination(
  userId: string,
): Promise<string> {
  const supabase = await createClient();

  const { data: agencyRows, error: agencyError } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", userId)
    .eq("role", "agency_admin")
    .eq("invitation_status", "accepted")
    .limit(1)
    .returns<{ agency_id: string }[]>();

  if (!agencyError && agencyRows.length > 0) {
    return "/agency";
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("client_access")
    .select("client_id")
    .eq("user_id", userId)
    .eq("invitation_status", "accepted")
    .returns<{ client_id: string }[]>();

  if (accessError) {
    return "/no-access";
  }

  const clientIds = Array.from(new Set(accessRows.map((row) => row.client_id)));

  if (clientIds.length === 1) {
    return `/client/${clientIds[0]}/dashboard`;
  }

  if (clientIds.length > 1) {
    return "/clients";
  }

  return "/no-access";
}
