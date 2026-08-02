import { redraftPostFromReview } from "@/features/posts/generate/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";
import {
  enforceRateLimit,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/rate-limit/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string; post_id: string }> },
) {
  const { client_id: clientId, post_id: postId } = await params;
  const rateLimited = await enforceRateLimit(request, {
    action: "redraft-post",
    clientId,
    limit: 5,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rateLimited) return rateLimited;

  const result = await redraftPostFromReview(clientId, postId);
  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
      result.details,
    );
  }

  return apiSuccess(result.data);
}
