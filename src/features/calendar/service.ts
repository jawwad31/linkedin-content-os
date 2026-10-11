import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  canAccessClient,
  canManageClientSetup,
  canManageIdeas,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  planAllocation,
  sumCounts,
  type AllocationPlan,
  type BucketCounts,
} from "./allocation";
import { monthKeyToDate } from "./months";
import {
  CALENDAR_COLUMNS,
  calendarFromRow,
  getCalendarDefaults,
  getCalendarForMonth,
  getCalendarSlots,
  getCandidateInventory,
  getReplannableUsageIds,
  settingsToColumns,
  splitSlots,
  type CalendarRecord,
} from "./queries";
import {
  calendarSourceHintSchema,
  cancelSlotsSchema,
  monthKeySchema,
  parseCalendarSettings,
  planSelectionSchema,
  type PlanSelection,
  type SettingsIssue,
} from "./schemas";

export type CalendarServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      issues?: SettingsIssue[];
      unavailable?: { sourceId: string; reason: string }[];
    };

const fail = (code: string, message: string) => ({ ok: false as const, code, message });

const AUTH_REQUIRED = fail("AUTH_REQUIRED", "You must be signed in to continue.");
const NO_ACCESS = fail("FORBIDDEN", "You do not have access to this client.");
const PLANNER_REQUIRED = fail(
  "FORBIDDEN",
  "You do not have permission to plan the calendar.",
);
const ADMIN_REQUIRED = fail(
  "FORBIDDEN",
  "Only Account and Agency Admins can change the account defaults.",
);
const INVALID_INPUT = fail("VALIDATION_ERROR", "Invalid input provided.");
const NOT_FOUND = fail("NOT_FOUND", "This month has not been saved yet. Save its settings first.");
const STALE = fail(
  "CONFLICT",
  "These settings changed since you opened them. Reload the page and try again.",
);
const GENERIC_FAILURE = fail("UNKNOWN_ERROR", "Something went wrong. Please try again.");

type Authorized = { userId: string; clientId: string };

async function authorize(
  clientId: string,
  level: "planner" | "admin",
): Promise<{ ok: true; auth: Authorized } | { ok: false; error: ReturnType<typeof fail> }> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, error: AUTH_REQUIRED };

  const parsedClient = z.string().uuid().safeParse(clientId);
  if (!parsedClient.success) return { ok: false, error: INVALID_INPUT };

  if (!(await canAccessClient(user.id, parsedClient.data))) {
    return { ok: false, error: NO_ACCESS };
  }

  const allowed =
    level === "admin"
      ? await canManageClientSetup(user.id, parsedClient.data)
      : await canManageIdeas(user.id, parsedClient.data);
  if (!allowed) {
    return { ok: false, error: level === "admin" ? ADMIN_REQUIRED : PLANNER_REQUIRED };
  }

  return { ok: true, auth: { userId: user.id, clientId: parsedClient.data } };
}

function revalidate(clientId: string) {
  revalidatePath(`/client/${clientId}/calendar`);
  revalidatePath(`/client/${clientId}/content-bank`);
}

function settingsFailure(issues: SettingsIssue[]) {
  return {
    ...fail("VALIDATION_ERROR", issues[0]?.message ?? "Invalid settings."),
    issues,
  };
}

/**
 * Save for this month: writes only the selected month's snapshot. The first save
 * creates the snapshot (remembering which defaults version it started from); later
 * saves bump its revision. Account defaults are never touched, and a saved plan is
 * not rewritten; replanning is a separate, previewed action.
 */
