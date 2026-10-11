"use server";

import {
  createContentBankEntry,
  updateContentBankEntry,
  toggleAllowReuse,
  archiveContentBankEntry,
  deleteContentBankExperience,
  loadContentBankUsage,
} from "./service";
import type { CreateContentBankEntryInput, UpdateContentBankEntryInput } from "./schemas";

export type ActionState = {
  error: string | null;
  success: string | null;
};

export async function createContentBankEntryAction(
  clientId: string,
  input: CreateContentBankEntryInput,
) {
  const result = await createContentBankEntry(clientId, input);
  if (!result.ok) {
    return { error: result.message, success: null };
  }
  return { error: null, success: "Content Bank entry created successfully." };
}

export async function updateContentBankEntryAction(
  clientId: string,
  entryId: string,
  sourceType: "founder_experience" | "content_resource",
  input: UpdateContentBankEntryInput,
) {
  const result = await updateContentBankEntry(clientId, entryId, sourceType, input);
  if (!result.ok) {
    return { error: result.message, success: null };
  }
  return { error: null, success: "Content Bank entry updated successfully." };
}

export async function toggleAllowReuseAction(
  clientId: string,
  entryId: string,
  sourceType: "founder_experience" | "content_resource",
  allowReuse: boolean,
) {
  const result = await toggleAllowReuse(clientId, entryId, sourceType, allowReuse);
  if (!result.ok) {
    return { error: result.message, success: null };
  }
  return { error: null, success: "Reuse permission updated." };
}

export async function archiveContentBankEntryAction(
  clientId: string,
  entryId: string,
  sourceType: "founder_experience" | "content_resource",
) {
  const result = await archiveContentBankEntry(clientId, entryId, sourceType);
  if (!result.ok) {
    return { error: result.message, success: null };
  }
  return { error: null, success: "Entry archived." };
}

export async function deleteContentBankExperienceAction(clientId: string, entryId: string) {
  const result = await deleteContentBankExperience(clientId, entryId);
  return result.ok
    ? { ok: true as const, error: null }
    : { ok: false as const, error: result.message };
}

export async function loadContentBankUsageAction(
  clientId: string,
  entryId: string,
  sourceType: "founder_experience" | "content_resource",
) {
  return loadContentBankUsage(clientId, entryId, sourceType);
}
