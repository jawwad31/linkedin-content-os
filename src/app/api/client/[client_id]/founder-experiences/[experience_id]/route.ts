import { deleteFounderExperience } from "@/features/founder-experiences/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ client_id: string; experience_id: string }> },
) {
  const { client_id: clientId, experience_id: experienceId } = await params;

  const result = await deleteFounderExperience(clientId, experienceId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
