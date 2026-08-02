import "server-only";

import { getAgencyAccessForUser } from "@/lib/access/agency-access";
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

export type ManagedAgencyMember = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export type ManagedAccountAccess = ManagedAccountMember & {
  clientId: string;
  clientName: string;
};

export type AgencyManagementData = {
  agencyId: string;
  agencyName: string;
  accounts: Array<{ id: string; name: string }>;
  agencyMembers: ManagedAgencyMember[];
  accountAccess: ManagedAccountAccess[];
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
  if (!access || (access.role !== "agency_admin" && access.role !== "client_admin")) {
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

export async function getAgencyManagementData(): Promise<
  | { ok: true; data: AgencyManagementData }
  | { ok: false; message: string }
> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const agencyAccess = await getAgencyAccessForUser(user.id);
  if (!agencyAccess.ok) {
    return { ok: false, message: "You cannot manage Agency users." };
  }

  const admin = createAdminClient();
  const { data: accounts, error: accountsError } = await admin
    .from("clients")
    .select("id, name")
    .eq("agency_id", agencyAccess.access.agencyId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<Array<{ id: string; name: string }>>();
  if (accountsError) return { ok: false, message: "We could not load Agency accounts." };

  const accountIds = accounts.map((account) => account.id);
  const [agencyMemberships, accountMemberships] = await Promise.all([
    admin
      .from("agency_members")
      .select("id, user_id, invited_email, created_at")
      .eq("agency_id", agencyAccess.access.agencyId)
      .eq("role", "agency_admin")
      .eq("invitation_status", "accepted")
      .order("created_at", { ascending: true })
      .returns<Array<{ id: string; user_id: string; invited_email: string | null; created_at: string }>>(),
    accountIds.length > 0
      ? admin
          .from("client_access")
          .select("id, client_id, user_id, invited_email, role, permissions, created_at")
          .in("client_id", accountIds)
          .eq("invitation_status", "accepted")
          .not("user_id", "is", null)
          .order("created_at", { ascending: true })
          .returns<AccountMembershipRow[]>()
      : Promise.resolve({ data: [] as AccountMembershipRow[], error: null }),
  ]);
  if (agencyMemberships.error || accountMemberships.error) {
    return { ok: false, message: "We could not load Agency users." };
  }

  const userIds = [
    ...agencyMemberships.data.map((row) => row.user_id),
    ...accountMemberships.data.map((row) => row.user_id),
  ];
  const identities = await getIdentityMap(userIds);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  return {
    ok: true,
    data: {
      agencyId: agencyAccess.access.agencyId,
      agencyName: agencyAccess.access.agencyName,
      accounts,
      agencyMembers: agencyMemberships.data.map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: identities.get(row.user_id)?.email || row.invited_email || "Unknown email",
        name: identities.get(row.user_id)?.name ?? null,
        createdAt: row.created_at,
      })),
      accountAccess: accountMemberships.data.map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: identities.get(row.user_id)?.email || row.invited_email || "Unknown email",
        name: identities.get(row.user_id)?.name ?? null,
        role: row.role,
        permissions: row.permissions ?? [],
        createdAt: row.created_at,
        clientId: row.client_id,
        clientName: accountNames.get(row.client_id) ?? "Account",
      })),
    },
  };
}
