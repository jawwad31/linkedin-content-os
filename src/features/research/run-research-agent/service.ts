import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import {
  RSS_COLLECT_LOCK_KEY,
  withResearchRunGuard,
} from "@/features/research/research-runs/run-guard";
import type { ResearchRunSummary } from "@/features/research/research-runs/types";
import {
  collectForClient,
  type CollectForClientSummary,
} from "@/features/research/rss-collector";
import { getServerUser } from "@/lib/supabase/session";

function toResearchRunSummary(
  result: CollectForClientSummary,
): ResearchRunSummary {
  return {
    sourcesProcessed: result.sourcesProcessed,
    totalFetched: result.totalFetched,
    totalNew: result.totalNew,
    skippedDuplicate: result.skippedDuplicate,
    skippedInvalid: result.skippedInvalid,
    skippedError: result.skippedError,
    errorCount: result.errors.length,
  };
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_CLIENT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "This client could not be found.",
};

const NO_ACCESS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have access to this client.",
};

const VIEWER_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "Your role is view-only for this client.",
};

const RUN_IN_PROGRESS = {
  ok: false as const,
  code: "RUN_IN_PROGRESS",
  message:
    "Research is already running for this client. Please wait for it to finish.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Could not run research right now. Please try again.",
};

/**
 * Manually triggers RSS collection for one client — the same collect-only
 * stage the worker runs on its interval, sharing the same distributed run
 * guard (Feature 15) so a manual click and a worker cycle can never
 * overlap for the same client. Classification and Market Signal synthesis
 * are not implemented yet; this is intentionally collect-only.
 *
 * Application-level auth is the primary gate here (not RLS): authenticated
 * user, accepted client access, owner/editor role. RLS's
 * research_runs_select_accepted_access policy plus the tightened
 * insert/update restrictions are the backstop, not the primary check.
 */
export async function runResearchAgentManually(
  clientId: string,
): Promise<ServiceResult<ResearchRunSummary>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) return INVALID_CLIENT;

  const role = await getCurrentUserRoleForClient(user.id, clientIdResult.data);
  if (!role) return NO_ACCESS;
  if (role !== "owner" && role !== "editor") return VIEWER_FORBIDDEN;

  const guardResult = await withResearchRunGuard(
    clientIdResult.data,
    RSS_COLLECT_LOCK_KEY,
    "manual",
    () => collectForClient(clientIdResult.data),
    toResearchRunSummary,
    user.id,
  );

  if (guardResult.ok && guardResult.status === "completed") {
    revalidatePath(`/client/${clientIdResult.data}/research`);
    return { ok: true, data: toResearchRunSummary(guardResult.result) };
  }

  if (guardResult.ok && guardResult.status === "locked") {
    return RUN_IN_PROGRESS;
  }

  return GENERIC_FAILURE;
}
