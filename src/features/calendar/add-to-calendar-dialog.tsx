"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Check, TriangleAlert, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

import { addCalendarEntryAction, getAddableDateCountsAction } from "./actions";
import { DatePickerGrid } from "./date-picker-grid";
import { formatMonthLabel } from "./months";
import { formatShortDate } from "./dates";
import type { AddableDateCounts, SameDayPost } from "./service";

export type CalendarEntryChoice = {
  sourceId: string;
  sourceType: "founder_experience" | "content_resource";
  title: string;
  /** "Experience", "Trend reaction" or "Resource". */
  typeLabel: string;
  /** "Single-use" or "Reusable". */
  reuseLabel: string;
};

type Step =
  | { kind: "pick" }
  | { kind: "same-day"; posts: SameDayPost[] }
  | { kind: "done"; date: string; postsOnDay: number };

const CONNECTION_MESSAGE =
  "The connection was interrupted, so the result is unknown. Open the calendar to see whether the entry was added before trying again.";

/**
 * Add one Content Bank entry to a date: this month or next, then the day. A day that
 * already has posts asks before adding another. Nothing is reserved until Add.
 */
export function AddToCalendarDialog({
  clientId,
  entry,
  onClose,
}: {
  clientId: string;
  entry: CalendarEntryChoice | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={entry !== null} onOpenChange={(open) => { if (!open) onClose(); }} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/40" />
        <Dialog.Popup
          aria-label="Add to Calendar"
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-border-grey bg-white p-6 shadow-2xl focus:outline-none"
        >
          {entry ? <AddToCalendarBody key={`${entry.sourceType}:${entry.sourceId}`} clientId={clientId} entry={entry} onClose={onClose} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddToCalendarBody({
  clientId,
  entry,
  onClose,
}: {
  clientId: string;
  entry: CalendarEntryChoice;
  onClose: () => void;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<AddableDateCounts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [monthIndex, setMonthIndex] = useState(0);
  const [date, setDate] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAddableDateCountsAction(clientId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setCounts(result.data);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the calendar. Nothing was changed. Close this and try again.");
      });
    return () => { cancelled = true; };
  }, [clientId]);

  const month = counts?.months[monthIndex] ?? null;

  async function submit(allowSameDay: boolean) {
    if (!date || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await addCalendarEntryAction(clientId, {
        sourceId: entry.sourceId,
        sourceType: entry.sourceType,
        date,
        allowSameDay,
      });
      if (result.ok) {
        setStep({ kind: "done", date: result.data.date, postsOnDay: result.data.postsOnDay });
        router.refresh();
        return;
      }
      if (result.code === "DATE_HAS_POSTS" && result.sameDayPosts) {
        setStep({ kind: "same-day", posts: result.sameDayPosts });
        return;
      }
      setStep({ kind: "pick" });
      setError(result.message);
    } catch {
      setStep({ kind: "pick" });
      setError(CONNECTION_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-body-lg font-heading font-semibold text-near-black">Add to Calendar</h2>
        <Dialog.Close
          className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full text-muted-foreground hover:bg-soft-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>

      <div className="flex flex-col gap-1 rounded-control border border-border-grey bg-soft-white p-3">
        <p className="text-body font-medium text-near-black">{entry.title}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{entry.typeLabel}</Badge>
          <Badge variant="neutral">{entry.reuseLabel}</Badge>
        </div>
      </div>

      {step.kind === "done" ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="flex items-start gap-2 text-body text-near-black">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" aria-hidden="true" />
            <span>
              Added to <strong>{formatShortDate(step.date)}</strong>. The entry is reserved for that day
              {step.postsOnDay > 1 ? `, with ${step.postsOnDay - 1} other ${step.postsOnDay === 2 ? "post" : "posts"}` : ""}.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/client/${clientId}/calendar?month=${step.date.slice(0, 7)}`}
              className={buttonVariants({ variant: "brand", size: "sm" })}
            >
              View calendar
            </Link>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : step.kind === "same-day" ? (
        <div className="flex flex-col gap-4">
          <div role="alert" className="flex flex-col gap-2 rounded-control border border-warning/40 bg-warning/10 p-3 text-small text-warning-strong">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              {date ? formatShortDate(date) : "That day"} has {step.posts.length} {step.posts.length === 1 ? "post" : "posts"}
            </p>
            <ul className="list-disc pl-5">
              {step.posts.map((post) => (
                <li key={post.slotId}>{post.title}</li>
              ))}
            </ul>
            <p>Add another post on this day? Two or more posts on one day are allowed.</p>
          </div>
          {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="brand" size="sm" disabled={pending} onClick={() => submit(true)}>
              {pending ? "Adding…" : "Yes, add another"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setStep({ kind: "pick" })}>
              Choose another date
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {loadError ? (
            <p role="alert" className="text-small text-danger-strong">{loadError}</p>
          ) : !counts || !month ? (
            <div aria-hidden="true" className="flex flex-col gap-2">
              <div className="h-8 animate-pulse rounded-control bg-soft-white" />
              <div className="h-48 animate-pulse rounded-control bg-soft-white" />
            </div>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-small font-medium text-near-black">Which month?</legend>
                <div className="flex flex-wrap gap-2">
                  {counts.months.map((entryMonth, index) => (
                    <Button
                      key={entryMonth.monthKey}
                      type="button"
                      size="sm"
                      variant={index === monthIndex ? "brand" : "outline"}
                      aria-pressed={index === monthIndex}
                      onClick={() => { setMonthIndex(index); setDate(null); setError(null); }}
                    >
                      {index === 0 ? "This month" : "Next month"} · {formatMonthLabel(entryMonth.monthKey).split(" ")[0].slice(0, 3)}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-2">
                <p className="text-small font-medium text-near-black">Which date?</p>
                <p className="text-caption text-muted-foreground">{formatMonthLabel(month.monthKey)}</p>
                <DatePickerGrid
                  monthKey={month.monthKey}
                  today={counts.today}
                  counts={month.counts}
                  selected={date}
                  onSelect={(next) => { setDate(next); setError(null); }}
                  disabled={pending}
                />
                <p className="text-caption text-muted-foreground">
                  Dates with posts show how many. Past dates cannot be chosen.
                </p>
              </div>
              {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="brand" disabled={!date || pending} onClick={() => submit(false)}>
                  {pending ? "Adding…" : date ? `Add to ${formatShortDate(date)}` : "Choose a date"}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
