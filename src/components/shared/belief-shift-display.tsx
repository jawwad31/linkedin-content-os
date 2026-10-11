import { ArrowDown } from "lucide-react";

import { splitBeliefShift } from "@/lib/format/belief-shift";

/** Renders a belief_shift value as a "Before" / "After" pair when it
 * matches the "X -> Y" contract the Planning Agent always writes; falls
 * back to plain text for anything that doesn't match. */
export function BeliefShiftDisplay({ value }: { value: string }) {
  const shift = splitBeliefShift(value);

  if (!shift) {
    return (
      <p className="whitespace-pre-line break-words text-small italic text-near-black">
        {value}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-control border border-border-grey bg-white/70 p-3">
        <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
          Before
        </p>
        <p className="mt-1 whitespace-pre-line break-words text-small italic text-near-black">
          &ldquo;{shift.from}&rdquo;
        </p>
      </div>
      <div className="flex justify-center text-link">
        <ArrowDown aria-hidden="true" className="h-4 w-4" />
      </div>
      <div className="rounded-control border border-brand-purple/25 bg-white p-3">
        <p className="text-caption font-medium uppercase tracking-wide text-secondary-dark">
          After
        </p>
        <p className="mt-1 whitespace-pre-line break-words text-small font-medium italic text-near-black">
          &ldquo;{shift.to}&rdquo;
        </p>
      </div>
    </div>
  );
}
