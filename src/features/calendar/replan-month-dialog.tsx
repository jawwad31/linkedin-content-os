"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { moveCalendarSlotsAction } from "./actions";
import { daysInMonth, dateInMonth, formatShortDate } from "./dates";
import type { CalendarSlotRecord } from "./queries";
import type { SameDayDate } from "./service";

const CONNECTION_MESSAGE =
  "The connection was interrupted, so the result is unknown. Reload the calendar to see whether the dates changed before trying again.";

/**
 * Replan month: this month's reserved entries, each with a date. Save moves every
 * changed entry at once, or none. Drafting and drafted posts are not listed and stay
 * where they are.
 */
export function ReplanMonthDialog({
  clientId,
  monthKey,
  monthLabel,
  calendarId,
  planRevision,
  today,
  slots,
  open,
  onClose,
  onSaved,
}: {
  clientId: string;
  monthKey: string;
  monthLabel: string;
  calendarId: string;
  planRevision: number;
  today: string;
  slots: CalendarSlotRecord[];
  open: boolean;
  onClose: () => void;
  onSaved: (moved: number) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/40" />
        <Dialog.Popup
          aria-label={`Replan ${monthLabel}`}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-border-grey bg-white p-6 shadow-2xl focus:outline-none"
        >
          {open ? (
            <ReplanBody
              clientId={clientId}
              monthKey={monthKey}
              monthLabel={monthLabel}
              calendarId={calendarId}
              planRevision={planRevision}
              today={today}
              slots={slots}
              onClose={onClose}
              onSaved={onSaved}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReplanBody({
  clientId,
  monthKey,
  monthLabel,
  calendarId,
  planRevision,
  today,
  slots,
  onClose,
  onSaved,
}: Omit<Parameters<typeof ReplanMonthDialog>[0], "open">) {
  const router = useRouter();
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.map((slot) => [slot.id, slot.scheduledDate ?? ""])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [sameDay, setSameDay] = useState<SameDayDate[] | null>(null);

  const first = dateInMonth(monthKey, 1);
  const last = dateInMonth(monthKey, daysInMonth(monthKey));
  const min = first > today ? first : today;

  const changes = slots.filter((slot) => dates[slot.id] && dates[slot.id] !== (slot.scheduledDate ?? ""));
  const invalid = changes.filter((slot) => dates[slot.id] < min || dates[slot.id] > last);

  async function save(allowSameDay: boolean) {
    if (changes.length === 0 || invalid.length > 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await moveCalendarSlotsAction(clientId, {
        calendarId,
        moves: changes.map((slot) => ({ slotId: slot.id, date: dates[slot.id] })),
        allowSameDay,
        expectedPlanRevision: planRevision,
      });
      if (result.ok) {
        onSaved(result.data.moved);
        router.refresh();
        onClose();
        return;
      }
      if (result.code === "DATE_HAS_POSTS" && result.sameDayDates) {
        setSameDay(result.sameDayDates);
        return;
      }
      setSameDay(null);
      setStale(result.code === "PLAN_REVISION_CONFLICT");
      setError(result.message);
    } catch {
      setSameDay(null);
      setError(CONNECTION_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-body-lg font-heading font-semibold text-near-black">Replan {monthLabel.split(" ")[0]}</h2>
          <p className="mt-1 text-small text-muted-foreground">
            {slots.length} reserved {slots.length === 1 ? "entry" : "entries"}. Change any date, then save.
            Drafting and drafted posts stay where they are.
          </p>
        </div>
        <Dialog.Close className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full text-muted-foreground hover:bg-soft-white" aria-label="Close">
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>

      <ul className="flex flex-col gap-2">
        {slots.map((slot) => {
          const value = dates[slot.id] ?? "";
          const changed = Boolean(value) && value !== (slot.scheduledDate ?? "");
          const bad = changed && (value < min || value > last);
          const inputId = `replan-${slot.id}`;
          return (
            <li key={slot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border-grey p-3">
              <div className="min-w-0">
                <label htmlFor={inputId} className="block break-words text-small font-medium text-near-black">
                  {slot.sourceTitle ?? "Untitled entry"}
                </label>
                {changed && slot.scheduledDate ? (
                  <p className="text-caption text-muted-foreground">Moved from {formatShortDate(slot.scheduledDate)}</p>
                ) : !slot.scheduledDate ? (
                  <p className="text-caption text-muted-foreground">Needs a date</p>
                ) : null}
                {bad ? (
                  <p role="alert" className="text-caption text-danger-strong">
                    Choose a date from {formatShortDate(min)} to {formatShortDate(last)}.
                  </p>
                ) : null}
              </div>
              <input
                id={inputId}
                type="date"
                value={value}
                min={min}
                max={last}
                disabled={pending}
                onChange={(event) => { setDates((current) => ({ ...current, [slot.id]: event.target.value })); setSameDay(null); setError(null); }}
                className="h-10 rounded-control border border-border-grey bg-white px-3 text-small"
              />
            </li>
          );
        })}
      </ul>

      <p className="text-caption text-muted-foreground">
        Past dates cannot be chosen. A date with posts asks before adding another.
      </p>

      {sameDay ? (
        <div role="alert" className="flex flex-col gap-2 rounded-control border border-warning/40 bg-warning/10 p-3 text-small text-warning-strong">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Some days will have more than one post
          </p>
          <ul className="list-disc pl-5">
            {sameDay.map((entry) => (
              <li key={entry.date}>
                {formatShortDate(entry.date)}
                {entry.posts.length > 0 ? ` already has ${entry.posts.map((post) => `“${post.title}”`).join(", ")}` : ""}
                {entry.incoming > 1 ? `${entry.posts.length > 0 ? "; " : " — "}${entry.incoming} entries are moving there` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {stale ? (
          <Button type="button" variant="brand" onClick={() => { router.refresh(); onClose(); }}>
            Reload calendar
          </Button>
        ) : sameDay ? (
          <Button type="button" variant="brand" disabled={pending} onClick={() => save(true)}>
            {pending ? "Saving…" : "Move anyway"}
          </Button>
        ) : (
          <Button type="button" variant="brand" disabled={changes.length === 0 || invalid.length > 0 || pending} onClick={() => save(false)}>
            {pending ? "Saving…" : changes.length === 0 ? "Save" : `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
