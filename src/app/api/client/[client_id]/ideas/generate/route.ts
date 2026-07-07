import { generateContentIdeas } from "@/features/ideas/generate/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: clientId } = await params;
  const body = await request.json().catch(() => null);

  const result = await generateContentIdeas(clientId, body);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