export async function saveMonthSettings(
  clientId: string,
  monthKey: string,
  rawSettings: unknown,
  expectedRevision: number | null,
): Promise<CalendarServiceResult<CalendarRecord>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const month = monthKeySchema.safeParse(monthKey);
  const parsed = parseCalendarSettings(rawSettings);
  if (!month.success) return INVALID_INPUT;
  if (!parsed.ok) return settingsFailure(parsed.issues);

  const { userId, clientId: verifiedClientId } = gate.auth;
  const supabase = await createClient();
  const columns = settingsToColumns(parsed.settings);
  const existing = await getCalendarForMonth(verifiedClientId, month.data);

  let saved: CalendarRecord | null = null;

  if (!existing) {
    const defaults = await getCalendarDefaults(verifiedClientId);
    const { data, error } = await supabase
      .from("content_calendars")
      .insert({
        client_id: verifiedClientId,
        month: monthKeyToDate(month.data),
        ...columns,
        defaults_version: defaults?.version ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select(CALENDAR_COLUMNS)
      .single();

    if (error?.code === "23505") return STALE;
    if (error || !data) return GENERIC_FAILURE;
    saved = calendarFromRow(data);
  } else {
    if (expectedRevision !== existing.settingsRevision) return STALE;

    const { data, error } = await supabase
      .from("content_calendars")
      .update({
        ...columns,
        settings_revision: existing.settingsRevision + 1,
        updated_by: userId,
      })
      .eq("id", existing.id)
      .eq("client_id", verifiedClientId)
      .eq("settings_revision", existing.settingsRevision)
      .select(CALENDAR_COLUMNS)
      .maybeSingle();

    if (error) return GENERIC_FAILURE;
    if (!data) return STALE;
    saved = calendarFromRow(data);
  }

  await writeAuditLog({
    clientId: verifiedClientId,
    userId,
    action: "calendar_month_settings_saved",
    entityType: "content_calendar",
    entityId: saved.id,
    metadata: {
      month: month.data,
      settings_revision: saved.settingsRevision,
      post_count: saved.settings.postCount,
    },
  });

  revalidate(verifiedClientId);
  return { ok: true, data: saved };
}

/**
 * Save as default: admin only. Changes the account's defaults for calendars created
 * afterwards. Existing month snapshots and their plans are not modified.
 */
export async function saveAccountDefaults(
  clientId: string,
  rawSettings: unknown,
  expectedVersion: number | null,
): Promise<CalendarServiceResult<{ version: number }>> {
  const gate = await authorize(clientId, "admin");
  if (!gate.ok) return gate.error;

  const parsed = parseCalendarSettings(rawSettings);
  if (!parsed.ok) return settingsFailure(parsed.issues);

  const { userId, clientId: verifiedClientId } = gate.auth;
  const supabase = await createClient();
  const columns = settingsToColumns(parsed.settings);
  const existing = await getCalendarDefaults(verifiedClientId);

  let version: number;

  if (!existing) {
    const { data, error } = await supabase
      .from("calendar_defaults")
      .insert({ client_id: verifiedClientId, version: 1, ...columns, updated_by: userId })
      .select("version")
      .single<{ version: number }>();

    if (error?.code === "23505") return STALE;
    if (error || !data) return GENERIC_FAILURE;
    version = data.version;
  } else {
    if (expectedVersion !== existing.version) return STALE;

    const { data, error } = await supabase
      .from("calendar_defaults")
      .update({ ...columns, version: existing.version + 1, updated_by: userId })
      .eq("client_id", verifiedClientId)
      .eq("version", existing.version)
      .select("version")
      .maybeSingle<{ version: number }>();

    if (error) return GENERIC_FAILURE;
    if (!data) return STALE;
    version = data.version;
  }

  await writeAuditLog({
    clientId: verifiedClientId,
    userId,
    action: "calendar_defaults_saved",
    entityType: "calendar_defaults",
    entityId: verifiedClientId,
    metadata: { version, post_count: parsed.settings.postCount },
  });

  revalidate(verifiedClientId);
  return { ok: true, data: { version } };
}

/** Explicit reset: copies the current account defaults into one month's snapshot. */
export async function resetMonthToDefaults(
  clientId: string,
  monthKey: string,
  expectedRevision: number,
): Promise<CalendarServiceResult<CalendarRecord>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const month = monthKeySchema.safeParse(monthKey);
  if (!month.success) return INVALID_INPUT;

  const { userId, clientId: verifiedClientId } = gate.auth;
  const [defaults, existing] = await Promise.all([
    getCalendarDefaults(verifiedClientId),
    getCalendarForMonth(verifiedClientId, month.data),
  ]);

  if (!defaults) {
    return fail("NO_DEFAULTS", "No account defaults have been saved yet.");
  }
  if (!existing) return NOT_FOUND;
  if (expectedRevision !== existing.settingsRevision) return STALE;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_calendars")
    .update({
      ...settingsToColumns(defaults.settings),
      defaults_version: defaults.version,
      settings_revision: existing.settingsRevision + 1,
      updated_by: userId,
    })
    .eq("id", existing.id)
    .eq("client_id", verifiedClientId)
    .eq("settings_revision", existing.settingsRevision)
    .select(CALENDAR_COLUMNS)
    .maybeSingle();

  if (error) return GENERIC_FAILURE;
  if (!data) return STALE;

  const saved = calendarFromRow(data);
  await writeAuditLog({
    clientId: verifiedClientId,
    userId,
    action: "calendar_month_reset_to_defaults",
    entityType: "content_calendar",
    entityId: saved.id,
    metadata: { month: month.data, defaults_version: defaults.version },
  });

  revalidate(verifiedClientId);
  return { ok: true, data: saved };
}

