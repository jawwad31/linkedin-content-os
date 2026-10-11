import { markPostPublished } from "@/features/posts/review/service";
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
  {
    params,
  }: { params: Promise<{ client_id: string; post_id: string }> },
) {
  const { client_id: clientId, post_id: postId } = await params;
  const rateLimited = await enforceRateLimit(request, {
    action: "mark-post-published",
    clientId,
    limit: 30,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rateLimited) return rateLimited;

  const result = await markPostPublished(clientId, postId, await request.json().catch(() => null));

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
