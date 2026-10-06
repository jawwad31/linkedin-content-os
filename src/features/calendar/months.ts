const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const MIN_CALENDAR_YEAR = 2024;
export const MAX_CALENDAR_YEAR = 2100;

/** A calendar month is identified by "YYYY-MM". */
export function isValidMonthKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = MONTH_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= MIN_CALENDAR_YEAR && year <= MAX_CALENDAR_YEAR;
}

/** The first day of the month, as stored in content_calendars.month. */
export function monthKeyToDate(monthKey: string): string {
  return `${monthKey}-01`;
}

export function dateToMonthKey(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) return monthKey;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** The current month in the given timezone (UTC when none or invalid). */
export function currentMonthKey(timeZone?: string | null, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    if (year && month) return `${year}-${month}`;
  } catch {
    // fall through to UTC
  }
  return now.toISOString().slice(0, 7);
}

export function formatMonthLabel(monthKey: string): string {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
