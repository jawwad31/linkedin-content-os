import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/schema-errors";
import type { AllocationBucket } from "@/lib/ai/playbooks/taxonomies";

import {
  emptyCounts,
  type BucketCounts,
  type CalendarSettings,
  type ShortageReason,
  type SourceKind,
} from "./allocation";
import { dateToMonthKey, monthKeyToDate } from "./months";

type SettingsColumns = {
  timezone: string;
  post_count: number;
  share_experience: number;
  share_asset: number;
  share_evergreen: number;
  share_news: number;
  news_cap_percent: number;
};

const SETTINGS_COLUMNS =
  "timezone, post_count, share_experience, share_asset, share_evergreen, share_news, news_cap_percent";

export function settingsFromRow(row: SettingsColumns): CalendarSettings {
  return {
    timezone: row.timezone,
    postCount: row.post_count,
    shares: {
      experience: row.share_experience,
      asset: row.share_asset,
      evergreen: row.share_evergreen,
      news: row.share_news,
    },
    newsCapPercent: row.news_cap_percent,
  };
}

export function settingsToColumns(settings: CalendarSettings): SettingsColumns {
  return {
    timezone: settings.timezone,
    post_count: settings.postCount,
    share_experience: settings.shares.experience,
    share_asset: settings.shares.asset,
    share_evergreen: settings.shares.evergreen,
    share_news: settings.shares.news,
    news_cap_percent: settings.newsCapPercent,
  };
}

export type CalendarDefaultsRecord = {
  version: number;
  settings: CalendarSettings;
  updatedAt: string;
};

export type CalendarRecord = {
  id: string;
  month: string;
  settings: CalendarSettings;
  defaultsVersion: number | null;
  settingsRevision: number;
  planRevision: number;
  plannedAt: string | null;
};

export type CalendarSlotStatus = "placeholder" | "planned" | "reserved";

export type CalendarSlotRecord = {
  id: string;
  slotIndex: number;
  bucket: AllocationBucket;
  requestedBucket: AllocationBucket;
  shortageReason: ShortageReason | null;
  status: CalendarSlotStatus;
  sourceId: string | null;
  sourceType: SourceKind | null;
  sourceTitle: string | null;
  postId: string | null;
  postStatus: string | null;
};

export type CandidateEntry = {
  id: string;
  sourceType: SourceKind;
  title: string;
  summary: string | null;
  category: string;
  allowReuse: boolean;
  /** Times this entry has been used or published before. */
  usageCount: number;
  /** Held by a slot of this month's current plan that can still be replanned. */
  inPlan: boolean;
};

export type CandidateInventory = {
  experience: CandidateEntry[];
  asset: CandidateEntry[];
};

/**
 * False when the calendar tables do not exist yet, i.e. the P05 migration has not
 * been applied to this database. Lets the page say so instead of offering a form
 * whose saves would fail.
 */
export async function isCalendarAvailable(clientId: string): Promise<boolean> {
  const supabase = await createClient();
  // A plain GET, not HEAD: PostgREST gives a HEAD request no error body, and the client
  // library then reports a missing table as success.
  const { error } = await supabase
    .from("calendar_defaults")
    .select("client_id")
    .eq("client_id", clientId)
    .limit(1);

  return !isMissingTableError(error);
}

export async function getCalendarDefaults(
  clientId: string,
): Promise<CalendarDefaultsRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_defaults")
    .select(`version, updated_at, ${SETTINGS_COLUMNS}`)
    .eq("client_id", clientId)
    .maybeSingle<SettingsColumns & { version: number; updated_at: string }>();

  if (error || !data) return null;
  return {
    version: data.version,
    settings: settingsFromRow(data),
    updatedAt: data.updated_at,
  };
}

type CalendarRow = SettingsColumns & {
  id: string;
  month: string;
  defaults_version: number | null;
  settings_revision: number;
  plan_revision: number;
  planned_at: string | null;
};

export function calendarFromRow(row: CalendarRow): CalendarRecord {
  return {
    id: row.id,
    month: dateToMonthKey(row.month),
    settings: settingsFromRow(row),
    defaultsVersion: row.defaults_version,
    settingsRevision: row.settings_revision,
    planRevision: row.plan_revision,
    plannedAt: row.planned_at,
  };
}

export const CALENDAR_COLUMNS = `id, month, defaults_version, settings_revision, plan_revision, planned_at, ${SETTINGS_COLUMNS}`;

