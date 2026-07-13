import { deleteCollectedArticle } from "@/features/research/collected-articles/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ client_id: string; article_id: string }> },
) {
  const { client_id: clientId, article_id: articleId } = await params;

  const result = await deleteCollectedArticle(clientId, articleId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
