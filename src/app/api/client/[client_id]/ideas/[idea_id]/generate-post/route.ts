import { generatePostFromIdea } from "@/features/posts/generate/service";
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
  }: { params: Promise<{ client_id: string; idea_id: string }> },
) {
  const { client_id: clientId, idea_id: ideaId } = await params;
  const rateLimited = await enforceRateLimit(request, {
    action: "generate-post",
    clientId,
    limit: 5,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));

  const result = await generatePostFromIdea(clientId, ideaId, body);

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
