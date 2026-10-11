import { z } from "zod";

import { ALLOCATION_BUCKETS } from "@/lib/ai/playbooks/taxonomies";

import {
  MAX_POST_COUNT,
  maxNewsCount,
  type CalendarSettings,
} from "./allocation";
import { isValidDate } from "./dates";
import { isValidMonthKey } from "./months";

export const monthKeySchema = z
  .string()
  .refine(isValidMonthKey, "Choose a valid month (YYYY-MM).");

export const BUCKET_LABELS: Record<(typeof ALLOCATION_BUCKETS)[number], string> = {
  experience: "Experience & original observation",
  asset: "Lead magnet & other assets",
  evergreen: "Evergreen & profile-led",
  news: "News & trends",
};

const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z_]*(?:\/[A-Za-z0-9_+-]+)*$/;

export function isValidTimeZone(value: string): boolean {
  if (!TIMEZONE_PATTERN.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const percent = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} cannot be negative.`)
    .max(100, `${label} cannot be more than 100%.`);

const baseSettingsSchema = z.object({
  timezone: z
    .string({ error: "Choose a timezone." })
    .trim()
    .refine(isValidTimeZone, "Choose a valid timezone, such as Asia/Karachi."),
  postCount: z
    .number({ error: "Posts per month must be a number." })
    .int("Posts per month must be a whole number.")
    .min(1, "Plan at least one post.")
    .max(MAX_POST_COUNT, `Plan at most ${MAX_POST_COUNT} posts in a month.`),
  shares: z.object({
    experience: percent("Experience share"),
    asset: percent("Asset share"),
    evergreen: percent("Evergreen share"),
    news: percent("News share"),
  }),
  newsCapPercent: percent("News cap"),
});

export const calendarSettingsSchema = baseSettingsSchema.superRefine(
  (settings, ctx) => {
    const total =
      settings.shares.experience +
      settings.shares.asset +
      settings.shares.evergreen +
      settings.shares.news;

    if (total !== 100) {
      ctx.addIssue({
        code: "custom",
        path: ["shares"],
        message: `Shares must add up to 100% (they add up to ${total}%).`,
      });
    }

    if (settings.shares.news > settings.newsCapPercent) {
      ctx.addIssue({
        code: "custom",
        path: ["shares", "news"],
        message: `News share (${settings.shares.news}%) is above the news cap (${settings.newsCapPercent}%). Lower the share or raise the cap.`,
      });
    }
  },
);

export type SettingsIssue = { field: string; message: string };

export type ParsedSettings =
  | { ok: true; settings: CalendarSettings }
  | { ok: false; issues: SettingsIssue[] };

/** Validates settings and maps problems to form fields for inline display. */
export function parseCalendarSettings(raw: unknown): ParsedSettings {
  const result = calendarSettingsSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, settings: result.data };
  }

  const seen = new Set<string>();
  const issues: SettingsIssue[] = [];
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "form";
    const key = `${field}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({ field, message: issue.message });
  }
  return { ok: false, issues };
}

/** Whether the news cap leaves room for even one news post this month. */
export function newsRoom(settings: Pick<CalendarSettings, "postCount" | "newsCapPercent">): number {
  return maxNewsCount(settings.postCount, settings.newsCapPercent);
}

const sourceTypeSchema = z.enum(["founder_experience", "content_resource"]);
const dateSchema = z.string().refine(isValidDate, "Choose a valid date.");

/** One Content Bank entry reserved on one date (this month or next). */
export const addCalendarEntrySchema = z.object({
  sourceId: z.string().uuid(),
  sourceType: sourceTypeSchema,
  date: dateSchema,
  /** True only after the user answered "add another post on this day?" with yes. */
  allowSameDay: z.boolean(),
}).strict();

export type AddCalendarEntryInput = z.infer<typeof addCalendarEntrySchema>;

/** Replan month: several reserved entries moved to new dates in one save. */
export const moveCalendarSlotsSchema = z.object({
  calendarId: z.string().uuid(),
  moves: z.array(z.object({ slotId: z.string().uuid(), date: dateSchema }).strict())
    .min(1)
    .max(100),
  allowSameDay: z.boolean(),
  /** The plan revision the user was looking at; the database refuses a stale one. */
  expectedPlanRevision: z.number().int().min(0).max(2_147_483_647),
}).strict();

export type MoveCalendarSlotsInput = z.infer<typeof moveCalendarSlotsSchema>;

export const cancelSlotsSchema = z.object({
  slotIds: z.array(z.string().uuid()).max(MAX_POST_COUNT).optional(),
});