export async function getCalendarForMonth(
  clientId: string,
  monthKey: string,
): Promise<CalendarRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_calendars")
    .select(CALENDAR_COLUMNS)
    .eq("client_id", clientId)
    .eq("month", monthKeyToDate(monthKey))
    .maybeSingle<CalendarRow>();

  if (error || !data) return null;
  return calendarFromRow(data);
}

type SlotRow = {
  id: string;
  slot_index: number;
  bucket: AllocationBucket;
  requested_bucket: AllocationBucket;
  shortage_reason: ShortageReason | null;
  status: CalendarSlotStatus;
  source_id: string | null;
  source_type: SourceKind | null;
  post_id: string | null;
};

/** Active (non-cancelled) slots, with entry titles and post status attached. */
export async function getCalendarSlots(
  clientId: string,
  calendarId: string,
): Promise<CalendarSlotRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_slots")
    .select(
      "id, slot_index, bucket, requested_bucket, shortage_reason, status, source_id, source_type, post_id",
    )
    .eq("client_id", clientId)
    .eq("calendar_id", calendarId)
    .neq("status", "cancelled")
    .order("slot_index", { ascending: true })
    .returns<SlotRow[]>();

  if (error || !data) return [];

  const experienceIds = data
    .filter((slot) => slot.source_type === "founder_experience" && slot.source_id)
    .map((slot) => slot.source_id as string);
  const resourceIds = data
    .filter((slot) => slot.source_type === "content_resource" && slot.source_id)
    .map((slot) => slot.source_id as string);
  const postIds = data.filter((slot) => slot.post_id).map((slot) => slot.post_id as string);

  const [experiences, resources, posts] = await Promise.all([
    experienceIds.length
      ? supabase
          .from("founder_experiences")
          .select("id, title")
          .eq("client_id", clientId)
          .in("id", experienceIds)
          .returns<{ id: string; title: string }[]>()
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    resourceIds.length
      ? supabase
          .from("content_resources")
          .select("id, title")
          .eq("client_id", clientId)
          .in("id", resourceIds)
          .returns<{ id: string; title: string }[]>()
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    postIds.length
      ? supabase
          .from("posts")
          .select("id, status")
          .eq("client_id", clientId)
          .in("id", postIds)
          .returns<{ id: string; status: string }[]>()
      : Promise.resolve({ data: [] as { id: string; status: string }[] }),
  ]);

  const titles = new Map<string, string>();
  for (const row of [...(experiences.data ?? []), ...(resources.data ?? [])]) {
    titles.set(row.id, row.title);
  }
  const postStatuses = new Map((posts.data ?? []).map((row) => [row.id, row.status]));

  return data.map((slot) => ({
    id: slot.id,
    slotIndex: slot.slot_index,
    bucket: slot.bucket,
    requestedBucket: slot.requested_bucket,
    shortageReason: slot.shortage_reason,
    status: slot.status,
    sourceId: slot.source_id,
    sourceType: slot.source_type,
    sourceTitle: slot.source_id ? (titles.get(slot.source_id) ?? null) : null,
    postId: slot.post_id,
    postStatus: slot.post_id ? (postStatuses.get(slot.post_id) ?? null) : null,
  }));
}

/** Slots carrying a post are preserved on replan; the rest can be replanned. */
export function splitSlots(slots: CalendarSlotRecord[]): {
  preserved: BucketCounts;
  replannable: CalendarSlotRecord[];
  locked: CalendarSlotRecord[];
} {
  const preserved = emptyCounts();
  const replannable: CalendarSlotRecord[] = [];
  const locked: CalendarSlotRecord[] = [];

  for (const slot of slots) {
    if (slot.postId) {
      preserved[slot.bucket] += 1;
      locked.push(slot);
    } else {
      replannable.push(slot);
    }
  }

  return { preserved, replannable, locked };
}

type ExperienceRow = {
  id: string;
  title: string;
  category: string | null;
  takeaway: string | null;
  allow_reuse: boolean | null;
  updated_at: string;
};

type ResourceRow = {
  id: string;
  title: string;
  problem_solved: string | null;
  allow_reuse: boolean | null;
  updated_at: string;
};

type UsageRow = { id: string; source_id: string; status: string };