/** A source held by an unfinished slot that a confirmed replan would release. */
export type ReleasedReservation = {
  sourceId: string;
  sourceType: "founder_experience" | "content_resource";
  title: string;
  slotIndex: number;
  /** Still selected, but the month has no open allocation left for it. */
  reason: "beyond_capacity" | "not_selected";
};

export type PlanPreview = {
  plan: AllocationPlan;
  hasExistingPlan: boolean;
  /** Slots a confirmed replan would cancel and release. */
  replannableSlots: number;
  /** Slots kept because they already carry a post, or are queued or drafting. */
  preservedSlots: number;
  /** Source reservations among the replannable slots that the new plan drops. */
  releasedReservations: ReleasedReservation[];
  /**
   * The month's plan revision when this preview was built. A commit must send it
   * back; the database refuses the commit if the plan has since changed.
   */
  planRevision: number;
};

type LoadedPlanContext = {
  calendar: CalendarRecord;
  plan: AllocationPlan;
  hasExistingPlan: boolean;
  replannableSlots: number;
  preservedSlots: number;
  releasedReservations: ReleasedReservation[];
  requiredSource: PlanSelection["requiredSource"] | null;
};

/**
 * Builds the proposed plan from the month's saved snapshot and the user's selected
 * entries. Selections are checked against the live inventory; an entry that is no
 * longer eligible is reported rather than silently dropped. Nothing is written.
 */
async function buildPlan(
  clientId: string,
  monthKey: string,
  rawSelection: unknown,
): Promise<
  | { ok: true; context: LoadedPlanContext }
  | { ok: false; error: ReturnType<typeof fail> & { unavailable?: { sourceId: string; reason: string }[] } }
