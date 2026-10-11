"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import type { CalendarEntryChoice } from "./add-to-calendar-dialog";

/** Choose which Content Bank entry to put on the calendar; the date comes next. */
export function EntryPickerDialog({
  entries,
  open,
  onClose,
  onChoose,
}: {
  entries: CalendarEntryChoice[];
  open: boolean;
  onClose: () => void;
  onChoose: (entry: CalendarEntryChoice) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle ? entries.filter((entry) => entry.title.toLowerCase().includes(needle)) : entries;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) { setQuery(""); onClose(); } }} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/40" />
        <Dialog.Popup
          aria-label="Choose an entry"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-dialog border border-border-grey bg-white p-6 shadow-2xl focus:outline-none"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-body-lg font-heading font-semibold text-near-black">Add entry</h2>
              <p className="mt-1 text-small text-muted-foreground">Choose a Content Bank entry, then pick its date.</p>
            </div>
            <Dialog.Close className="rounded-full p-1 text-muted-foreground hover:bg-soft-white" aria-label="Close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {entries.length === 0 ? (
            <p className="text-small text-muted-foreground">
              No entries are available. Entries must be ready, and single-use entries that are already reserved or used are not offered.
            </p>
          ) : (
            <>
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search entries"
                aria-label="Search entries"
              />
              <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                {visible.map((entry) => (
                  <li key={`${entry.sourceType}:${entry.sourceId}`}>
                    <button
                      type="button"
                      onClick={() => onChoose(entry)}
                      className="flex w-full flex-col gap-1 rounded-control border border-border-grey p-3 text-left hover:bg-soft-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple"
                    >
                      <span className="break-words text-small font-medium text-near-black">{entry.title}</span>
                      <span className="flex flex-wrap gap-2">
                        <Badge variant="outline">{entry.typeLabel}</Badge>
                        <Badge variant="neutral">{entry.reuseLabel}</Badge>
                      </span>
                    </button>
                  </li>
                ))}
                {visible.length === 0 ? (
                  <li className="text-small text-muted-foreground">No entries match “{query}”.</li>
                ) : null}
              </ul>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
