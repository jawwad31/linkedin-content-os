/**
 * Checks that decide whether a claim a model extracted is really on the page it came from.
 * Pure text rules, no network and no model: a claim, quote or date that fails here is dropped
 * or made unknown, whatever the model said.
 */

/** Same text with typographic differences removed, so a quote matches its page despite them. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[​-‍﻿­]/g, "")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** A quote this short could appear on any page, so it cannot support a claim. */
export const MIN_EXCERPT_CHARACTERS = 25;

/**
 * True when every stretch of the quote appears on the page, in the page's own words. A model may
 * join two passages with an ellipsis; each part must still be found. Case, spacing and curly
 * quotes do not matter. Anything the page does not contain does.
 */
export function quoteIsOnPage(
  quote: string,
  pageText: string,
  minimum = MIN_EXCERPT_CHARACTERS,
): boolean {
  const parts = normalizeForMatch(quote)
    .split("...")
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
  if (!parts.length || parts.join("").length < minimum) return false;
  const page = normalizeForMatch(pageText);
  return parts.every((part) => page.includes(part));
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** The ways a date is commonly written, lower case, so it can be looked for in a quote. */
export function dateWritings(iso: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return [];
  const [, year, mm, dd] = match;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12) return [];
  const long = MONTHS[month - 1];
  const short = long.slice(0, 3);
  const writings = [iso, `${year}/${mm}/${dd}`, `${month}/${day}/${year}`, `${mm}/${dd}/${year}`, `${dd}.${mm}.${year}`];
  for (const name of new Set([long, short, `${short}.`, long === "september" ? "sept" : long])) {
    for (const d of new Set([String(day), dd, `${day}${ordinal(day)}`])) {
      writings.push(`${name} ${d}, ${year}`, `${name} ${d} ${year}`, `${d} ${name} ${year}`, `${d} ${name}, ${year}`);
    }
  }
  return writings;
}
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
}

/** True when the evidence text actually writes out this date. */
export function dateIsWrittenIn(iso: string | null, evidence: string | null): boolean {
  if (!iso || !evidence) return false;
  const text = normalizeForMatch(evidence);
  return dateWritings(iso).some((writing) => {
    const at = text.indexOf(writing);
    if (at < 0) return false;
    // "10/8/2026" must not be found inside "110/8/2026" or "10/8/20269".
    const before = text[at - 1];
    const after = text[at + writing.length];
    return !/[0-9]/.test(before ?? "") && !/[0-9]/.test(after ?? "");
  });
}

export type RawDates = {
  publishedOn: string | null;
  announcedOn: string | null;
  effectiveOn: string | null;
  dateEvidence: string | null;
};

/**
 * Keeps only the dates the page supports. The date evidence must be a quote from the page, and
 * each date must be written in that quote; otherwise that date is unknown (null), never a guess.
 * A publication or announcement date in the future is not credible and is also unknown.
 */
export function verifiedDates(
  raw: RawDates,
  pageText: string,
  validDate: (value: unknown) => string | null,
  now: Date,
): RawDates {
  const evidence = raw.dateEvidence?.trim() || null;
  const quoted = evidence ? quoteIsOnPage(evidence, pageText, 6) : false;
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const keep = (value: string | null, mayBeFuture: boolean) => {
    const iso = validDate(value);
    if (!iso || !quoted || !dateIsWrittenIn(iso, evidence)) return null;
    return !mayBeFuture && iso > tomorrow ? null : iso;
  };
  const dates = {
    publishedOn: keep(raw.publishedOn, false),
    announcedOn: keep(raw.announcedOn, false),
    effectiveOn: keep(raw.effectiveOn, true),
  };
  const any = Object.values(dates).some(Boolean);
  return { ...dates, dateEvidence: any ? evidence : null };
}

/**
 * Whether a claim falls inside the research window, going only by dates the page supports.
 * Unknown dates are "unknown": the claim is kept and flagged, never silently dated.
 */
export function windowStatus(
  dates: Pick<RawDates, "publishedOn" | "announcedOn" | "effectiveOn">,
  from: string,
): "inside" | "before" | "unknown" {
  const known = [dates.publishedOn, dates.announcedOn, dates.effectiveOn].filter(
    (value): value is string => Boolean(value),
  );
  if (!known.length) return "unknown";
  return known.some((value) => value >= from) ? "inside" : "before";
}