> {
  const month = monthKeySchema.safeParse(monthKey);
  const selection = planSelectionSchema.safeParse(rawSelection);
  if (!month.success || !selection.success) return { ok: false, error: INVALID_INPUT };

  const calendar = await getCalendarForMonth(clientId, month.data);
  if (!calendar) return { ok: false, error: NOT_FOUND };

  const slots = await getCalendarSlots(clientId, calendar.id);
  const { preserved, replannable, locked } = splitSlots(slots);
  const heldUsage = await getReplannableUsageIds(clientId, calendar.id);
  const inventory = await getCandidateInventory(clientId, slots, heldUsage);
  const requiredSource = selection.data.requiredSource ?? null;
  const requiredLockedSlot = requiredSource
    ? locked.find((slot) =>
        slot.sourceId === requiredSource.sourceId &&
        slot.sourceType === requiredSource.sourceType)
    : null;

  const eligible = new Set([
    ...inventory.experience.map((entry) => entry.id),
    ...inventory.asset.map((entry) => entry.id),
  ]);
  const requested = [...selection.data.experienceIds, ...selection.data.assetIds];
  const missing = requested.filter((id) =>
    !eligible.has(id) && id !== requiredLockedSlot?.sourceId);
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        ...fail(
          "SOURCE_UNAVAILABLE",
          "Some selected entries are no longer available. Review the list and select again.",
        ),
        unavailable: missing.map((sourceId) => ({ sourceId, reason: "NOT_AVAILABLE" })),
      },
    };
  }

  // An id must be in the bucket it was submitted under, so an experience id cannot be
  // planned as an asset (or the reverse).
  const experienceIds = new Set(inventory.experience.map((entry) => entry.id));
  const assetIds = new Set(inventory.asset.map((entry) => entry.id));
  const crossBucket =
    selection.data.experienceIds.some((id) =>
      !experienceIds.has(id) &&
      !(requiredLockedSlot?.sourceType === "founder_experience" && requiredLockedSlot.sourceId === id)) ||
    selection.data.assetIds.some((id) =>
      !assetIds.has(id) &&
      !(requiredLockedSlot?.sourceType === "content_resource" && requiredLockedSlot.sourceId === id));
  if (crossBucket) return { ok: false, error: INVALID_INPUT };

  if (requiredSource && !requiredLockedSlot) {
    const selectedInCorrectBucket = requiredSource.sourceType === "founder_experience"
      ? selection.data.experienceIds.includes(requiredSource.sourceId)
      : selection.data.assetIds.includes(requiredSource.sourceId);
    if (!selectedInCorrectBucket || !eligible.has(requiredSource.sourceId)) {
      return {
        ok: false,
        error: fail(
          "SOURCE_UNAVAILABLE",
          "The Content Bank entry is no longer eligible for this month. Return to Content Bank or choose another source.",
        ),
      };
    }
  }

  const selectedExperienceIds = selection.data.experienceIds.filter((id) =>
    !(requiredLockedSlot?.sourceType === "founder_experience" && requiredLockedSlot.sourceId === id));
  const selectedAssetIds = selection.data.assetIds.filter((id) =>
    !(requiredLockedSlot?.sourceType === "content_resource" && requiredLockedSlot.sourceId === id));

  const plan = planAllocation({
    settings: calendar.settings,
    selection: {
      experience: selectedExperienceIds,
      asset: selectedAssetIds,
    },
    available: { experience: inventory.experience.length, asset: inventory.asset.length },
    preserved,
  });

  if (requiredSource && !requiredLockedSlot) {
    const included = plan.slots.some((slot) =>
      slot.sourceId === requiredSource.sourceId &&
      slot.sourceType === requiredSource.sourceType);
    if (!included) {
      const label = requiredSource.sourceType === "founder_experience"
        ? "experience"
        : "asset";
      return {
        ok: false,
        error: fail(
          "SOURCE_CAPACITY",
          `This month has no open ${label} allocation for the selected Content Bank entry. Adjust and save the monthly count or source percentages, then preview again.`,
        ),
      };
    }
  }

  // Reservations held by unfinished slots survive a replan only when the new plan
  // keeps the same entry. Name every other one so the user sees what is released.
  const ignored = new Set([
    ...plan.ignoredSelections.experience,
    ...plan.ignoredSelections.asset,
  ]);
  const releasedReservations: ReleasedReservation[] = replannable.flatMap((slot) => {
    const { sourceId, sourceType } = slot;
    if (!sourceId || !sourceType) return [];
    const kept = plan.slots.some((planned) =>
      planned.sourceId === sourceId && planned.sourceType === sourceType);
    if (kept) return [];
    return [{
      sourceId,
      sourceType,
      title: slot.sourceTitle ?? "Untitled entry",
      slotIndex: slot.slotIndex,
      reason: ignored.has(sourceId) ? "beyond_capacity" as const : "not_selected" as const,
    }];
  });

  return {
    ok: true,
    context: {
      calendar,
      plan,
      hasExistingPlan: slots.length > 0,
      replannableSlots: replannable.length,
      preservedSlots: sumCounts(preserved),
      releasedReservations,
      requiredSource,
    },
  };
}

export async function previewCalendarPlan(
  clientId: string,
  monthKey: string,
  rawSelection: unknown,
): Promise<CalendarServiceResult<PlanPreview>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const built = await buildPlan(gate.auth.clientId, monthKey, rawSelection);
  if (!built.ok) return built.error;

  const {
    calendar,
    plan,
    hasExistingPlan,
    replannableSlots,
    preservedSlots,
    releasedReservations,
  } = built.context;
  return {
    ok: true,
    data: {
      plan,
      hasExistingPlan,
      replannableSlots,
      preservedSlots,
      releasedReservations,
      planRevision: calendar.planRevision,
    },
  };
}