/**
 * Eligible Content Bank entries, counted from the database rather than found by
 * similarity search. An entry is eligible when it is ready, not archived or
 * deleted, not already held by a preserved slot of this calendar, and either
 * marked reusable or free of any active reservation or use. Reservations held
 * by this calendar's own replannable slots do not block it.
 *
 * Ranking is deterministic: least-used first, then most recently updated.
 */
export async function getCandidateInventory(
  clientId: string,
  slots: CalendarSlotRecord[],
  usageIdsHeldByReplannableSlots: Set<string>,
): Promise<CandidateInventory> {
  const supabase = await createClient();

  const [experiences, resources, usage] = await Promise.all([
    supabase
      .from("founder_experiences")
      .select("id, title, category, takeaway, allow_reuse, updated_at")
      .eq("client_id", clientId)
      .eq("readiness", "ready")
      .is("deleted_at", null)
      .returns<ExperienceRow[]>(),
    supabase
      .from("content_resources")
      .select("id, title, problem_solved, allow_reuse, updated_at")
      .eq("client_id", clientId)
      .eq("readiness", "ready")
      .eq("active", true)
      .is("deleted_at", null)
      .returns<ResourceRow[]>(),
    supabase
      .from("source_usage")
      .select("id, source_id, status")
      .eq("client_id", clientId)
      .in("status", ["reserved", "used", "published"])
      .returns<UsageRow[]>(),
  ]);

  const usageBySource = new Map<string, UsageRow[]>();
  for (const row of usage.data ?? []) {
    const rows = usageBySource.get(row.source_id) ?? [];
    rows.push(row);
    usageBySource.set(row.source_id, rows);
  }

  const lockedSources = new Set(
    slots.filter((slot) => slot.postId && slot.sourceId).map((slot) => slot.sourceId as string),
  );
  const inPlanSources = new Set(
    slots.filter((slot) => !slot.postId && slot.sourceId).map((slot) => slot.sourceId as string),
  );

  const toEntry = (
    base: { id: string; title: string; allowReuse: boolean; updatedAt: string },
    sourceType: SourceKind,
    category: string,
    summary: string | null,
  ): { entry: CandidateEntry; updatedAt: string } | null => {
    if (lockedSources.has(base.id)) return null;

    const rows = usageBySource.get(base.id) ?? [];
    const blocking = rows.filter(
      (row) => !usageIdsHeldByReplannableSlots.has(row.id),
    );
    if (!base.allowReuse && blocking.length > 0) return null;

    return {
      updatedAt: base.updatedAt,
      entry: {
        id: base.id,
        sourceType,
        title: base.title,
        summary,
        category,
        allowReuse: base.allowReuse,
        usageCount: rows.filter((row) => row.status === "used" || row.status === "published")
          .length,
        inPlan: inPlanSources.has(base.id),
      },
    };
  };

  const rank = (
    items: ({ entry: CandidateEntry; updatedAt: string } | null)[],
  ): CandidateEntry[] =>
    items
      .filter((item): item is { entry: CandidateEntry; updatedAt: string } => item !== null)
      .sort(
        (a, b) =>
          a.entry.usageCount - b.entry.usageCount ||
          b.updatedAt.localeCompare(a.updatedAt) ||
          a.entry.title.localeCompare(b.entry.title),
      )
      .map((item) => item.entry);

  return {
    experience: rank(
      (experiences.data ?? []).map((row) =>
        toEntry(
          {
            id: row.id,
            title: row.title,
            allowReuse: Boolean(row.allow_reuse),
            updatedAt: row.updated_at,
          },
          "founder_experience",
          row.category ?? "observation",
          row.takeaway,
        ),
      ),
    ),
    asset: rank(
      (resources.data ?? []).map((row) =>
        toEntry(
          {
            id: row.id,
            title: row.title,
            allowReuse: Boolean(row.allow_reuse),
            updatedAt: row.updated_at,
          },
          "content_resource",
          "lead_magnet",
          row.problem_solved,
        ),
      ),
    ),
  };
}

/** Usage ids reserved by slots of this calendar that a replan would release. */
export async function getReplannableUsageIds(
  clientId: string,
  calendarId: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_slots")
    .select("source_usage_id")
    .eq("client_id", clientId)
    .eq("calendar_id", calendarId)
    .neq("status", "cancelled")
    .is("post_id", null)
    .not("source_usage_id", "is", null)
    .returns<{ source_usage_id: string }[]>();

  return new Set((data ?? []).map((row) => row.source_usage_id));
}
