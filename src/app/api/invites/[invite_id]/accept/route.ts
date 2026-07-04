import { acceptInvitation } from "@/features/clients/invitations/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invite_id: string }> },
) {
  const { invite_id: inviteId } = await params;

  const result = await acceptInvitation(inviteId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