type CommitRpcResult = {
  ok?: boolean;
  code?: string;
  plan_revision?: number;
  slot_count?: number;
  released?: number;
  unavailable?: { source_id: string; reason: string }[];
};

export type CommittedCalendarSource = {
  sourceId: string;
  sourceType: "founder_experience" | "content_resource";
  slotId: string;
  state: "reserved" | "already_in_month";
};

export type CommitCalendarPlanResult = {
  planRevision: number;
  slotCount: number;
  released: number;
  selectedSource: CommittedCalendarSource | null;
};

async function confirmCalendarSourceAssignment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  calendarId: string,
  source: NonNullable<PlanSelection["requiredSource"]>,
): Promise<CommittedCalendarSource | null> {
  const slot = await supabase.from("calendar_slots")
    .select("id,source_usage_id,post_id")
    .eq("client_id", clientId)
    .eq("calendar_id", calendarId)
    .eq("source_id", source.sourceId)
    .eq("source_type", source.sourceType)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle<{ id: string; source_usage_id: string | null; post_id: string | null }>();
  if (slot.error || !slot.data) return null;

  if (slot.data.post_id) {
    return { ...source, slotId: slot.data.id, state: "already_in_month" };
  }
  if (!slot.data.source_usage_id) return null;

  const usage = await supabase.from("source_usage")
    .select("id")
    .eq("id", slot.data.source_usage_id)
    .eq("client_id", clientId)
    .eq("source_id", source.sourceId)
    .eq("source_type", source.sourceType)
    .eq("channel", "calendar_slot")
    .eq("status", "reserved")
    .maybeSingle<{ id: string }>();
  if (usage.error || usage.data?.id !== slot.data.source_usage_id) return null;

  return { ...source, slotId: slot.data.id, state: "reserved" };
}

/**
 * Read-only: reports whether one Content Bank entry holds a confirmed slot and
 * reservation in a month. The browser calls it after a commit response is lost, so
 * it can tell an assignment that succeeded from a request that did not, without
 * sending another reservation.
 */
export async function checkCalendarSourceAssignment(
  clientId: string,
  monthKey: string,
  rawSource: unknown,
): Promise<CalendarServiceResult<{ assignment: CommittedCalendarSource | null }>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const month = monthKeySchema.safeParse(monthKey);
  const source = calendarSourceHintSchema.safeParse(rawSource);
  if (!month.success || !source.success) return INVALID_INPUT;

  const calendar = await getCalendarForMonth(gate.auth.clientId, month.data);
  if (!calendar) return { ok: true, data: { assignment: null } };

  const supabase = await createClient();
  const assignment = await confirmCalendarSourceAssignment(
    supabase,
    gate.auth.clientId,
    calendar.id,
    source.data,
  );
  return { ok: true, data: { assignment } };
}

const PLAN_CHANGED_MESSAGE =
  "This month's plan changed after you previewed it. Nothing was changed. Reload, review the latest plan and preview again.";

const planRevisionSchema = z.number().int().min(0).max(2_147_483_647);

const COMMIT_MESSAGES: Record<string, string> = {
  PLAN_REVISION_CONFLICT: PLAN_CHANGED_MESSAGE,
  PLAN_REVISION_REQUIRED:
    "The plan revision is missing. Reload, review the latest plan and preview again.",
  PLAN_EXISTS: "This month already has a plan. Preview and confirm a replan to change it.",
  TOO_MANY_SLOTS: "The plan has more slots than this month's post count allows.",
  DUPLICATE_SOURCE: "An entry can be planned only once in a month.",
  NOT_FOUND: "This month could not be found.",
};

