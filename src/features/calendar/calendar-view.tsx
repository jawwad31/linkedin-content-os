"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { CalendarDays, CalendarPlus, Check, CheckCheck, CircleDashed, Diamond, TriangleAlert, X, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cannotReason } from "@/lib/access/permission-copy";
import { cn } from "@/lib/utils";

import { cancelCalendarSlotsAction } from "./actions";
import { AddToCalendarDialog, type CalendarEntryChoice } from "./add-to-calendar-dialog";
import { WEEKDAY_LABELS, formatLongDate, formatShortDate, monthWeeks } from "./dates";
import { EntryPickerDialog } from "./entry-picker-dialog";
import type { CalendarSlotRecord } from "./queries";
import { ReplanMonthDialog } from "./replan-month-dialog";
import {
  SLOT_STATE_HELP,
  SLOT_STATE_LABELS,
  bucketLabel,
  isMovable,
  slotState,
  type DatedSlotState,
} from "./slot-state";

type Notice = { kind: "success" | "error"; text: string };

const STATE_ICON: Record<DatedSlotState, LucideIcon> = {
  reserved: Diamond,
  drafting: CircleDashed,
  drafted: Check,
  failed: TriangleAlert,
  approved: Check,
  published: CheckCheck,
  rejected: X,
};

const STATE_STYLE: Record<DatedSlotState, string> = {
  reserved: "border-brand-purple/30 bg-brand-purple/10 text-near-black",
  drafting: "border-warning/40 bg-warning/10 text-warning-strong",
  drafted: "border-success/30 bg-success/10 text-success-strong",
  failed: "border-danger/30 bg-danger/10 text-danger-strong",
  approved: "border-success/30 bg-success/10 text-success-strong",
  published: "border-success/30 bg-success/10 text-success-strong",
  rejected: "border-danger/30 bg-danger/10 text-danger-strong",
};

const NO_PERMISSION = cannotReason("add entries to the calendar", ["ideas_manage"]) ?? "";

const titleOf = (slot: CalendarSlotRecord) =>
  slot.sourceTitle ?? `${bucketLabel(slot.bucket)} slot from the old plan`;

/** A removable slot is a plain reservation or a leftover placeholder with no post yet. */
const isRemovable = (slot: CalendarSlotRecord) =>
  !slot.postId && ["reserved", "planned", "placeholder"].includes(slot.status);

function SlotChip({ slot, onOpen }: { slot: CalendarSlotRecord; onOpen: (slot: CalendarSlotRecord) => void }) {
  const state = slotState(slot);
  if (!state) return null;
  const Icon = STATE_ICON[state];
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className={cn(
        "flex w-full min-w-0 items-start gap-1 rounded-control border px-1.5 py-1 text-left text-caption",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-purple",
        STATE_STYLE[state],
      )}
    >
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{titleOf(slot)}</span>
        <span className="block">{SLOT_STATE_LABELS[state]}</span>
      </span>
    </button>
  );
}

/**
 * The month as a calendar: each day shows its entries as a symbol plus a word
 * (Reserved, Drafting, Drafted). On a phone the same entries are a dated list.
 */
