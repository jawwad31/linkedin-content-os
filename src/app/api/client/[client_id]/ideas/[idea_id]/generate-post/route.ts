import { generatePostFromIdea } from "@/features/posts/generate/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ client_id: string; idea_id: string }> },
) {
  const { client_id: clientId, idea_id: ideaId } = await params;
  const body = await request.json().catch(() => ({}));

  const result = await generatePostFromIdea(clientId, ideaId, body);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
