import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ALLOCATION_BUCKETS,
  type AllocationBucket,
} from "@/lib/ai/playbooks/taxonomies";

import type {
  AllocationPlan,
  AllocationShortage,
  BucketCounts,
  ShortageReason,
} from "./allocation";
import type { CalendarSlotRecord } from "./queries";
import { BUCKET_LABELS } from "./schemas";

const SHORT_BUCKET_LABELS: Record<AllocationBucket, string> = {
  experience: "Experience",
  asset: "Asset",
  evergreen: "Evergreen",
  news: "News",
};

export const SHORTAGE_COPY: Record<ShortageReason, string> = {
  fewer_selected: "fewer entries were selected than the plan asked for",
  no_eligible_entries: "no eligible entries are available",
};

export function describeShortage(shortage: AllocationShortage): string {
  const label = SHORT_BUCKET_LABELS[shortage.bucket].toLowerCase();
  const noun = shortage.moved === 1 ? "slot" : "slots";
  return `${shortage.moved} ${label} ${noun} became evergreen: ${SHORTAGE_COPY[shortage.reason]} (${shortage.selected} of ${shortage.requested} selected).`;
}

/** Requested versus actual counts, with the reason for any difference below. */
export function AllocationTable({
  requested,
  actual,
  newsMax,
  shortages,
}: {
  requested: BucketCounts;
  actual: BucketCounts;
  newsMax: number;
  shortages: AllocationShortage[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-80 text-left text-small">
          <caption className="sr-only">Requested versus planned posts by source</caption>
          <thead>
            <tr className="border-b border-border-grey text-caption text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">Source</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Requested</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Planned</th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            {ALLOCATION_BUCKETS.map((bucket) => {
              const difference = actual[bucket] - requested[bucket];
              return (
                <tr key={bucket} className="border-b border-border-grey/60">
                  <th scope="row" className="py-2 pr-4 font-medium text-near-black">
                    {BUCKET_LABELS[bucket]}
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">{requested[bucket]}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {actual[bucket]}
                  </td>
                  <td
                    className={cn(
                      "py-2 pl-2 text-right tabular-nums",
                      difference > 0 && "text-success-strong",
                      difference < 0 && "text-warning-strong",
                    )}
                  >
                    {difference > 0 ? `+${difference}` : difference}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-caption text-muted-foreground">
        News is a maximum, not a target: at most {newsMax} news{" "}
        {newsMax === 1 ? "post" : "posts"} this month.
      </p>

      {shortages.length > 0 ? (
        <ul className="flex flex-col gap-1 text-small text-warning-strong">
          {shortages.map((shortage) => (
            <li key={shortage.bucket}>{describeShortage(shortage)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PlanNotes({ plan }: { plan: AllocationPlan }) {
  const ignored = plan.ignoredSelections.experience.length + plan.ignoredSelections.asset.length;

  return (
    <ul className="flex flex-col gap-1 text-small text-muted-foreground">
      {ignored > 0 ? (
        <li>
          {ignored} selected {ignored === 1 ? "entry is" : "entries are"} beyond what this month
          needs and will not be reserved.
        </li>
      ) : null}
      {plan.overflow > 0 ? (
        <li>
          {plan.overflow} existing {plan.overflow === 1 ? "slot has" : "slots have"} posts and
          exceed the post count; they are kept.
        </li>
      ) : null}
      {plan.actual.news > 0 ? (
        <li>News slots stay as placeholders until you choose timely material.</li>
      ) : null}
    </ul>
  );
}

const STATUS_BADGE: Record<
  CalendarSlotRecord["status"],
  { label: string; variant: "neutral" | "warning" | "accent-purple" }
> = {
  reserved: { label: "Source reserved", variant: "accent-purple" },
  planned: { label: "Planned", variant: "neutral" },
  placeholder: { label: "Needs material", variant: "warning" },
};

export function SlotCard({
  slot,
  canCancel,
  busy,
  onCancel,
}: {
  slot: CalendarSlotRecord;
  canCancel: boolean;
  busy: boolean;
  onCancel: (slotId: string) => void;
}) {
  const badge = STATUS_BADGE[slot.status];
  const isPlaceholder = slot.status === "placeholder";
  const hasPost = Boolean(slot.postId);
  const substituted = slot.requestedBucket !== slot.bucket && slot.shortageReason;

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-card border p-4",
        isPlaceholder
          ? "border-dashed border-border-grey bg-soft-white"
          : "border-border-grey bg-white",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption font-medium text-muted-foreground">
          Slot {slot.slotIndex}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{SHORT_BUCKET_LABELS[slot.bucket]}</Badge>
          {hasPost ? (
            <Badge variant="info">Post: {slot.postStatus ?? "linked"}</Badge>
          ) : (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          )}
        </div>
      </div>

      {isPlaceholder ? (
        <p className="text-small text-muted-foreground">
          News placeholder. Timely material has not been chosen yet.
        </p>
      ) : slot.sourceId ? (
        <p className="text-body font-medium text-near-black [overflow-wrap:anywhere]">
          {slot.sourceTitle ?? "Content Bank entry"}
        </p>
      ) : (
        <p className="text-small text-muted-foreground">
          Evergreen idea. The topic is chosen when this slot is drafted.
        </p>
      )}

      {substituted ? (
        <p className="text-caption text-warning-strong">
          Planned as {SHORT_BUCKET_LABELS[slot.requestedBucket].toLowerCase()}, but{" "}
          {SHORTAGE_COPY[slot.shortageReason as ShortageReason]}.
        </p>
      ) : null}

      {canCancel && !hasPost ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onCancel(slot.id)}
            aria-label={`Cancel slot ${slot.slotIndex} and release its reservation`}
          >
            Cancel slot
          </Button>
        </div>
      ) : null}
    </li>
  );
}
