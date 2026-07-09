import { markPostNeedsEdit } from "@/features/posts/review/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ client_id: string; post_id: string }> },
) {
  const { client_id: clientId, post_id: postId } = await params;
  const body = await request.json().catch(() => null);
  const result = await markPostNeedsEdit(clientId, postId, body);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
