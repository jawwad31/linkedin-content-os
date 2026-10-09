import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  canAccessClient,
  canManageClientSetup,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  contentResourceInputSchema,
  contentResourceUpdateSchema,
  type ContentResourceInput,
} from "./schemas";
import { getContentResources, type ContentResource } from "./queries";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};
const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "Check the resource details and try again.",
};
const NO_ACCESS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have access to this client.",
};
const ADMIN_REQUIRED = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "Only Client and Agency Admins can manage Content Resources.",
};
const NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "This Content Resource is not available.",
};
const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Could not save this Content Resource. Please try again.",
};

function toDatabaseInput(input: ContentResourceInput) {
  return {
    title: input.title,
    resource_type: input.resourceType,
    description: input.description || null,
    problem_solved: input.problemSolved || null,
    target_use_case: input.targetUseCase || null,
    keyword: input.keyword,
    delivery_url: input.deliveryUrl,
    delivery_instructions: input.deliveryInstructions || null,
    active: input.active,
    comment_gate_approved: input.commentGateApproved,
  };
}

async function authorize(
  clientId: string,
  requireAdmin: boolean,
): Promise<
  | { ok: true; clientId: string; userId: string }
  | { ok: false; failure: ServiceResult<never> }
> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, failure: AUTH_REQUIRED };

  const parsedClientId = uuidSchema.safeParse(clientId);
  if (!parsedClientId.success) return { ok: false, failure: INVALID_INPUT };

  const hasAccess = await canAccessClient(user.id, parsedClientId.data);
  if (!hasAccess) return { ok: false, failure: NO_ACCESS };

  if (
    requireAdmin &&
    !(await canManageClientSetup(user.id, parsedClientId.data))
  ) {
    return { ok: false, failure: ADMIN_REQUIRED };
  }

  return { ok: true, clientId: parsedClientId.data, userId: user.id };
}

export async function listContentResources(
  clientId: string,
): Promise<ServiceResult<ContentResource[]>> {
  const auth = await authorize(clientId, false);
  if (!auth.ok) return auth.failure;
  const result = await getContentResources(auth.clientId);
  return result.ok
    ? { ok: true, data: result.resources }
    : { ok: false, code: "UNKNOWN_ERROR", message: "Could not load Content Resources." };
}

export async function createContentResource(
  clientId: string,
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = contentResourceInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const auth = await authorize(clientId, true);
  if (!auth.ok) return auth.failure;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_resources")
    .insert({
      client_id: auth.clientId,
      created_by_user_id: auth.userId,
      ...toDatabaseInput(parsed.data),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "content_resource_created",
    entityType: "content_resource",
    entityId: data.id,
    metadata: {
      resource_id: data.id,
      resource_type: parsed.data.resourceType,
      active: parsed.data.active,
      comment_gate_approved: parsed.data.commentGateApproved,
    },
  });
  revalidatePath(`/client/${auth.clientId}/resources`);
  revalidatePath(`/client/${auth.clientId}/content-bank`);
  revalidatePath(`/client/${auth.clientId}/ideas`);
  return { ok: true, data };
}

export async function updateContentResource(
  clientId: string,
  resourceId: string,
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = contentResourceUpdateSchema.safeParse(input);
  const parsedResourceId = uuidSchema.safeParse(resourceId);
  if (!parsed.success || !parsedResourceId.success) return INVALID_INPUT;
  const auth = await authorize(clientId, true);
  if (!auth.ok) return auth.failure;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_resources")
    .update(toDatabaseInput(parsed.data))
    .eq("id", parsedResourceId.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return GENERIC_FAILURE;
  if (!data) return NOT_FOUND;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "content_resource_updated",
    entityType: "content_resource",
    entityId: data.id,
    metadata: {
      resource_id: data.id,
      resource_type: parsed.data.resourceType,
      active: parsed.data.active,
      comment_gate_approved: parsed.data.commentGateApproved,
    },
  });
  revalidatePath(`/client/${auth.clientId}/resources`);
  revalidatePath(`/client/${auth.clientId}/content-bank`);
  revalidatePath(`/client/${auth.clientId}/ideas`);
  return { ok: true, data };
}

export async function archiveContentResource(
  clientId: string,
  resourceId: string,
): Promise<ServiceResult<Record<string, never>>> {
  const parsedResourceId = uuidSchema.safeParse(resourceId);
  if (!parsedResourceId.success) return INVALID_INPUT;
  const auth = await authorize(clientId, true);
  if (!auth.ok) return auth.failure;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_resources")
    .update({
      active: false,
      comment_gate_approved: false,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", parsedResourceId.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return GENERIC_FAILURE;
  if (!data) return NOT_FOUND;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "content_resource_archived",
    entityType: "content_resource",
    entityId: data.id,
    metadata: { resource_id: data.id },
  });
  revalidatePath(`/client/${auth.clientId}/resources`);
  revalidatePath(`/client/${auth.clientId}/content-bank`);
  revalidatePath(`/client/${auth.clientId}/ideas`);
  return { ok: true, data: {} };
}
