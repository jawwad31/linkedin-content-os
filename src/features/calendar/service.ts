import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canManageIdeas } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { addableMonths, daysInMonth, dateInMonth, todayInTimezone } from "./dates";
import {
  getCalendarDefaults,
  getCalendarForMonth,
  getScheduledCounts,
} from "./queries";
import {
  addCalendarEntrySchema,
  cancelSlotsSchema,
  monthKeySchema,
  moveCalendarSlotsSchema,
} from "./schemas";

/** A post already on a day, named so the user knows what "add another" means. */
export type SameDayPost = { slotId: string; title: string; status: string };
export type SameDayDate = { date: string; incoming: number; posts: SameDayPost[] };

export type CalendarServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      /** Set with DATE_HAS_POSTS when adding one entry. */
      sameDayPosts?: SameDayPost[];
      /** Set with DATE_HAS_POSTS when moving several entries. */
      sameDayDates?: SameDayDate[];
    };

const fail = (code: string, message: string) => ({ ok: false as const, code, message });

const AUTH_REQUIRED = fail("AUTH_REQUIRED", "You must be signed in to continue.");
const NO_ACCESS = fail("FORBIDDEN", "You do not have access to this account.");
const PLANNER_REQUIRED = fail(
  "FORBIDDEN",
  "You need the Manage ideas capability to change the calendar. Ask an account admin to add it.",
);
const INVALID_INPUT = fail("VALIDATION_ERROR", "Invalid input provided.");
const NOT_FOUND = fail("NOT_FOUND", "This month could not be found.");
const GENERIC_FAILURE = fail("UNKNOWN_ERROR", "Something went wrong. Nothing was changed. Please try again.");

type Authorized = { userId: string; clientId: string };

async function authorize(
  clientId: string,
  level: "reader" | "planner",
): Promise<{ ok: true; auth: Authorized } | { ok: false; error: ReturnType<typeof fail> }> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, error: AUTH_REQUIRED };

  const parsedClient = z.string().uuid().safeParse(clientId);
  if (!parsedClient.success) return { ok: false, error: INVALID_INPUT };

  if (!(await canAccessClient(user.id, parsedClient.data))) {
    return { ok: false, error: NO_ACCESS };
  }
  if (level === "planner" && !(await canManageIdeas(user.id, parsedClient.data))) {
    return { ok: false, error: PLANNER_REQUIRED };
  }

  return { ok: true, auth: { userId: user.id, clientId: parsedClient.data } };
}

function revalidate(clientId: string) {
  revalidatePath(`/client/${clientId}/calendar`);
  revalidatePath(`/client/${clientId}/content-bank`);
}

type RpcSameDayPost = { slot_id: string; title: string | null; status: string };

function toSameDayPosts(posts: RpcSameDayPost[] | undefined): SameDayPost[] {
  return (posts ?? []).map((post) => ({
    slotId: post.slot_id,
    title: post.title ?? "Untitled entry",
    status: post.status,
  }));
}

const DATE_MESSAGES: Record<string, string> = {
  DATE_IN_PAST: "Past dates cannot be chosen. Pick today or a later date.",
  DATE_OUT_OF_RANGE: "Choose a date in this month or next month.",
  FORBIDDEN: PLANNER_REQUIRED.message,
  VALIDATION_ERROR: INVALID_INPUT.message,
  NOT_FOUND: NOT_FOUND.message,
};

const SOURCE_REASON_MESSAGES: Record<string, string> = {
  NOT_AVAILABLE: "This entry is no longer ready to use. Check it in the Content Bank.",
  ALREADY_IN_CALENDAR: "This entry is already on the calendar for that month.",
  SINGLE_USE_CONFLICT:
    "This single-use entry is already reserved or used. Turn on reuse in the Content Bank to use it again.",
};

type AddRpcResult = {
  ok?: boolean;
  code?: string;
  reason?: string;
  slot_id?: string;
  calendar_id?: string;
  plan_revision?: number;
  scheduled_date?: string;
  posts_on_day?: number;
  posts?: RpcSameDayPost[];
};

