import { describe, expect, it } from "vitest";

import {
  computeTargetCounts,
  largestRemainder,
  maxNewsCount,
  planAllocation,
  settingsEqual,
  sumCounts,
  type CalendarSettings,
} from "@/features/calendar/allocation";
import {
  currentMonthKey,
  formatMonthLabel,
  isValidMonthKey,
  monthKeyToDate,
  shiftMonthKey,
} from "@/features/calendar/months";
import { parseCalendarSettings } from "@/features/calendar/schemas";

function settings(
  postCount: number,
  experience: number,
  asset: number,
  evergreen: number,
  news: number,
  newsCapPercent = news,
): CalendarSettings {
  return {
    timezone: "UTC",
    postCount,
    shares: { experience, asset, evergreen, news },
    newsCapPercent,
  };
}

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);

describe("largestRemainder", () => {
  it("distributes exactly and breaks ties toward the earlier bucket", () => {
    expect(largestRemainder(30, [40, 10, 40, 10])).toEqual([12, 3, 12, 3]);
    expect(largestRemainder(7, [25, 25, 25, 25])).toEqual([2, 2, 2, 1]);
    expect(largestRemainder(1, [40, 10, 40, 10])).toEqual([1, 0, 0, 0]);
    expect(largestRemainder(3, [33, 33, 34, 0])).toEqual([1, 1, 1, 0]);
  });

  it("returns zeros for an empty or zero-weight request", () => {
    expect(largestRemainder(10, [0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    expect(largestRemainder(0, [50, 50])).toEqual([0, 0]);
  });
});

describe("computeTargetCounts", () => {
  it("matches the worked example: 40/10/40/10 across 30 posts is 12/3/12/3", () => {
    expect(computeTargetCounts(settings(30, 40, 10, 40, 10))).toEqual({
      experience: 12,
      asset: 3,
      evergreen: 12,
      news: 3,
    });
  });

  it("handles a single post and tiny months without inventing posts", () => {
    expect(computeTargetCounts(settings(1, 40, 10, 40, 10))).toEqual({
      experience: 1,
      asset: 0,
      evergreen: 0,
      news: 0,
    });
    expect(computeTargetCounts(settings(2, 25, 25, 25, 25))).toEqual({
      experience: 1,
      asset: 1,
      evergreen: 0,
      news: 0,
    });
  });

  it("caps news at the floor of post count x cap and re-apportions the rest", () => {
    // Rounding alone would give news 2; the cap floor(10 x 15%) allows 1.
    const target = computeTargetCounts(settings(10, 62, 20, 3, 15));
    expect(maxNewsCount(10, 15)).toBe(1);
    expect(target.news).toBe(1);
    expect(sumCounts(target)).toBe(10);
    expect(target).toEqual({ experience: 7, asset: 2, evergreen: 0, news: 1 });
  });

  it("treats a news cap of zero as no news posts", () => {
    const target = computeTargetCounts(settings(12, 50, 20, 30, 0, 0));
    expect(target.news).toBe(0);
    expect(sumCounts(target)).toBe(12);
  });

  it("always totals the post count and never exceeds the news cap floor", () => {
    const shareSets: [number, number, number, number][] = [
      [40, 10, 40, 10],
      [25, 25, 25, 25],
      [33, 33, 17, 17],
      [62, 20, 3, 15],
      [0, 0, 100, 0],
      [0, 0, 0, 100],
      [97, 1, 1, 1],
    ];

    for (const [experience, asset, evergreen, news] of shareSets) {
      for (let postCount = 1; postCount <= 60; postCount += 1) {
        for (const cap of [news, Math.min(100, news + 5), 100]) {
          const target = computeTargetCounts(
            settings(postCount, experience, asset, evergreen, news, cap),
          );
          expect(sumCounts(target)).toBe(postCount);
          expect(Object.values(target).every((count) => count >= 0)).toBe(true);
          expect(target.news).toBeLessThanOrEqual(maxNewsCount(postCount, cap));
        }
      }
    }
  });

  it("is deterministic", () => {
    const input = settings(23, 41, 9, 37, 13, 20);
    expect(computeTargetCounts(input)).toEqual(computeTargetCounts(input));
  });
});

describe("planAllocation", () => {
  it("substitutes evergreen when only eight of twelve experience slots are selected", () => {
    const plan = planAllocation({
      settings: settings(30, 40, 10, 40, 10),
      selection: { experience: ids("exp", 8), asset: ids("asset", 3) },
      available: { experience: 9, asset: 5 },
    });

    expect(plan.requested).toEqual({ experience: 12, asset: 3, evergreen: 12, news: 3 });
    expect(plan.actual).toEqual({ experience: 8, asset: 3, evergreen: 16, news: 3 });
    expect(plan.shortages).toEqual([
      { bucket: "experience", requested: 12, selected: 8, moved: 4, reason: "fewer_selected" },
    ]);

    const substituted = plan.slots.filter((slot) => slot.shortageReason);
    expect(substituted).toHaveLength(4);
    expect(substituted.every((slot) => slot.bucket === "evergreen" && slot.requestedBucket === "experience")).toBe(true);
    expect(plan.slots).toHaveLength(30);
  });

  it("falls back to evergreen with a distinct reason when nothing is eligible", () => {
    const plan = planAllocation({
      settings: settings(10, 50, 20, 30, 0, 0),
      selection: { experience: [], asset: [] },
      available: { experience: 0, asset: 0 },
    });

    expect(plan.actual).toEqual({ experience: 0, asset: 0, evergreen: 10, news: 0 });
    expect(plan.shortages.map((shortage) => shortage.reason)).toEqual([
      "no_eligible_entries",
      "no_eligible_entries",
    ]);
    expect(plan.slots.every((slot) => slot.sourceId === null)).toBe(true);
  });

  it("never reserves an entry the user did not select and ignores extras beyond need", () => {
    const plan = planAllocation({
      settings: settings(10, 20, 0, 80, 0, 0),
      selection: { experience: ids("exp", 5), asset: [] },
      available: { experience: 9, asset: 0 },
    });

    const used = plan.slots.filter((slot) => slot.sourceId).map((slot) => slot.sourceId);
    expect(used).toEqual(["exp-1", "exp-2"]);
    expect(plan.ignoredSelections.experience).toEqual(["exp-3", "exp-4", "exp-5"]);
    expect(plan.actual.experience).toBe(2);
  });

  it("never plans the same entry twice, even if it was selected twice", () => {
    const plan = planAllocation({
      settings: settings(4, 50, 0, 50, 0, 0),
      selection: { experience: ["a", "a", "b"], asset: [] },
      available: { experience: 2, asset: 0 },
    });

    const used = plan.slots.filter((slot) => slot.sourceId).map((slot) => slot.sourceId);
    expect(used).toEqual(["a", "b"]);
  });

  it("leaves news slots as unfinished placeholders with no source", () => {
    const plan = planAllocation({
      settings: settings(10, 40, 10, 40, 10, 20),
      selection: { experience: ids("exp", 4), asset: ids("asset", 1) },
      available: { experience: 4, asset: 1 },
    });

    const news = plan.slots.filter((slot) => slot.bucket === "news");
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ sourceId: null, sourceType: null });
    expect(plan.newsMax).toBe(2);
  });

  it("maps buckets to the right source types", () => {
    const plan = planAllocation({
      settings: settings(4, 50, 50, 0, 0, 0),
      selection: { experience: ["e1", "e2"], asset: ["a1", "a2"] },
      available: { experience: 2, asset: 2 },
    });

    for (const slot of plan.slots) {
      expect(slot.sourceType).toBe(
        slot.bucket === "experience" ? "founder_experience" : "content_resource",
      );
    }
  });

  it("keeps preserved slots and only plans the remaining slots", () => {
    const plan = planAllocation({
      settings: settings(10, 40, 10, 40, 10, 20),
      selection: { experience: ids("exp", 4), asset: ids("asset", 1) },
      available: { experience: 4, asset: 1 },
      preserved: { experience: 2, asset: 0, evergreen: 1, news: 0 },
    });

    expect(plan.slots).toHaveLength(7);
    expect(sumCounts(plan.actual)).toBe(10);
    expect(plan.actual.experience).toBe(4);
    expect(plan.preserved.experience).toBe(2);
    expect(plan.overflow).toBe(0);
  });

  it("plans nothing new and reports overflow when preserved slots exceed the month", () => {
    const plan = planAllocation({
      settings: settings(3, 40, 10, 40, 10, 20),
      selection: { experience: ["a"], asset: [] },
      available: { experience: 1, asset: 0 },
      preserved: { experience: 2, asset: 1, evergreen: 1, news: 0 },
    });

    expect(plan.slots).toHaveLength(0);
    expect(plan.overflow).toBe(1);
  });

  it("interleaves buckets rather than emitting solid blocks", () => {
    const plan = planAllocation({
      settings: settings(8, 50, 0, 50, 0, 0),
      selection: { experience: ids("exp", 4), asset: [] },
      available: { experience: 4, asset: 0 },
    });

    expect(plan.slots.map((slot) => slot.bucket)).toEqual([
      "experience",
      "evergreen",
      "experience",
      "evergreen",
      "experience",
      "evergreen",
      "experience",
      "evergreen",
    ]);
  });
});

describe("settingsEqual", () => {
  it("compares every field", () => {
    const base = settings(10, 40, 10, 40, 10, 20);
    expect(settingsEqual(base, { ...base, shares: { ...base.shares } })).toBe(true);
    expect(settingsEqual(base, { ...base, postCount: 11 })).toBe(false);
    expect(settingsEqual(base, { ...base, timezone: "Asia/Karachi" })).toBe(false);
    expect(settingsEqual(base, { ...base, newsCapPercent: 25 })).toBe(false);
    expect(settingsEqual(base, { ...base, shares: { ...base.shares, asset: 11 } })).toBe(false);
  });
});

describe("parseCalendarSettings", () => {
  const valid = {
    timezone: "Asia/Karachi",
    postCount: 12,
    shares: { experience: 40, asset: 10, evergreen: 40, news: 10 },
    newsCapPercent: 20,
  };

  it("accepts valid settings", () => {
    expect(parseCalendarSettings(valid)).toEqual({ ok: true, settings: valid });
  });

  it("rejects shares that do not total 100% and says by how much", () => {
    const result = parseCalendarSettings({ ...valid, shares: { ...valid.shares, news: 5 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      field: "shares",
      message: "Shares must add up to 100% (they add up to 95%).",
    });
  });

  it("requires the conflict between news share and news cap to be resolved", () => {
    const result = parseCalendarSettings({ ...valid, newsCapPercent: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ field: "shares.news" });
    expect(result.issues[0].message).toContain("above the news cap");
  });

  it("rejects negative, fractional, and out-of-range numbers", () => {
    const negative = parseCalendarSettings({ ...valid, shares: { ...valid.shares, asset: -10, evergreen: 60 } });
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.issues.map((issue) => issue.message)).toContain("Asset share cannot be negative.");
    }

    expect(parseCalendarSettings({ ...valid, postCount: 0 }).ok).toBe(false);
    expect(parseCalendarSettings({ ...valid, postCount: 61 }).ok).toBe(false);
    expect(parseCalendarSettings({ ...valid, postCount: 10.5 }).ok).toBe(false);
    expect(parseCalendarSettings({ ...valid, postCount: Number.NaN }).ok).toBe(false);
    expect(parseCalendarSettings({ ...valid, newsCapPercent: 101 }).ok).toBe(false);
  });

  it("rejects missing and unrecognised timezones", () => {
    expect(parseCalendarSettings({ ...valid, timezone: "" }).ok).toBe(false);
    expect(parseCalendarSettings({ ...valid, timezone: "Not/AZone" }).ok).toBe(false);
    expect(parseCalendarSettings({ ...valid, timezone: "+05:00" }).ok).toBe(false);
    expect(parseCalendarSettings({ ...valid, timezone: "UTC" }).ok).toBe(true);
  });

  it("rejects values that are not numbers at all", () => {
    expect(parseCalendarSettings({ ...valid, postCount: "12" }).ok).toBe(false);
    expect(parseCalendarSettings(null).ok).toBe(false);
  });
});

describe("month helpers", () => {
  it("validates month keys", () => {
    expect(isValidMonthKey("2026-11")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-1")).toBe(false);
    expect(isValidMonthKey("1999-01")).toBe(false);
    expect(isValidMonthKey(undefined)).toBe(false);
  });

  it("converts to the stored first-of-month date and labels", () => {
    expect(monthKeyToDate("2026-11")).toBe("2026-11-01");
    expect(formatMonthLabel("2026-11")).toBe("November 2026");
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-06", 0)).toBe("2026-06");
  });

  it("derives the current month in the account timezone", () => {
    const lateOctoberUtc = new Date("2026-10-31T20:00:00Z");
    expect(currentMonthKey("UTC", lateOctoberUtc)).toBe("2026-10");
    expect(currentMonthKey("Asia/Karachi", lateOctoberUtc)).toBe("2026-11");
    expect(currentMonthKey("Not/AZone", lateOctoberUtc)).toBe("2026-10");
  });
});
