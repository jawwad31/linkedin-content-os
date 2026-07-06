import { saveFounderTake } from "@/features/research/market-signals/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string; signal_id: string }> },
) {
  const { client_id: clientId, signal_id: signalId } = await params;

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
      "Could not update this Market Signal. Please try again.",
      400,
    );
  }

  const result = await saveFounderTake(clientId, signalId, founderTake);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
