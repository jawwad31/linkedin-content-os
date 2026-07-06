import { markCollectedArticleRelevant } from "@/features/research/collected-articles/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ client_id: string; item_id: string }> },
) {
  const { client_id: clientId, item_id: itemId } = await params;

  const result = await markCollectedArticleRelevant(clientId, itemId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
