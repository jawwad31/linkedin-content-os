import { acceptInvitation } from "@/features/clients/invitations/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";
import {
  enforceRateLimit,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/rate-limit/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invite_id: string }> },
) {
  const { invite_id: inviteId } = await params;
  const rateLimited = await enforceRateLimit(request, {
    action: "accept-invitation",
    limit: 10,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rateLimited) return rateLimited;

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
