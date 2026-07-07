import { saveFounderTake } from "@/features/research/trend-cards/service";
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

  let founderTake: unknown;
  try {
    const body = await request.json();
    founderTake = body?.founderTake;
  } catch {
    founderTake = undefined;
  }

  if (typeof founderTake !== "string") {
    return apiFailure(
      "VALIDATION_ERROR",
      "Could not update this TrendCard. Please try again.",
      400,
    );
  }

  const result = await saveFounderTake(clientId, cardId, founderTake);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
