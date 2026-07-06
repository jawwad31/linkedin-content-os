import { runResearchAgentManually } from "@/features/research/run-research-agent/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: clientId } = await params;

  const result = await runResearchAgentManually(clientId);

  if (!result.ok) {
    return apiFailure(
      result.code,
      result.message,
      statusForErrorCode(result.code),
    );
  }

  return apiSuccess(result.data);
}