export type AddedCalendarEntry = {
  slotId: string;
  calendarId: string;
  date: string;
  postsOnDay: number;
  planRevision: number;
};

/**
 * Reserves one Content Bank entry on one date (this month or next). The database
 * checks the capability, the date range, that the entry is ready and unclaimed, and
 * whether the day already has posts, then writes the slot and its reservation in one
 * transaction. A day with posts returns `DATE_HAS_POSTS` until the caller confirms.
 */
export async function addCalendarEntry(
  clientId: string,
  rawInput: unknown,
): Promise<CalendarServiceResult<AddedCalendarEntry>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const input = addCalendarEntrySchema.safeParse(rawInput);
  if (!input.success) return INVALID_INPUT;

  const { userId, clientId: verifiedClientId } = gate.auth;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_calendar_entry", {
    p_client_id: verifiedClientId,
    p_source_id: input.data.sourceId,
    p_source_type: input.data.sourceType,
    p_date: input.data.date,
    p_allow_same_day: input.data.allowSameDay,
  });

  const result = data as AddRpcResult | null;
  if (error || !result) return GENERIC_FAILURE;

  if (!result.ok) {
    const code = result.code ?? "UNKNOWN_ERROR";
    if (code === "DATE_HAS_POSTS") {
      return {
        ...fail(code, "That day already has posts. Add another post on the same day?"),
        sameDayPosts: toSameDayPosts(result.posts),
      };
    }
    if (code === "SOURCE_UNAVAILABLE") {
      return fail(
        code,
        SOURCE_REASON_MESSAGES[result.reason ?? ""] ?? "This entry is not available for the calendar.",
      );
    }
    return fail(code, DATE_MESSAGES[code] ?? GENERIC_FAILURE.message);
  }

  if (!result.slot_id || !result.calendar_id) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: verifiedClientId,
    userId,
    action: "calendar_entry_added",
    entityType: "calendar_slot",
    entityId: result.slot_id,
    metadata: {
      calendar_id: result.calendar_id,
      source_id: input.data.sourceId,
      source_type: input.data.sourceType,
      date: input.data.date,
      posts_on_day: result.posts_on_day ?? 1,
    },
  });

  revalidate(verifiedClientId);
  return {
    ok: true,
    data: {
      slotId: result.slot_id,
      calendarId: result.calendar_id,
      date: result.scheduled_date ?? input.data.date,
      postsOnDay: result.posts_on_day ?? 1,
      planRevision: result.plan_revision ?? 0,
    },
  };
}

type MoveRpcResult = {
  ok?: boolean;
  code?: string;
  moved?: number;
  plan_revision?: number;
  slot_ids?: string[];
  dates?: { date: string; incoming: number; posts: RpcSameDayPost[] }[];
};

export type MovedCalendarSlots = { moved: number; planRevision: number };

/**
 * Replan month: moves several reserved entries to new dates in one save. The
 * database refuses the whole save if the plan changed since the caller loaded it, if
 * any entry is no longer a plain reservation, or if a date is invalid.
 */
