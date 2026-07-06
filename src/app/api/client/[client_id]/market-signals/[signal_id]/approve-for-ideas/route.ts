import { approveMarketSignalForIdeas } from "@/features/research/market-signals/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ client_id: string; signal_id: string }> },
) {
  const { client_id: clientId, signal_id: signalId } = await params;

  const result = await approveMarketSignalForIdeas(clientId, signalId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
