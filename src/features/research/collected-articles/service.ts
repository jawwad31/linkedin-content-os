import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import type { CollectedArticleStatus } from "./queries";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const ARTICLE_ERROR_COPY = "Could not update this article. Please try again.";

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: ARTICLE_ERROR_COPY,
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

const NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: ARTICLE_ERROR_COPY,
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: ARTICLE_ERROR_COPY,
};

type MarkTargetStatus = "relevant" | "irrelevant";

type MarkResult = { id: string; status: CollectedArticleStatus };

/**
 * Marks a collected article relevant or irrelevant. Application-level auth
 * is the primary gate here (not RLS): authenticated user, accepted client
 * access, owner/editor role. RLS's market_signal_items_update_owner_editor
 * policy (Feature 04, not tightened for this table) is the backstop, so the
 * regular session-bound client is used, not the admin client.
 *
 * "used" articles (already consumed by a synthesized TrendCard) are
 * locked — they cannot be re-marked from here.
 */
async function markCollectedArticleStatus(
  clientId: string,
  itemId: string,
  targetStatus: MarkTargetStatus,
): Promise<ServiceResult<MarkResult>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const itemIdResult = uuidSchema.safeParse(itemId);
  if (!clientIdResult.success || !itemIdResult.success) return INVALID_INPUT;

  const role = await getCurrentUserRoleForClient(user.id, clientIdResult.data);
  if (!role) return NO_ACCESS;
  if (role !== "owner" && role !== "editor") return VIEWER_FORBIDDEN;

  const supabase = await createClient();

  const { data: before, error: fetchError } = await supabase
    .from("market_signal_items")
    .select("id, status, classification_reason")
    .eq("id", itemIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      status: CollectedArticleStatus;
      classification_reason: string | null;
    }>();

  if (fetchError || !before) return NOT_FOUND;
  if (before.status === "used") return NOT_FOUND;

  const reviewerNote =
    targetStatus === "relevant"
      ? "Marked relevant by reviewer."
      : "Marked irrelevant by reviewer.";
  const nextClassificationReason = before.classification_reason?.trim()
    ? before.classification_reason
    : reviewerNote;

  const { data: after, error: updateError } = await supabase
    .from("market_signal_items")
    .update({
      status: targetStatus,
      classification_reason: nextClassificationReason,
    })
    .eq("id", itemIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id, status")
    .maybeSingle<MarkResult>();

  if (updateError || !after) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action:
      targetStatus === "relevant"
        ? "article_marked_relevant"
        : "article_marked_irrelevant",
    entityType: "market_signal_item",
    entityId: itemIdResult.data,
    metadata: { previous_status: before.status, next_status: targetStatus },
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);

  return { ok: true, data: after };
}

export async function markCollectedArticleRelevant(
  clientId: string,
  itemId: string,
): Promise<ServiceResult<MarkResult>> {
  return markCollectedArticleStatus(clientId, itemId, "relevant");
}

export async function markCollectedArticleIrrelevant(
  clientId: string,
  itemId: string,
): Promise<ServiceResult<MarkResult>> {
  return markCollectedArticleStatus(clientId, itemId, "irrelevant");
}
