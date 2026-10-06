import "server-only";

import { revalidatePath } from "next/cache";

import {
  canManageClientSetup,
  canManageFounderExperiences,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  uploadDocumentSchema,
  type ClientDocument,
  type DocumentPurpose,
  type UploadDocumentInput,
} from "./schemas";
import { computeContentHash } from "./retrieval-service";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to manage documents for this workspace.",
};

const ADMIN_REQUIRED = {
  ok: false as const,
  code: "ADMIN_REQUIRED",
  message: "Only Client and Agency Admins can manage reader downloads and profile reference files.",
};

const NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "Document not found.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "SERVER_ERROR",
  message: "Could not save document. Please try again.",
};

type ClientDocumentDbRow = {
  id: string;
  client_id: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  purpose: DocumentPurpose;
  version: number;
  status: "pending" | "processing" | "ready" | "failed" | "archived";
  content_text: string;
  content_hash: string;
  error_message: string | null;
  storage_path: string | null;
  linked_source_id: string | null;
  linked_source_type: "founder_experience" | "content_resource" | "client_profile" | null;
  vector_store_file_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapRowToDocument(row: ClientDocumentDbRow): ClientDocument {
  return {
    id: row.id,
    clientId: row.client_id,
    filename: row.filename,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    purpose: row.purpose,
    version: row.version,
    status: row.status,
    contentText: row.content_text,
    contentHash: row.content_hash,
    errorMessage: row.error_message,
    storagePath: row.storage_path,
    linkedSourceId: row.linked_source_id,
    linkedSourceType: row.linked_source_type,
    vectorStoreFileId: row.vector_store_file_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function uploadOrSaveDocument(
  clientId: string,
  input: UploadDocumentInput,
): Promise<ServiceResult<{ document: ClientDocument }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const parsed = uploadDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Invalid document input.",
    };
  }

  const data = parsed.data;

  // Role permissions check
  const isAdmin = await canManageClientSetup(user.id, clientId);
  if (data.purpose === "reader_download" || data.purpose === "profile_reference") {
    if (!isAdmin) return ADMIN_REQUIRED;
  } else {
    const canManage = await canManageFounderExperiences(user.id, clientId);
    if (!canManage && !isAdmin) return FORBIDDEN;
  }

  const supabase = await createClient();
  const contentHash = computeContentHash(data.contentText);
  const fileSizeBytes = Buffer.byteLength(data.contentText, "utf8");
  const mimeType = data.filename.endsWith(".md") ? "text/markdown" : "text/plain";

  // Check if replacing an existing document with the same filename
  const { data: existingDoc } = await supabase
    .from("client_documents")
    .select("id, version")
    .eq("client_id", clientId)
    .eq("filename", data.filename)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; version: number }>();

  let newVersion = 1;
  if (existingDoc) {
    newVersion = existingDoc.version + 1;
    // Archive previous version immediately at application boundary
    await supabase
      .from("client_documents")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", existingDoc.id);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("client_documents")
    .insert({
      client_id: clientId,
      filename: data.filename,
      file_size_bytes: fileSizeBytes,
      mime_type: mimeType,
      purpose: data.purpose,
      version: newVersion,
      status: "ready",
      content_text: data.contentText,
      content_hash: contentHash,
      linked_source_id: data.linkedSourceId ?? null,
      linked_source_type: data.linkedSourceType ?? null,
    })
    .select()
    .single<ClientDocumentDbRow>();

  if (insertError || !inserted) {
    return GENERIC_FAILURE;
  }

  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "client_document_uploaded",
    metadata: {
      documentId: inserted.id,
      filename: inserted.filename,
      version: newVersion,
      purpose: inserted.purpose,
      fileSizeBytes,
      contentHash,
    },
  });

  revalidatePath(`/client/${clientId}/settings`);
  revalidatePath(`/client/${clientId}/content-bank`);

  return { ok: true, data: { document: mapRowToDocument(inserted) } };
}

export async function listClientDocuments(
  clientId: string,
  options?: {
    purpose?: DocumentPurpose;
    status?: "ready" | "archived" | "all";
    linkedSourceId?: string;
  },
): Promise<ClientDocument[]> {
  const supabase = await createClient();

  let query = supabase
    .from("client_documents")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (options?.purpose) {
    query = query.eq("purpose", options.purpose);
  }

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  if (options?.linkedSourceId) {
    query = query.eq("linked_source_id", options.linkedSourceId);
  }

  const { data, error } = await query.returns<ClientDocumentDbRow[]>();
  if (error || !data) return [];

  return data.map(mapRowToDocument);
}

export async function getClientDocument(
  clientId: string,
  documentId: string,
): Promise<ClientDocument | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_documents")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle<ClientDocumentDbRow>();

  if (error || !data) return null;
  return mapRowToDocument(data);
}

export async function archiveClientDocument(
  clientId: string,
  documentId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const doc = await getClientDocument(clientId, documentId);
  if (!doc) return NOT_FOUND;

  const isAdmin = await canManageClientSetup(user.id, clientId);
  if (doc.purpose === "reader_download" || doc.purpose === "profile_reference") {
    if (!isAdmin) return ADMIN_REQUIRED;
  } else {
    const canManage = await canManageFounderExperiences(user.id, clientId);
    if (!canManage && !isAdmin) return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_documents")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("client_id", clientId);

  if (error) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "client_document_archived",
    metadata: { documentId, filename: doc.filename },
  });

  revalidatePath(`/client/${clientId}/settings`);
  revalidatePath(`/client/${clientId}/content-bank`);

  return { ok: true, data: { id: documentId } };
}

export async function deleteClientDocument(
  clientId: string,
  documentId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const doc = await getClientDocument(clientId, documentId);
  if (!doc) return NOT_FOUND;

  const isAdmin = await canManageClientSetup(user.id, clientId);
  if (!isAdmin) return ADMIN_REQUIRED;

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("client_id", clientId);

  if (error) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "client_document_deleted",
    metadata: { documentId, filename: doc.filename },
  });

  revalidatePath(`/client/${clientId}/settings`);
  revalidatePath(`/client/${clientId}/content-bank`);

  return { ok: true, data: { id: documentId } };
}
