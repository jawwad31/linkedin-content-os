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

export type WorkspaceAttention = {
  clientId: string;
  clientName: string;
  postsAwaitingReviewCount: number;
  approvedPostCount: number;
  latestResearchStatus: string | null;
  latestResearchTimestamp: string | null;
  latestResearchFailed: boolean;
};

export type AgencyAttentionMetrics = {
  totalPostsAwaitingReview: number;
  totalApprovedPostsReady: number;
  failedResearchWorkspaceCount: number;
  uniqueAttentionWorkspaceCount: number;
  attentionWorkspaces: WorkspaceAttention[];
};

export type AgencyOverviewResult =
  | {
      ok: true;
      access: AgencyAccess;
      workspaces: AgencyWorkspace[];
      teamMemberCount: number;
      attentionMetrics: AgencyAttentionMetrics;
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

type MinimalPostRow = {
  client_id: string;
  status: string;
};

type MinimalResearchRunRow = {
  client_id: string;
  status: string;
  stage: string | null;
  started_at: string | null;
  created_at: string;
};

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

  const workspaces = workspacesResult.workspaces;
  const workspaceIds = workspaces.map((w) => w.id);

  // Default empty metrics if no workspaces exist
  const defaultMetrics: AgencyAttentionMetrics = {
    totalPostsAwaitingReview: 0,
    totalApprovedPostsReady: 0,
    failedResearchWorkspaceCount: 0,
    uniqueAttentionWorkspaceCount: 0,
    attentionWorkspaces: [],
  };

  if (workspaceIds.length === 0) {
    return {
      ok: true,
      access: workspacesResult.access,
      workspaces,
      teamMemberCount: teamResult.members.length,
      attentionMetrics: defaultMetrics,
    };
  }

  const supabase = await createClient();

  // Query only the minimal fields required from posts
  const { data: postsData, error: postsError } = await supabase
    .from("posts")
    .select("client_id, status")
    .in("client_id", workspaceIds)
    .is("deleted_at", null)
    .in("status", ["review", "needs_edit", "approved"])
    .returns<MinimalPostRow[]>();

  if (postsError) {
    return { ok: false };
  }

  // Query only minimal required fields from research_runs
  const { data: runsData, error: runsError } = await supabase
    .from("research_runs")
    .select("client_id, status, stage, started_at, created_at")
    .in("client_id", workspaceIds)
    .order("created_at", { ascending: false })
    .returns<MinimalResearchRunRow[]>();

  if (runsError) {
    return { ok: false };
  }

  // Compute posts counts per client
  const postsAwaitingReviewByClient = new Map<string, number>();
  const approvedPostsByClient = new Map<string, number>();
  let totalPostsAwaitingReview = 0;
  let totalApprovedPostsReady = 0;

  for (const post of postsData) {
    const cid = post.client_id;
    if (post.status === "review" || post.status === "needs_edit") {
      postsAwaitingReviewByClient.set(cid, (postsAwaitingReviewByClient.get(cid) ?? 0) + 1);
      totalPostsAwaitingReview++;
    } else if (post.status === "approved") {
      approvedPostsByClient.set(cid, (approvedPostsByClient.get(cid) ?? 0) + 1);
      totalApprovedPostsReady++;
    }
  }

  // Group research runs by client to find the newest run for each workspace in application code
  const latestRunByClient = new Map<string, MinimalResearchRunRow>();
  for (const run of runsData) {
    const cid = run.client_id;
    if (!latestRunByClient.has(cid)) {
      latestRunByClient.set(cid, run);
    }
  }

  let failedResearchWorkspaceCount = 0;
  const attentionWorkspaces: WorkspaceAttention[] = [];

  for (const workspace of workspaces) {
    const cid = workspace.id;
    const reviewCount = postsAwaitingReviewByClient.get(cid) ?? 0;
    const approvedCount = approvedPostsByClient.get(cid) ?? 0;
    const latestRun = latestRunByClient.get(cid) ?? null;

    const latestResearchStatus = latestRun?.status ?? null;
    const latestResearchTimestamp = latestRun ? (latestRun.started_at ?? latestRun.created_at) : null;
    const latestResearchFailed = latestResearchStatus === "failed";

    if (latestResearchFailed) {
      failedResearchWorkspaceCount++;
    }

    const hasAttention = reviewCount > 0 || approvedCount > 0 || latestResearchFailed;

    if (hasAttention) {
      attentionWorkspaces.push({
        clientId: cid,
        clientName: workspace.name,
        postsAwaitingReviewCount: reviewCount,
        approvedPostCount: approvedCount,
        latestResearchStatus,
        latestResearchTimestamp,
        latestResearchFailed,
      });
    }
  }

  // Sort attention rows deterministically:
  // 1. latest research failed first;
  // 2. highest posts-awaiting-review count;
  // 3. highest approved-post count;
  // 4. workspace name alphabetically.
  attentionWorkspaces.sort((a, b) => {
    if (a.latestResearchFailed !== b.latestResearchFailed) {
      return a.latestResearchFailed ? -1 : 1;
    }
    if (a.postsAwaitingReviewCount !== b.postsAwaitingReviewCount) {
      return b.postsAwaitingReviewCount - a.postsAwaitingReviewCount;
    }
    if (a.approvedPostCount !== b.approvedPostCount) {
      return b.approvedPostCount - a.approvedPostCount;
    }
    return a.clientName.localeCompare(b.clientName);
  });

  const uniqueAttentionWorkspaceCount = attentionWorkspaces.length;

  return {
    ok: true,
    access: workspacesResult.access,
    workspaces,
    teamMemberCount: teamResult.members.length,
    attentionMetrics: {
      totalPostsAwaitingReview,
      totalApprovedPostsReady,
      failedResearchWorkspaceCount,
      uniqueAttentionWorkspaceCount,
      attentionWorkspaces,
    },
  };
}
