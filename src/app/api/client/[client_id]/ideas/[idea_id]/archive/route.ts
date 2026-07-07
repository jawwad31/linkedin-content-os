import { archiveContentIdea } from "@/features/ideas/management/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ client_id: string; idea_id: string }> },
) {
  const { client_id: clientId, idea_id: ideaId } = await params;

  const result = await archiveContentIdea(clientId, ideaId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
