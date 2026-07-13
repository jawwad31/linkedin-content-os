import { deleteTrendCard } from "@/features/research/trend-cards/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ client_id: string; trend_card_id: string }> },
) {
  const { client_id: clientId, trend_card_id: trendCardId } = await params;

  const result = await deleteTrendCard(clientId, trendCardId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