export function CalendarView({
  clientId,
  monthKey,
  monthLabel,
  today,
  canPlan,
  calendar,
  slots,
  entries,
}: {
  clientId: string;
  monthKey: string;
  monthLabel: string;
  today: string;
  canPlan: boolean;
  calendar: { id: string; planRevision: number } | null;
  slots: CalendarSlotRecord[];
  entries: CalendarEntryChoice[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<CalendarSlotRecord | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<CalendarEntryChoice | null>(null);
  const [replanning, setReplanning] = useState(false);

  const dated = useMemo(() => slots.filter((slot) => slot.scheduledDate && slotState(slot)), [slots]);
  const undated = useMemo(() => slots.filter((slot) => !slot.scheduledDate), [slots]);
  const movable = useMemo(() => slots.filter(isMovable), [slots]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarSlotRecord[]>();
    for (const slot of dated) {
      const list = map.get(slot.scheduledDate as string) ?? [];
      list.push(slot);
      map.set(slot.scheduledDate as string, list);
    }
    return map;
  }, [dated]);
  const sortedDated = useMemo(
    () => [...dated].sort((a, b) => (a.scheduledDate as string).localeCompare(b.scheduledDate as string) || a.slotIndex - b.slotIndex),
    [dated],
  );

  async function removeSlot(slot: CalendarSlotRecord) {
    setNotice(null);
    try {
      const result = await cancelCalendarSlotsAction(clientId, monthKey, [slot.id]);
      if (result.ok) {
        setNotice({ kind: "success", text: `Removed “${titleOf(slot)}” from the calendar. Its reservation was released.` });
        setSelected(null);
        router.refresh();
      } else {
        setNotice({ kind: "error", text: result.message });
      }
    } catch {
      setNotice({
        kind: "error",
        text: "The connection was interrupted, so the result is unknown. Reload the calendar before trying again.",
      });
    }
  }

  const empty = slots.length === 0;
  const weeks = monthWeeks(monthKey);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-3 text-caption text-muted-foreground" aria-label="Entry states">
          {(["reserved", "drafting", "drafted"] as const).map((state) => {
            const Icon = STATE_ICON[state];
            return (
              <li key={state} className="flex items-center gap-1">
                <Icon className="h-3 w-3" aria-hidden="true" /> {SLOT_STATE_LABELS[state]}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canPlan || movable.length === 0 || !calendar}
            onClick={() => setReplanning(true)}
          >
            Replan month
          </Button>
          {empty ? null : (
            <Button type="button" variant="brand" size="sm" disabled={!canPlan} onClick={() => setPicking(true)}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add entry
            </Button>
          )}
        </div>
      </div>

      {!canPlan ? <p className="text-caption text-muted-foreground">{NO_PERMISSION}</p> : null}

      <div aria-live="polite" role="status">
        {notice ? (
          <p
            className={cn(
              "rounded-control border px-4 py-3 text-small",
              notice.kind === "success"
                ? "border-success/30 bg-success/10 text-success-strong"
                : "border-danger/30 bg-danger/10 text-danger-strong",
            )}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      {empty ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing on the calendar yet"
          description="Pick a Content Bank entry, then choose the date to post it."
          action={
            <Button type="button" variant="brand" size="sm" disabled={!canPlan} onClick={() => setPicking(true)}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add entry
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden flex-col gap-1 md:flex" role="group" aria-label={monthLabel}>
            <div className="grid grid-cols-7 gap-1 text-center text-caption font-medium text-muted-foreground">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((cell, cellIndex) =>
                  cell ? (
                    <div
                      key={cell.date}
                      className={cn(
                        "flex min-h-24 flex-col gap-1 rounded-control border border-border-grey bg-white p-1",
                        cell.date < today ? "bg-soft-white" : "",
                      )}
                    >
                      <span className={cn("text-caption", cell.date === today ? "font-bold text-near-black" : "text-muted-foreground")}>
                        {cell.day}
                        {cell.date === today ? " · Today" : ""}
                      </span>
                      {(byDate.get(cell.date) ?? []).map((slot) => (
                        <SlotChip key={slot.id} slot={slot} onOpen={setSelected} />
                      ))}
                    </div>
                  ) : (
                    <span key={cellIndex} aria-hidden="true" />
                  ),
                )}
              </div>
            ))}
          </div>

          <ul className="flex flex-col gap-2 md:hidden" aria-label={`${monthLabel}, entries by date`}>
            {sortedDated.length === 0 ? (
              <li className="text-small text-muted-foreground">No dated entries this month.</li>
            ) : (
              sortedDated.map((slot) => (
                <li key={slot.id} className="flex flex-col gap-1">
                  <span className="text-caption font-medium text-muted-foreground">
                    {formatLongDate(slot.scheduledDate as string)}
                  </span>
                  <SlotChip slot={slot} onOpen={setSelected} />
                </li>
              ))
            )}
          </ul>
        </>
      )}

      {undated.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-card border border-border-grey bg-soft-white p-4" aria-labelledby="needs-a-date">
          <h2 id="needs-a-date" className="text-body font-semibold text-near-black">Needs a date</h2>
          <p className="text-small text-muted-foreground">
            These entries come from the old monthly plan and have no date yet. Give a reserved entry a date with Replan
            month, or remove it to free the entry.
          </p>
          <ul className="flex flex-col gap-2">
            {undated.map((slot) => (
              <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-grey bg-white p-3">
                <span className="min-w-0 break-words text-small text-near-black">{titleOf(slot)}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{bucketLabel(slot.bucket)}</Badge>
                  {slot.postId ? (
                    <Link href={`/client/${clientId}/posts/${slot.postId}/review`} className="text-small text-link underline">
                      Open post
                    </Link>
                  ) : isRemovable(slot) ? (
                    <Button type="button" variant="ghost" size="sm" disabled={!canPlan} onClick={() => removeSlot(slot)}>
                      Remove
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog.Root open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} modal>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/40" />
          <Dialog.Popup
            aria-label="Calendar entry"
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-border-grey bg-white p-6 shadow-2xl focus:outline-none"
          >
            {selected ? (
              <SlotPanel
                key={selected.id}
                clientId={clientId}
                slot={selected}
                canPlan={canPlan}
                onRemove={removeSlot}
              />
            ) : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <EntryPickerDialog
        entries={entries}
        open={picking}
        onClose={() => setPicking(false)}
        onChoose={(entry) => { setPicking(false); setAdding(entry); }}
      />
      <AddToCalendarDialog clientId={clientId} entry={adding} onClose={() => setAdding(null)} />
      {calendar ? (
        <ReplanMonthDialog
          clientId={clientId}
          monthKey={monthKey}
          monthLabel={monthLabel}
          calendarId={calendar.id}
          planRevision={calendar.planRevision}
          today={today}
          slots={movable}
          open={replanning}
          onClose={() => setReplanning(false)}
          onSaved={(moved) =>
            setNotice({ kind: "success", text: `Moved ${moved} ${moved === 1 ? "entry" : "entries"}. Their reservations are unchanged.` })
          }
        />
      ) : null}
    </div>
  );
}

function SlotPanel({
  clientId,
  slot,
  canPlan,
  onRemove,
}: {
  clientId: string;
  slot: CalendarSlotRecord;
  canPlan: boolean;
  onRemove: (slot: CalendarSlotRecord) => Promise<void>;
}) {
  const state = slotState(slot);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const removable = isRemovable(slot);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">
            {slot.scheduledDate ? formatShortDate(slot.scheduledDate) : "No date"} · {bucketLabel(slot.bucket)}
          </p>
          <h2 className="break-words text-body-lg font-heading font-semibold text-near-black">{titleOf(slot)}</h2>
        </div>
        <Dialog.Close className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full text-muted-foreground hover:bg-soft-white" aria-label="Close">
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>

      {state ? (
        <div className={cn("rounded-control border p-3 text-small", STATE_STYLE[state])}>
          <p className="font-medium">{SLOT_STATE_LABELS[state]}</p>
          <p>{SLOT_STATE_HELP[state]}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {slot.postId ? (
          <Link
            href={`/client/${clientId}/posts/${slot.postId}/review`}
            className="inline-flex h-[38px] items-center rounded-control bg-accent-primary px-4 text-small font-medium text-on-accent-primary hover:bg-accent-primary-hover"
          >
            Open post
          </Link>
        ) : null}
        {removable ? (
          confirming ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={async () => { setPending(true); await onRemove(slot); setPending(false); }}
              >
                {pending ? "Removing…" : "Confirm: remove from calendar"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={!canPlan} onClick={() => setConfirming(true)}>
              Remove from calendar
            </Button>
          )
        ) : null}
      </div>
      {removable && !canPlan ? <p className="text-caption text-muted-foreground">{NO_PERMISSION}</p> : null}
      {removable ? (
        <p className="text-caption text-muted-foreground">
          Removing releases the entry&apos;s reservation so it can be used again.
        </p>
      ) : null}
    </div>
  );
}
