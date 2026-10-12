import type { CalendarSlotRecord } from "./queries";

/**
 * The states the calendar shows: the three draft stages, Failed so a stopped draft is never
 * hidden, and what became of the post once it has been reviewed.
 */
export type DatedSlotState =
  | "reserved"
  | "drafting"
  | "drafted"
  | "failed"
  | "approved"
  | "published"
  | "rejected";

export const SLOT_STATE_LABELS: Record<DatedSlotState, string> = {
  reserved: "Reserved",
  drafting: "Drafting",
  drafted: "Drafted",
  failed: "Draft failed",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
};

export const SLOT_STATE_HELP: Record<DatedSlotState, string> = {
  reserved: "The entry is held for this day. No post has been written yet.",
  drafting: "A post is being written.",
  drafted: "A post exists and needs review.",
  failed: "Drafting stopped. The entry was not used.",
  approved: "The post is approved and ready to publish.",
  published: "The post has been published.",
  rejected: "This post was rejected. Open it to see why.",
};

/**
 * Maps a stored slot to what the calendar shows. Slots from the old monthly plan that
 * never held an entry (planned or placeholder) have no state: they are listed under
 * "Needs a date" instead.
 */
export function slotState(
  slot: Pick<CalendarSlotRecord, "status" | "postId"> & { postStatus?: string | null },
): DatedSlotState | null {
  if (slot.postId) {
    // A post that has been reviewed shows its outcome, not "needs review".
    if (slot.postStatus === "rejected") return "rejected";
    if (slot.postStatus === "approved") return "approved";
    if (slot.postStatus === "published") return "published";
  }
  if (slot.postId || slot.status === "drafted") return "drafted";
  if (slot.status === "queued" || slot.status === "drafting") return "drafting";
  if (slot.status === "failed") return "failed";
  if (slot.status === "reserved") return "reserved";
  return null;
}

/** Only a plain reservation can be moved or removed; anything further along is kept. */
export function isMovable(slot: Pick<CalendarSlotRecord, "status" | "postId">): boolean {
  return slot.status === "reserved" && !slot.postId;
}

export function bucketLabel(bucket: CalendarSlotRecord["bucket"]): string {
  if (bucket === "experience") return "Experience";
  if (bucket === "asset") return "Resource";
  if (bucket === "news") return "News";
  return "Evergreen";
}