export async function moveCalendarSlots(
  clientId: string,
  rawInput: unknown,
): Promise<CalendarServiceResult<MovedCalendarSlots>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const input = moveCalendarSlotsSchema.safeParse(rawInput);
  if (!input.success) return INVALID_INPUT;

  const { userId, clientId: verifiedClientId } = gate.auth;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_calendar_slots", {
    p_client_id: verifiedClientId,
    p_calendar_id: input.data.calendarId,
    p_moves: input.data.moves.map((move) => ({ slot_id: move.slotId, date: move.date })),
    p_allow_same_day: input.data.allowSameDay,
    p_expected_plan_revision: input.data.expectedPlanRevision,
  });

  const result = data as MoveRpcResult | null;
  if (error || !result) return GENERIC_FAILURE;

  if (!result.ok) {
    const code = result.code ?? "UNKNOWN_ERROR";
    if (code === "DATE_HAS_POSTS") {
      return {
        ...fail(code, "Some of those days already have posts. Move them there anyway?"),
        sameDayDates: (result.dates ?? []).map((entry) => ({
          date: entry.date,
          incoming: entry.incoming,
          posts: toSameDayPosts(entry.posts),
        })),
      };
    }
    if (code === "PLAN_REVISION_CONFLICT" || code === "PLAN_REVISION_REQUIRED") {
      return fail(
        "PLAN_REVISION_CONFLICT",
        "This month changed after you opened it. Nothing was moved. Reload, check the dates and try again.",
      );
    }
    if (code === "SLOT_NOT_MOVABLE") {
      return fail(code, "Only reserved entries can be moved. Drafting and drafted posts stay where they are.");
    }
    if (code === "SLOT_NOT_FOUND") {
      return fail(code, "One of those entries is no longer on this calendar. Reload and try again.");
    }
    return fail(code, DATE_MESSAGES[code] ?? GENERIC_FAILURE.message);
  }

  await writeAuditLog({
    clientId: verifiedClientId,
    userId,
    action: "calendar_slots_moved",
    entityType: "content_calendar",
    entityId: input.data.calendarId,
    metadata: {
      moved: result.moved ?? 0,
      requested: input.data.moves.length,
      plan_revision: result.plan_revision ?? null,
    },
  });

  revalidate(verifiedClientId);
  return {
    ok: true,
    data: { moved: result.moved ?? 0, planRevision: result.plan_revision ?? input.data.expectedPlanRevision },
  };
}

export type AddableDateCounts = {
  today: string;
  months: { monthKey: string; days: number; counts: Record<string, number> }[];
};

/** This month and next, with how many posts each date already has (for the date picker). */
export async function getAddableDateCounts(
  clientId: string,
): Promise<CalendarServiceResult<AddableDateCounts>> {
  const gate = await authorize(clientId, "reader");
  if (!gate.ok) return gate.error;

  const defaults = await getCalendarDefaults(gate.auth.clientId);
  const today = todayInTimezone(defaults?.settings.timezone);
  const [current, next] = addableMonths(today);
  const counts = await getScheduledCounts(
    gate.auth.clientId,
    dateInMonth(current, 1),
    dateInMonth(next, daysInMonth(next)),
  );

  const forMonth = (monthKey: string) => ({
    monthKey,
    days: daysInMonth(monthKey),
    counts: Object.fromEntries(Object.entries(counts).filter(([date]) => date.startsWith(monthKey))),
  });
  return { ok: true, data: { today, months: [forMonth(current), forMonth(next)] } };
}

/**
 * Removes planned or reserved entries from a month (all of them when no ids are
 * given) and releases their reservations. Slots that already carry a post are never
 * cancelled here.
 */
export async function cancelCalendarSlots(
  clientId: string,
  monthKey: string,
  rawInput: unknown,
): Promise<CalendarServiceResult<{ cancelled: number; released: number; preserved: number }>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const month = monthKeySchema.safeParse(monthKey);
  const input = cancelSlotsSchema.safeParse(rawInput ?? {});
  if (!month.success || !input.success) return INVALID_INPUT;

  const { userId, clientId: verifiedClientId } = gate.auth;
  const calendar = await getCalendarForMonth(verifiedClientId, month.data);
  if (!calendar) return NOT_FOUND;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_calendar_slots", {
    p_client_id: verifiedClientId,
    p_calendar_id: calendar.id,
    p_slot_ids: input.data.slotIds ?? null,
  });

  const result = data as
    | { ok?: boolean; code?: string; cancelled?: number; released?: number; preserved?: number }
    | null;
  if (error || !result?.ok) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: verifiedClientId,
    userId,
    action: "calendar_slots_cancelled",
    entityType: "content_calendar",
    entityId: calendar.id,
    metadata: {
      month: calendar.month,
      cancelled: result.cancelled ?? 0,
      released: result.released ?? 0,
      preserved: result.preserved ?? 0,
    },
  });

  revalidate(verifiedClientId);
  return {
    ok: true,
    data: {
      cancelled: result.cancelled ?? 0,
      released: result.released ?? 0,
      preserved: result.preserved ?? 0,
    },
  };
}
