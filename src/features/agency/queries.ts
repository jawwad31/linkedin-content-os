import "server-only";

import type { AccessibleClient } from "@/features/clients/queries";
import {
  getAgencyAccessForUser,
  type AgencyAccess,
} from "@/lib/access/agency-access";
import { createClient } from "@/lib/supabase/server";

type ClientRow = {
  id: string;
  name: string;
  agency_id: string;
  founder_name: string | null;
  industry: string | null;
  updated_at: string;
  agencies: { name: string | null } | null;
};

export type AgencyWorkspace = AccessibleClient;

export type AgencyWorkspaceResult =
  | {
      ok: true;
      access: AgencyAccess;
      workspaces: AgencyWorkspace[];
    }
  | { ok: false; reason?: string };

export type AgencyTeamMember = {
  id: string;
  agencyName: string | null;
  invitedEmail: string | null;
  profileName: string | null;
  role: "agency_admin";
  createdAt: string;
};

export type AgencyTeamResult =
  | {
      ok: true;
      access: AgencyAccess;
      members: AgencyTeamMember[];
    }
  | { ok: false; reason?: string };

export type AgencyOverviewResult =
  | {
      ok: true;
      access: AgencyAccess;
      workspaces: AgencyWorkspace[];
      teamMemberCount: number;
    }
  | { ok: false; reason?: string };

function toAgencyWorkspaces(rows: ClientRow[]): AgencyWorkspace[] {
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      agencyName: row.agencies?.name ?? null,
      founderName: row.founder_name,
      industry: row.industry,
      updatedAt: row.updated_at,
      role: "agency_admin" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAgencyWorkspaces(
  userId: string,
): Promise<AgencyWorkspaceResult> {
  const accessResult = await getAgencyAccessForUser(userId);
  if (!accessResult.ok) {
    return { ok: false, reason: accessResult.reason };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, agency_id, founder_name, industry, updated_at, agencies(name)")
    .eq("agency_id", accessResult.access.agencyId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<ClientRow[]>();

  if (error) {
    return { ok: false };
  }

  return {
    ok: true,
    access: accessResult.access,
    workspaces: toAgencyWorkspaces(data),
  };
}

type AgencyTeamRow = {
  id: string;
  agency_id: string;
  user_id: string;
  role: "agency_admin";
  invited_email: string | null;
  created_at: string;
  agencies: { name: string | null } | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
};

export async function getAgencyTeam(
  userId: string,
): Promise<AgencyTeamResult> {
  const accessResult = await getAgencyAccessForUser(userId);
  if (!accessResult.ok) {
    return { ok: false, reason: accessResult.reason };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_members")
    .select("id, agency_id, user_id, role, invited_email, created_at, agencies(name)")
    .eq("agency_id", accessResult.access.agencyId)
    .eq("role", "agency_admin")
    .eq("invitation_status", "accepted")
    .order("created_at", { ascending: true })
    .returns<AgencyTeamRow[]>();

  if (error) {
    return { ok: false };
  }

  const profileNamesByUserId = await getSafelyReadableProfileNames(
    data.map((row) => row.user_id),
  );

  return {
    ok: true,
    access: accessResult.access,
    members: data.map((row) => ({
      id: row.id,
      agencyName: row.agencies?.name ?? null,
      invitedEmail: row.invited_email,
      profileName: profileNamesByUserId.get(row.user_id) ?? null,
      role: row.role,
      createdAt: row.created_at,
    })),
  };
}

async function getSafelyReadableProfileNames(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", userIds)
    .returns<ProfileRow[]>();

  if (error) {
    return new Map();
  }

  return new Map(
    data
      .filter((row) => row.name?.trim())
      .map((row) => [row.id, row.name!.trim()]),
  );
}

export async function getAgencyOverview(
  userId: string,
): Promise<AgencyOverviewResult> {
  const [workspacesResult, teamResult] = await Promise.all([
    getAgencyWorkspaces(userId),
    getAgencyTeam(userId),
  ]);

  if (!workspacesResult.ok) {
    return { ok: false, reason: workspacesResult.reason };
  }

  if (!teamResult.ok) {
    return { ok: false, reason: teamResult.reason };
  }

  return {
    ok: true,
    access: workspacesResult.access,
    workspaces: workspacesResult.workspaces,
    teamMemberCount: teamResult.members.length,
  };
}
