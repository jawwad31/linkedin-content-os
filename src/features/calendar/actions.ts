"use server";

import {
  cancelCalendarSlots,
  commitCalendarPlan,
  previewCalendarPlan,
  resetMonthToDefaults,
  saveAccountDefaults,
  saveMonthSettings,
  type CalendarServiceResult,
  type PlanPreview,
} from "./service";
import { startCalendarDraftBatch, pumpCalendarDraftBatch, cancelCalendarDraftBatch } from "./drafting-service";

/** Server actions return plain serialisable results; the service owns all checks. */
export type CalendarActionResult<T = null> = CalendarServiceResult<T>;

export async function saveMonthSettingsAction(
  clientId: string,
  monthKey: string,
  settings: unknown,
  expectedRevision: number | null,
) {
  const result = await saveMonthSettings(clientId, monthKey, settings, expectedRevision);
  return result.ok
    ? ({ ok: true, data: { settingsRevision: result.data.settingsRevision } } as const)
    : result;
}

export async function saveAccountDefaultsAction(
  clientId: string,
  settings: unknown,
  expectedVersion: number | null,
) {
  return saveAccountDefaults(clientId, settings, expectedVersion);
}

export async function resetMonthToDefaultsAction(
  clientId: string,
  monthKey: string,
  expectedRevision: number,
) {
  const result = await resetMonthToDefaults(clientId, monthKey, expectedRevision);
  return result.ok
    ? ({ ok: true, data: { settingsRevision: result.data.settingsRevision } } as const)
    : result;
}

export async function previewCalendarPlanAction(
  clientId: string,
  monthKey: string,
  selection: unknown,
): Promise<CalendarServiceResult<PlanPreview>> {
  return previewCalendarPlan(clientId, monthKey, selection);
}

export async function commitCalendarPlanAction(
  clientId: string,
  monthKey: string,
  selection: unknown,
  confirmReplace: boolean,
) {
  return commitCalendarPlan(clientId, monthKey, selection, confirmReplace);
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