/**
 * Commits the plan: recomputes it on the server from the saved snapshot and the
 * selected entry ids (nothing the browser computed is trusted), then writes slots
 * and reservations in one SQL transaction. If any selected entry was claimed in the
 * meantime, nothing is written and the unavailable entries are reported.
 *
 * `expectedPlanRevision` is the revision returned by the preview the user
 * confirmed. The database compares it under the calendar-row lock, so a plan that
 * another session committed in between is never replaced unseen. It is never
 * defaulted from a fresh read here, which would defeat the check.
 */
export async function commitCalendarPlan(
  clientId: string,
  monthKey: string,
  rawSelection: unknown,
  confirmReplace: boolean,
  expectedPlanRevision: unknown,
): Promise<CalendarServiceResult<CommitCalendarPlanResult>> {
  const gate = await authorize(clientId, "planner");
  if (!gate.ok) return gate.error;

  const expectedRevision = planRevisionSchema.safeParse(expectedPlanRevision);
  if (!expectedRevision.success) {
    return fail("PLAN_REVISION_REQUIRED", COMMIT_MESSAGES.PLAN_REVISION_REQUIRED);
  }

  const { userId, clientId: verifiedClientId } = gate.auth;
  const built = await buildPlan(verifiedClientId, monthKey, rawSelection);
  if (!built.ok) return built.error;

  const { calendar, plan, hasExistingPlan, requiredSource } = built.context;

  if (hasExistingPlan && !confirmReplace) {
    return fail(
      "REPLAN_CONFIRMATION_REQUIRED",
      "This month already has a plan. Confirm the replan to apply these changes.",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("commit_calendar_plan", {
    p_client_id: verifiedClientId,
    p_calendar_id: calendar.id,
    p_slots: plan.slots.map((slot) => ({
      bucket: slot.bucket,
      requested_bucket: slot.requestedBucket,
      shortage_reason: slot.shortageReason,
      source_id: slot.sourceId,
      source_type: slot.sourceType,
    })),
    p_replace: hasExistingPlan,
    p_expected_plan_revision: expectedRevision.data,
  });

  const result = data as CommitRpcResult | null;
  if (error || !result) return GENERIC_FAILURE;

  if (!result.ok) {
    const code = result.code ?? "UNKNOWN_ERROR";
    if (code === "SOURCE_UNAVAILABLE") {
      return {
        ...fail(
          code,
          "Another plan claimed one or more of these entries first. Nothing was reserved. Review the list and select again.",
        ),
        unavailable: (result.unavailable ?? []).map((entry) => ({
          sourceId: entry.source_id,
          reason: entry.reason,
        })),
      };
    }
    return fail(code, COMMIT_MESSAGES[code] ?? GENERIC_FAILURE.message);
  }

  const selectedSource = requiredSource
    ? await confirmCalendarSourceAssignment(
        supabase,
        verifiedClientId,
        calendar.id,
        requiredSource,
      )
    : null;
  const selectedSourceUnconfirmed = Boolean(requiredSource && !selectedSource);

  await writeAuditLog({
    clientId: verifiedClientId,
    userId,
    action: "calendar_plan_committed",
    entityType: "content_calendar",
    entityId: calendar.id,
    metadata: {
      month: calendar.month,
      plan_revision: result.plan_revision ?? null,
      replaced: hasExistingPlan,
      slot_count: result.slot_count ?? plan.slots.length,
      released: result.released ?? 0,
      requested: plan.requested as BucketCounts,
      actual: plan.actual as BucketCounts,
      selected_source_id: requiredSource?.sourceId ?? null,
      selected_source_type: requiredSource?.sourceType ?? null,
      selected_source_confirmed: requiredSource ? Boolean(selectedSource) : null,
    },
  });

  revalidate(verifiedClientId);
  if (selectedSourceUnconfirmed) {
    return fail(
      "COMMIT_UNCONFIRMED",
      "The calendar plan was saved, but the selected Content Bank reservation could not be confirmed. Refresh the month before trying again.",
    );
  }
  return {
    ok: true,
    data: {
      planRevision: result.plan_revision ?? calendar.planRevision + 1,
      slotCount: result.slot_count ?? plan.slots.length,
      released: result.released ?? 0,
      selectedSource,
    },
  };
}

/**
 * Cancels planned slots (all of them when no ids are given) and releases their
 * reservations. Slots that already carry a post are never cancelled here.
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
