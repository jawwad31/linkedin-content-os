import type { ContentBankEntry } from "./schemas";

export type ContentBankPostEligibility =
  | { eligible: true; message: null }
  | { eligible: false; message: string };

/** The action the entry is being checked for; only the guidance wording differs. */
export type ContentBankAssignmentPurpose = "post" | "calendar";

const PURPOSE_PHRASE: Record<ContentBankAssignmentPurpose, string> = {
  post: "creating a post",
  calendar: "adding it to a calendar",
};

/**
 * Client-facing eligibility mirrors the server checks used before a Content
 * Bank assignment is reserved. The database reservation remains authoritative.
 * The same checks guard Create post and Add to Calendar; `purpose` only selects
 * the wording shown to the user.
 */
export function getContentBankPostEligibility(
  entry: ContentBankEntry,
  purpose: ContentBankAssignmentPurpose = "post",
): ContentBankPostEligibility {
  const phrase = PURPOSE_PHRASE[purpose];

  if (entry.readiness !== "ready") {
    return {
      eligible: false,
      message:
        entry.readiness === "archived"
          ? `Restore this entry to ready before ${phrase}.`
          : `Mark this entry ready before ${phrase}.`,
    };
  }

  if (entry.sourceType === "content_resource" && !entry.active) {
    return {
      eligible: false,
      message: `Reactivate this resource before ${phrase}.`,
    };
  }

  if (
    entry.entryType === "trend_reaction" &&
    !entry.sourceTrendCardId
  ) {
    return {
      eligible: false,
      message: "This trend reaction no longer has its research source.",
    };
  }

  if (!entry.allowReuse && entry.usageStatus !== "unused") {
    return {
      eligible: false,
      message:
        entry.usageStatus === "reserved"
          ? "This single-use entry is already reserved for another assignment."
          : purpose === "post"
            ? "Enable reuse to create another post from this entry."
            : "Enable reuse to add this entry to a calendar again.",
    };
  }

  return { eligible: true, message: null };
}
