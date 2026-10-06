import {
  ALLOCATION_BUCKETS,
  type AllocationBucket,
} from "@/lib/ai/playbooks/taxonomies";

/**
 * Pure monthly allocation logic. All arithmetic is integer-only so results are
 * exact and identical on every run. Tie order is the order of
 * ALLOCATION_BUCKETS: experience, asset, evergreen, news.
 */

export const MAX_POST_COUNT = 60;

export type BucketCounts = Record<AllocationBucket, number>;

export type CalendarSettings = {
  timezone: string;
  postCount: number;
  shares: BucketCounts;
  newsCapPercent: number;
};

export type SourceKind = "founder_experience" | "content_resource";
export type ShortageReason = "fewer_selected" | "no_eligible_entries";

export type PlannedSlot = {
  bucket: AllocationBucket;
  requestedBucket: AllocationBucket;
  sourceId: string | null;
  sourceType: SourceKind | null;
  shortageReason: ShortageReason | null;
};

export type AllocationShortage = {
  bucket: "experience" | "asset";
  requested: number;
  selected: number;
  moved: number;
  reason: ShortageReason;
};

export type AllocationPlan = {
  /** Counts the settings ask for across the whole month. */
  requested: BucketCounts;
  /** Counts across the whole month after shortage substitution. */
  actual: BucketCounts;
  newsMax: number;
  shortages: AllocationShortage[];
  /** Selected entries beyond what the month needs; they are not reserved. */
  ignoredSelections: { experience: string[]; asset: string[] };
  /** New slots to create, in plan order. */
  slots: PlannedSlot[];
  /** Slots kept as-is because they already carry a post. */
  preserved: BucketCounts;
  /** Preserved slots beyond the month's post count (settings were lowered). */
  overflow: number;
};

export const EMPTY_COUNTS: BucketCounts = {
  experience: 0,
  asset: 0,
  evergreen: 0,
  news: 0,
};

export function emptyCounts(): BucketCounts {
  return { ...EMPTY_COUNTS };
}

export function sumCounts(counts: BucketCounts): number {
  return ALLOCATION_BUCKETS.reduce((total, bucket) => total + counts[bucket], 0);
}

/** The most news posts a month may hold: floor(postCount x cap / 100). */
export function maxNewsCount(postCount: number, newsCapPercent: number): number {
  return Math.floor((postCount * newsCapPercent) / 100);
}

/**
 * Largest-remainder apportionment of `total` across `weights`. Quotas are
 * compared as exact integers (total x weight against the weight sum), and ties
 * go to the earlier index. Returns zeros when every weight is zero.
 */
export function largestRemainder(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0 || total <= 0) return weights.map(() => 0);

  const parts = weights.map((weight, index) => {
    const quota = total * weight;
    return {
      index,
      base: Math.floor(quota / weightSum),
      remainder: quota % weightSum,
    };
  });

  let leftover = total - parts.reduce((sum, part) => sum + part.base, 0);
  const byRemainder = [...parts].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );

  const counts = parts.map((part) => part.base);
  for (const part of byRemainder) {
    if (leftover <= 0) break;
    if (part.remainder === 0) continue;
    counts[part.index] += 1;
    leftover -= 1;
  }

  return counts;
}

/**
 * Whole-month target counts. News never exceeds the cap floor; any news the
 * rounding would add beyond it is re-apportioned across the other buckets by
 * their shares.
 */
export function computeTargetCounts(settings: CalendarSettings): BucketCounts {
  const { postCount, shares, newsCapPercent } = settings;
  const apportioned = largestRemainder(
    postCount,
    ALLOCATION_BUCKETS.map((bucket) => shares[bucket]),
  );

  const counts: BucketCounts = {
    experience: apportioned[0],
    asset: apportioned[1],
    evergreen: apportioned[2],
    news: apportioned[3],
  };

  const newsMax = maxNewsCount(postCount, newsCapPercent);
  if (counts.news <= newsMax) return counts;

  const others = ["experience", "asset", "evergreen"] as const;
  const redistributed = largestRemainder(
    postCount - newsMax,
    others.map((bucket) => shares[bucket]),
  );

  if (redistributed.every((count) => count === 0)) {
    return { experience: 0, asset: 0, evergreen: postCount - newsMax, news: newsMax };
  }

  return {
    experience: redistributed[0],
    asset: redistributed[1],
    evergreen: redistributed[2],
    news: newsMax,
  };
}

/** Buckets are trimmed in this order when preserved slots already fill a month. */
const TRIM_ORDER: AllocationBucket[] = ["evergreen", "asset", "experience", "news"];

