import "server-only";

import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import type { ClientPermission, ClientRole } from "@/lib/access/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/session";

import { getAuthUsersById } from "./auth-users";

export type ManagedAccountMember = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: ClientRole;
  permissions: ClientPermission[];
  createdAt: string;
};

type ProfileRow = { id: string; name: string | null; email: string | null };
type AccountMembershipRow = {
  id: string;
  client_id: string;
  user_id: string;
  invited_email: string | null;
  role: ClientRole;
  permissions: ClientPermission[] | null;
  created_at: string;
};

async function getIdentityMap(userIds: readonly string[]) {
  const admin = createAdminClient();
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return new Map<string, { email: string; name: string | null }>();
  }

  const [{ data: profiles }, authUsers] = await Promise.all([
    admin
      .from("profiles")
      .select("id, name, email")
      .in("id", uniqueUserIds)
      .returns<ProfileRow[]>(),
    getAuthUsersById(admin, uniqueUserIds),
  ]);
  const profilesById = new Map((profiles ?? []).map((row) => [row.id, row]));

  return new Map(
    uniqueUserIds.map((userId) => {
      const profile = profilesById.get(userId);
      const authUser = authUsers.get(userId);
      return [
        userId,
        {
          email: profile?.email?.trim() || authUser?.email?.trim() || "Unknown email",
          name:
            profile?.name?.trim() ||
            (typeof authUser?.user_metadata?.name === "string"
              ? authUser.user_metadata.name.trim() || null
              : null),
        },
      ];
    }),
  );
}

export async function getAccountTeam(clientId: string): Promise<
  | { ok: true; members: ManagedAccountMember[] }
  | { ok: false; message: string }
> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access || access.role !== "client_admin") {
    return { ok: false, message: "You cannot manage this Account team." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_access")
    .select("id, client_id, user_id, invited_email, role, permissions, created_at")
    .eq("client_id", clientId)
    .eq("invitation_status", "accepted")
    .not("user_id", "is", null)
    .order("created_at", { ascending: true })
    .returns<AccountMembershipRow[]>();
  if (error) return { ok: false, message: "We could not load Account users." };

  const identities = await getIdentityMap(data.map((row) => row.user_id));
  return {
    ok: true,
    members: data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: identities.get(row.user_id)?.email || row.invited_email || "Unknown email",
      name: identities.get(row.user_id)?.name ?? null,
      role: row.role,
      permissions: row.permissions ?? [],
      createdAt: row.created_at,
    })),
  };
}
