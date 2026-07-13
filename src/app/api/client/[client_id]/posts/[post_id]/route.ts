import { deletePost } from "@/features/posts/generate/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";
import { NextRequest } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ client_id: string; post_id: string }> },
) {
  const { client_id: clientId, post_id: postId } = await params;

  let confirmDelete = request.nextUrl.searchParams.get("confirm") || undefined;

  if (!confirmDelete) {
    try {
      const cloned = request.clone();
      const body = await cloned.json();
      if (body && typeof body === "object") {
        if ("confirmDelete" in body) {
          confirmDelete = String(body.confirmDelete);
        } else if ("confirm" in body) {
          confirmDelete = String(body.confirm);
        }
      }
    } catch {
      // Ignore parsing error
    }
  }

  const result = await deletePost(clientId, postId, confirmDelete);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
