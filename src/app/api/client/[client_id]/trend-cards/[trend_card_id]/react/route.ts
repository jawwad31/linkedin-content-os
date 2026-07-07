import { addTrendReaction } from "@/features/research/trend-cards/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string; trend_card_id: string }> },
) {
  const { client_id: clientId, trend_card_id: cardId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await addTrendReaction(clientId, cardId, body);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
