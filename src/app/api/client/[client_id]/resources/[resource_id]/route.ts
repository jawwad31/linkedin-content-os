import {
  archiveContentResource,
  updateContentResource,
} from "@/features/resources/service";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ client_id: string; resource_id: string }>;
  },
) {
  const { client_id: clientId, resource_id: resourceId } = await params;
  const body = await request.json().catch(() => null);
  const result = await updateContentResource(clientId, resourceId, body);
  if (!result.ok) {
    return apiFailure(result.code, result.message, statusForErrorCode(result.code));
  }
  return apiSuccess(result.data);
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ client_id: string; resource_id: string }>;
  },
) {
  const { client_id: clientId, resource_id: resourceId } = await params;
  const result = await archiveContentResource(clientId, resourceId);
  if (!result.ok) {
    return apiFailure(result.code, result.message, statusForErrorCode(result.code));
  }
  return apiSuccess(result.data);
}
