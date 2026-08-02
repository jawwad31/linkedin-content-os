import { z } from "zod";

import { markCollectedArticlesStatus } from "@/features/research/collected-articles/service";
import { batchArticleStatusRequestSchema } from "@/lib/bulk-edit/contracts";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

const uuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: rawClientId } = await params;
  const clientId = uuidSchema.safeParse(rawClientId);
  if (!clientId.success) {
    return apiFailure("VALIDATION_ERROR", "Invalid request.", 400);
  }

  const body = await request.json().catch(() => null);
  const parsed = batchArticleStatusRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiFailure(
      "VALIDATION_ERROR",
      "Select between 1 and 100 valid articles and choose a valid status.",
      400,
    );
  }

  const result = await markCollectedArticlesStatus(
    clientId.data,
    parsed.data.ids,
    parsed.data.targetStatus,
  );

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
