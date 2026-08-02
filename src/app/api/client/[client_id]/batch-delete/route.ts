import { z } from "zod";

import { deleteContentIdea } from "@/features/ideas/management/service";
import { deletePost } from "@/features/posts/generate/service";
import { deleteCollectedArticle } from "@/features/research/collected-articles/service";
import { deleteTrendCard } from "@/features/research/trend-cards/service";
import { canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import {
  batchDeleteRequestSchema,
  type BatchDeleteEntityType,
} from "@/lib/bulk-delete/contracts";
import {
  runBatchDelete,
  type BatchDeleteOperationResult,
} from "@/lib/bulk-delete/server";
import { apiFailure, apiSuccess } from "@/lib/errors/api-response";
import { getServerUser } from "@/lib/supabase/session";

const uuidSchema = z.string().uuid();

type DeleteHandler = (
  clientId: string,
  id: string,
) => Promise<BatchDeleteOperationResult>;

function toBatchResult(
  result:
    | { ok: true }
    | { ok: false; code: string; message: string },
): BatchDeleteOperationResult {
  return result.ok
    ? { ok: true }
    : { ok: false, code: result.code, message: result.message };
}

const DELETE_HANDLERS: Record<BatchDeleteEntityType, DeleteHandler> = {
  collected_article: async (clientId, id) =>
    toBatchResult(await deleteCollectedArticle(clientId, id)),
  trend_card: async (clientId, id) =>
    toBatchResult(await deleteTrendCard(clientId, id)),
  content_idea: async (clientId, id) =>
    toBatchResult(await deleteContentIdea(clientId, id)),
  post: async (clientId, id) =>
    toBatchResult(await deletePost(clientId, id, "DELETE")),
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: rawClientId } = await params;
  const clientId = uuidSchema.safeParse(rawClientId);
  if (!clientId.success) {
    return apiFailure("VALIDATION_ERROR", "Invalid request.", 400);
  }

  const { user } = await getServerUser();
  if (!user) {
    return apiFailure("AUTH_REQUIRED", "Authentication is required.", 401);
  }

  if (!(await canUserDeleteBusinessRecords(user.id, clientId.data))) {
    return apiFailure(
      "FORBIDDEN",
      "You do not have permission to delete these records.",
      403,
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = batchDeleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiFailure(
      "VALIDATION_ERROR",
      "Select between 1 and 100 valid records and type DELETE to confirm.",
      400,
    );
  }

  const handler = DELETE_HANDLERS[parsed.data.entityType];
  const result = await runBatchDelete({
    ids: parsed.data.ids,
    deleteOne: (id) => handler(clientId.data, id),
  });

  return apiSuccess(result);
}
