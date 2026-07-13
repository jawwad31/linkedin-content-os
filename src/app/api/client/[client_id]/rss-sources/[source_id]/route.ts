import { deleteRssSource } from "@/features/research/rss-sources/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ client_id: string; source_id: string }> },
) {
  const { client_id: clientId, source_id: sourceId } = await params;

  const result = await deleteRssSource(clientId, sourceId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
