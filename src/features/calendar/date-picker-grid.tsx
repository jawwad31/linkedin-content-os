"use client";

import { cn } from "@/lib/utils";

import { WEEKDAY_LABELS, formatLongDate, monthWeeks } from "./dates";

/**
 * A month of days to pick one from. Past days are disabled; days that already have
 * posts show how many. Plain buttons, so it works with the keyboard and a screen reader.
 */
export function DatePickerGrid({
  monthKey,
  today,
  counts,
  selected,
  onSelect,
  disabled = false,
}: {
  monthKey: string;
  today: string;
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (date: string) => void;
  disabled?: boolean;
}) {
  const weeks = monthWeeks(monthKey);

  return (
    <div role="group" aria-label="Choose a date" className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center text-caption font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7 gap-1">
          {week.map((cell, cellIndex) => {
            if (!cell) return <span key={cellIndex} aria-hidden="true" />;
            const count = counts[cell.date] ?? 0;
            const past = cell.date < today;
            const isSelected = cell.date === selected;
            return (
              <button
                key={cell.date}
                type="button"
                disabled={past || disabled}
                aria-pressed={isSelected}
                aria-label={`${formatLongDate(cell.date)}${count > 0 ? `, ${count} ${count === 1 ? "post" : "posts"}` : ""}${past ? ", past date" : ""}`}
                onClick={() => onSelect(cell.date)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center rounded-control border px-1 py-1 text-small",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple",
                  isSelected
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-border-grey bg-white text-near-black hover:bg-soft-white",
                  cell.date === today && !isSelected ? "font-bold" : "",
                  past ? "cursor-not-allowed opacity-40" : "",
                )}
              >
                <span>{cell.day}</span>
                {count > 0 ? (
                  <span className={cn("text-caption", isSelected ? "text-white" : "text-muted-foreground")}>
                    {count} {count === 1 ? "post" : "posts"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