function uniqueInOrder(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Interleaves buckets round-robin so a month is not four solid blocks. */
function orderSlots(byBucket: Record<AllocationBucket, PlannedSlot[]>): PlannedSlot[] {
  const queues = ALLOCATION_BUCKETS.map((bucket) => [...byBucket[bucket]]);
  const ordered: PlannedSlot[] = [];

  while (queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) ordered.push(next);
    }
  }

  return ordered;
}

export type PlanAllocationInput = {
  settings: CalendarSettings;
  /** Entries the user chose, in the order they chose them. */
  selection: { experience: string[]; asset: string[] };
  /** How many eligible entries exist per bucket (decides the shortage reason). */
  available: { experience: number; asset: number };
  /** Slots that already carry a post and must be preserved. */
  preserved?: BucketCounts;
};

/**
 * Builds the proposed monthly plan. Never selects entries on the user's behalf
 * and never reuses an entry to reach a percentage: when fewer entries are
 * selected than a bucket needs, the shortage becomes evergreen slots.
 */
export function planAllocation(input: PlanAllocationInput): AllocationPlan {
  const { settings, available } = input;
  const preserved = input.preserved ?? emptyCounts();
  const requested = computeTargetCounts(settings);
  const newsMax = maxNewsCount(settings.postCount, settings.newsCapPercent);

  const preservedTotal = sumCounts(preserved);
  const newTotal = Math.max(0, settings.postCount - preservedTotal);

  const need = emptyCounts();
  for (const bucket of ALLOCATION_BUCKETS) {
    need[bucket] = Math.max(0, requested[bucket] - preserved[bucket]);
  }

  let excess = sumCounts(need) - newTotal;
  for (const bucket of TRIM_ORDER) {
    if (excess <= 0) break;
    const trimmed = Math.min(need[bucket], excess);
    need[bucket] -= trimmed;
    excess -= trimmed;
  }

  const selectedExperience = uniqueInOrder(input.selection.experience);
  const selectedAsset = uniqueInOrder(input.selection.asset);

  const shortages: AllocationShortage[] = [];
  const ignoredSelections = { experience: [] as string[], asset: [] as string[] };
  const byBucket: Record<AllocationBucket, PlannedSlot[]> = {
    experience: [],
    asset: [],
    evergreen: [],
    news: [],
  };

  const sourceBuckets = [
    { bucket: "experience", kind: "founder_experience", selected: selectedExperience },
    { bucket: "asset", kind: "content_resource", selected: selectedAsset },
  ] as const;

  const shortageSlots: PlannedSlot[] = [];

  for (const { bucket, kind, selected } of sourceBuckets) {
    const used = selected.slice(0, need[bucket]);
    ignoredSelections[bucket] = selected.slice(need[bucket]);

    for (const sourceId of used) {
      byBucket[bucket].push({
        bucket,
        requestedBucket: bucket,
        sourceId,
        sourceType: kind,
        shortageReason: null,
      });
    }

    const moved = need[bucket] - used.length;
    if (moved > 0) {
      const reason: ShortageReason =
        available[bucket] === 0 ? "no_eligible_entries" : "fewer_selected";
      shortages.push({
        bucket,
        requested: need[bucket],
        selected: used.length,
        moved,
        reason,
      });
      for (let i = 0; i < moved; i += 1) {
        shortageSlots.push({
          bucket: "evergreen",
          requestedBucket: bucket,
          sourceId: null,
          sourceType: null,
          shortageReason: reason,
        });
      }
    }
  }

  for (let i = 0; i < need.evergreen; i += 1) {
    byBucket.evergreen.push({
      bucket: "evergreen",
      requestedBucket: "evergreen",
      sourceId: null,
      sourceType: null,
      shortageReason: null,
    });
  }
  byBucket.evergreen.push(...shortageSlots);

  for (let i = 0; i < need.news; i += 1) {
    byBucket.news.push({
      bucket: "news",
      requestedBucket: "news",
      sourceId: null,
      sourceType: null,
      shortageReason: null,
    });
  }

  const actual: BucketCounts = {
    experience: preserved.experience + byBucket.experience.length,
    asset: preserved.asset + byBucket.asset.length,
    evergreen: preserved.evergreen + byBucket.evergreen.length,
    news: preserved.news + byBucket.news.length,
  };

  return {
    requested,
    actual,
    newsMax,
    shortages,
    ignoredSelections,
    slots: orderSlots(byBucket),
    preserved,
    overflow: Math.max(0, preservedTotal - settings.postCount),
  };
}

export function settingsEqual(a: CalendarSettings, b: CalendarSettings): boolean {
  return (
    a.timezone === b.timezone &&
    a.postCount === b.postCount &&
    a.newsCapPercent === b.newsCapPercent &&
    ALLOCATION_BUCKETS.every((bucket) => a.shares[bucket] === b.shares[bucket])
  );
}
