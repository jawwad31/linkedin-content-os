import type { CalendarSlotRecord } from "./queries";

/** The three states the calendar shows, plus Failed so a stopped draft is never hidden. */
export type DatedSlotState = "reserved" | "drafting" | "drafted" | "failed";

export const SLOT_STATE_LABELS: Record<DatedSlotState, string> = {
  reserved: "Reserved",
  drafting: "Drafting",
  drafted: "Drafted",
  failed: "Draft failed",
};

export const SLOT_STATE_HELP: Record<DatedSlotState, string> = {
  reserved: "The entry is held for this day. No post has been written yet.",
  drafting: "A post is being written.",
  drafted: "A post exists and needs review.",
  failed: "Drafting stopped. The entry was not used.",
};

/**
 * Maps a stored slot to what the calendar shows. Slots from the old monthly plan that
 * never held an entry (planned or placeholder) have no state: they are listed under
 * "Needs a date" instead.
 */
export function slotState(slot: Pick<CalendarSlotRecord, "status" | "postId">): DatedSlotState | null {
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
