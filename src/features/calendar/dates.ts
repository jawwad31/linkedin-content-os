import { shiftMonthKey } from "./months";

const DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A calendar date is "YYYY-MM-DD". Real calendar days only (no 31 February). */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today's date in the account's timezone (UTC when none or invalid), as YYYY-MM-DD. */
export function todayInTimezone(timeZone?: string | null, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through to UTC
  }
  return now.toISOString().slice(0, 10);
}

export function monthKeyOfDate(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dateInMonth(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

export type DayCell = { date: string; day: number } | null;

/** The month as weeks of seven cells, Monday first; null pads the first and last week. */
export function monthWeeks(monthKey: string): DayCell[][] {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: DayCell[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth(monthKey); day += 1) {
    cells.push({ date: dateInMonth(monthKey, day), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: DayCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** "Nov 20" */
export function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** "Thu, Nov 20" */
export function formatLongDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** The two months a new entry can be added to: the current one and the next. */
export function addableMonths(today: string): [string, string] {
  const current = monthKeyOfDate(today);
  return [current, shiftMonthKey(current, 1)];
}

export function isPastDate(date: string, today: string): boolean {
  return date < today;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
