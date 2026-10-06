"use server";

import {
  uploadOrSaveDocument,
  archiveClientDocument,
  deleteClientDocument,
} from "./service";
import type { UploadDocumentInput } from "./schemas";

export async function uploadDocumentAction(
  clientId: string,
  input: UploadDocumentInput,
) {
  const result = await uploadOrSaveDocument(clientId, input);
  if (!result.ok) {
    return { error: result.message, success: null };
  }
  return { error: null, success: "Document uploaded and indexed successfully." };
}

export async function archiveDocumentAction(
  clientId: string,
  documentId: string,
) {
  const result = await archiveClientDocument(clientId, documentId);
  if (!result.ok) {
    return { error: result.message, success: null };
  }
  return { error: null, success: "Document archived." };
}

export async function deleteDocumentAction(
  clientId: string,
  documentId: string,
) {
  const result = await deleteClientDocument(clientId, documentId);
  if (!result.ok) {
    return { error: result.message, success: null };
  }
  return { error: null, success: "Document deleted." };
}
