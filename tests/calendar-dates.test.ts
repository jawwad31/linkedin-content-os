import { describe, expect, it } from "vitest";

import {
  addableMonths,
  dateInMonth,
  daysInMonth,
  formatLongDate,
  formatShortDate,
  isPastDate,
  isValidDate,
  monthKeyOfDate,
  monthWeeks,
  todayInTimezone,
} from "@/features/calendar/dates";
import { bucketLabel, isMovable, slotState } from "@/features/calendar/slot-state";

describe("calendar dates", () => {
  it("accepts only real calendar days", () => {
    expect(isValidDate("2026-11-20")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-11-31")).toBe(false);
    expect(isValidDate("20-11-2026")).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });

  it("reads today in the account timezone, not the server's", () => {
    const instant = new Date("2026-11-30T22:30:00Z");
    expect(todayInTimezone("UTC", instant)).toBe("2026-11-30");
    // Karachi is UTC+5, so it is already December 1 there.
    expect(todayInTimezone("Asia/Karachi", instant)).toBe("2026-12-01");
    expect(todayInTimezone("Not/AZone", instant)).toBe("2026-11-30");
    expect(todayInTimezone(null, instant)).toBe("2026-11-30");
  });

  it("builds Monday-first weeks padded with empty cells", () => {
    // 1 November 2026 is a Sunday: six empty cells before it.
    const weeks = monthWeeks("2026-11");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0].slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(weeks[0][6]).toEqual({ date: "2026-11-01", day: 1 });
    const days = weeks.flat().filter(Boolean);
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toEqual({ date: "2026-11-30", day: 30 });
  });

  it("knows month lengths, including leap years", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-12")).toBe(31);
    expect(dateInMonth("2026-11", 5)).toBe("2026-11-05");
  });

  it("offers this month and next, across a year end", () => {
    expect(addableMonths("2026-11-20")).toEqual(["2026-11", "2026-12"]);
    expect(addableMonths("2026-12-31")).toEqual(["2026-12", "2027-01"]);
    expect(monthKeyOfDate("2026-12-31")).toBe("2026-12");
  });

  it("treats today as allowed and earlier days as past", () => {
    expect(isPastDate("2026-11-19", "2026-11-20")).toBe(true);
    expect(isPastDate("2026-11-20", "2026-11-20")).toBe(false);
  });

  it("formats labels without shifting the day", () => {
    expect(formatShortDate("2026-11-20")).toBe("Nov 20");
    expect(formatLongDate("2026-11-20")).toBe("Fri, Nov 20");
  });
});

describe("calendar slot states", () => {
  const base = { status: "reserved" as const, postId: null };

  it("maps stored statuses to the three shown states plus failed", () => {
    expect(slotState(base)).toBe("reserved");
    expect(slotState({ status: "queued", postId: null })).toBe("drafting");
    expect(slotState({ status: "drafting", postId: null })).toBe("drafting");
    expect(slotState({ status: "drafted", postId: "p1" })).toBe("drafted");
    expect(slotState({ status: "reserved", postId: "p1" })).toBe("drafted");
    expect(slotState({ status: "failed", postId: null })).toBe("failed");
  });

  it("gives old-plan placeholders no state", () => {
    expect(slotState({ status: "planned", postId: null })).toBeNull();
    expect(slotState({ status: "placeholder", postId: null })).toBeNull();
  });

  it("only moves plain reservations", () => {
    expect(isMovable(base)).toBe(true);
    expect(isMovable({ status: "reserved", postId: "p1" })).toBe(false);
    expect(isMovable({ status: "drafting", postId: null })).toBe(false);
    expect(isMovable({ status: "planned", postId: null })).toBe(false);
  });

  it("labels buckets for people", () => {
    expect(bucketLabel("experience")).toBe("Experience");
    expect(bucketLabel("asset")).toBe("Resource");
    expect(bucketLabel("evergreen")).toBe("Evergreen");
  });
});
