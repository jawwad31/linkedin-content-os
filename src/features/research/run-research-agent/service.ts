import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import {
  classifyForClient,
  NOT_CONFIGURED_ERROR,
  type ClassifyForClientResult,
} from "@/features/research/agents/research-classifier";
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

const CLASSIFY_STAGE = "classify";

type PipelineResult = {
  collect: CollectForClientSummary;
  classify: ClassifyForClientResult;
};

function toResearchRunSummary(pipeline: PipelineResult): ResearchRunSummary {
  const collect = pipeline.collect;
  const base: ResearchRunSummary = {
    sourcesProcessed: collect.sourcesProcessed,
    totalFetched: collect.totalFetched,
    totalNew: collect.totalNew,
    skippedDuplicate: collect.skippedDuplicate,
    skippedInvalid: collect.skippedInvalid,
    skippedError: collect.skippedError,
    errorCount: collect.errors.length,
  };

  if (pipeline.classify.ok) {
    return {
      ...base,
      classifiedCount: pipeline.classify.summary.classifiedCount,
      relevantCount: pipeline.classify.summary.relevantCount,
      irrelevantCount: pipeline.classify.summary.irrelevantCount,
      classificationErrorCount: pipeline.classify.summary.errorCount,
    };
  }

  // "not_configured" is a benign, expected ops state (no OPENROUTER_* env
  // set yet) — collection still succeeded and is real progress, so this
  // isn't treated as a classification error count. Any other classify
  // failure reason is reflected as one classification error instead of
  // failing the whole run — collection's success should not be erased by a
  // downstream classification problem.
  return {
    ...base,
    classificationErrorCount: pipeline.classify.reason === "not_configured" ? 0 : 1,
  };
}

export type ManualRunData = {
  summary: ResearchRunSummary;
  classificationMessage: string | null;
};

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
 * Manually runs RSS collection then classification for one client, sharing
 * the same distributed run guard (Feature 15) and lock_key as the worker
 * so a manual click and a worker cycle can never overlap for the same
 * client. Market Signal synthesis and idea/post generation are not
 * implemented yet.
 *
 * Application-level auth is the primary gate here (not RLS): authenticated
 * user, accepted client access, owner/editor role. RLS's
 * research_runs_select_accepted_access policy plus the tightened
 * insert/update restrictions are the backstop, not the primary check.
 */
export async function runResearchAgentManually(
  clientId: string,
): Promise<ServiceResult<ManualRunData>> {
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
    async () => {
      const collect = await collectForClient(clientIdResult.data);
      const classify = await classifyForClient(clientIdResult.data, user.id);
      return { collect, classify };
    },
    toResearchRunSummary,
    user.id,
    CLASSIFY_STAGE,
  );

  if (guardResult.ok && guardResult.status === "completed") {
    revalidatePath(`/client/${clientIdResult.data}/research`);

    const classify = guardResult.result.classify;
    const classificationMessage =
      !classify.ok && classify.reason === "not_configured"
        ? NOT_CONFIGURED_ERROR
        : null;

    return {
      ok: true,
      data: {
        summary: toResearchRunSummary(guardResult.result),
        classificationMessage,
      },
    };
  }

  if (guardResult.ok && guardResult.status === "locked") {
    return RUN_IN_PROGRESS;
  }

  return GENERIC_FAILURE;
}
