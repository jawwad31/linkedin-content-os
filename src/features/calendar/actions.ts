"use server";

import {
  addCalendarEntry,
  cancelCalendarSlots,
  getAddableDateCounts,
  moveCalendarSlots,
  type CalendarServiceResult,
} from "./service";
import { startCalendarDraftBatch, pumpCalendarDraftBatch, cancelCalendarDraftBatch } from "./drafting-service";

/** Server actions return plain serialisable results; the service owns all checks. */
export type CalendarActionResult<T = null> = CalendarServiceResult<T>;

export async function addCalendarEntryAction(clientId: string, input: unknown) {
  return addCalendarEntry(clientId, input);
}

export async function moveCalendarSlotsAction(clientId: string, input: unknown) {
  return moveCalendarSlots(clientId, input);
}

export async function getAddableDateCountsAction(clientId: string) {
  return getAddableDateCounts(clientId);
}

export async function cancelCalendarSlotsAction(
  clientId: string,
  monthKey: string,
  slotIds?: string[],
) {
  return cancelCalendarSlots(clientId, monthKey, { slotIds });
}

export async function startCalendarDraftBatchAction(clientId: string, calendarId: string, input: unknown) {
  return startCalendarDraftBatch(clientId, calendarId, input);
}

export async function pumpCalendarDraftBatchAction(clientId: string, jobId: string) {
  return pumpCalendarDraftBatch(clientId, jobId);
}

export async function cancelCalendarDraftBatchAction(clientId: string, jobId: string) {
  return cancelCalendarDraftBatch(clientId, jobId);
}
