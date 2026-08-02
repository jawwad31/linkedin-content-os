import { updateStrategyOverrides } from "@/features/ideas/management/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ client_id: string; idea_id: string }> },
) {
  const { client_id: clientId, idea_id: ideaId } = await params;
  const body = await request.json().catch(() => null);
  const result = await updateStrategyOverrides(clientId, ideaId, body);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
