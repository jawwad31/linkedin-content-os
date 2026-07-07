import { z } from "zod";

/**
 * Content columns this feature reads/writes on rss_sources, shared between
 * the update action's before/after diff so audit metadata only ever lists
 * field names, never values. `active` and `deleted_at` are managed by
 * separate actions (toggle/archive), not this form.
 */
export const RSS_SOURCE_COLUMNS = [
  "source_name",
  "feed_url",
  "category",
  "recency_days",
] as const;

export type RssSourceColumn = (typeof RSS_SOURCE_COLUMNS)[number];

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);
const optionalText = (max: number) => z.string().trim().max(max);

export const rssSourceFormSchema = z.object({
  sourceName: requiredText(200, "Source name is required."),
  feedUrl: requiredText(2000, "Feed URL is required.").superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid http or https URL.",
      });
      return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid http or https URL.",
      });
    }
  }),
  category: optionalText(100),
  recencyDays: z.coerce
    .number()
    .int("Recency window must be a whole number of days.")
    .min(1, "Recency window must be at least 1 day.")
    .max(365, "Recency window cannot be more than 365 days."),
});

export type RssSourceFormInput = z.infer<typeof rssSourceFormSchema>;

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

/**
 * Maps validated form input to the exact rss_sources columns this feature is
 * allowed to write (used for both insert and update).
 */
export function toRssSourceRow(input: RssSourceFormInput) {
  return {
    source_name: input.sourceName,
    feed_url: input.feedUrl,
    category: emptyToNull(input.category),
    recency_days: input.recencyDays,
  } satisfies Record<RssSourceColumn, unknown>;
}
