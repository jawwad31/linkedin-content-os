import {
  createContentResource,
  listContentResources,
} from "@/features/resources/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: clientId } = await params;
  const result = await listContentResources(clientId);
  if (!result.ok) {
    return apiFailure(result.code, result.message, statusForErrorCode(result.code));
  }
  return apiSuccess(result.data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: clientId } = await params;
  const body = await request.json().catch(() => null);
  const result = await createContentResource(clientId, body);
  if (!result.ok) {
    return apiFailure(result.code, result.message, statusForErrorCode(result.code));
  }
  return apiSuccess(result.data, 201);
}
