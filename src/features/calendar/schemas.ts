import { z } from "zod";

import { ALLOCATION_BUCKETS } from "@/lib/ai/playbooks/taxonomies";

import {
  MAX_POST_COUNT,
  maxNewsCount,
  type CalendarSettings,
} from "./allocation";
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

export const planSelectionSchema = z.object({
  experienceIds: z.array(z.string().uuid()).max(MAX_POST_COUNT),
  assetIds: z.array(z.string().uuid()).max(MAX_POST_COUNT),
  requiredSource: z.object({
    sourceId: z.string().uuid(),
    sourceType: z.enum(["founder_experience", "content_resource"]),
  }).strict().optional(),
});

export type PlanSelection = z.infer<typeof planSelectionSchema>;

export const calendarSourceHintSchema = z.object({
  sourceId: z.string().uuid(),
  sourceType: z.enum(["founder_experience", "content_resource"]),
}).strict();

export type CalendarIncomingSource = z.infer<typeof calendarSourceHintSchema> & {
  title: string;
  bucket: "experience" | "asset";
  state: "eligible" | "already_in_month" | "unavailable";
  message: string;
  slotId: string | null;
};

export const cancelSlotsSchema = z.object({
  slotIds: z.array(z.string().uuid()).max(MAX_POST_COUNT).optional(),
});
