import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/calendar/actions", () => ({
  addCalendarEntryAction: vi.fn(),
  cancelCalendarSlotsAction: vi.fn(),
  getAddableDateCountsAction: vi.fn(),
  moveCalendarSlotsAction: vi.fn(),
}));

import { CalendarView } from "@/features/calendar/calendar-view";
import { DatePickerGrid } from "@/features/calendar/date-picker-grid";
import type { CalendarSlotRecord } from "@/features/calendar/queries";

const slot = (overrides: Partial<CalendarSlotRecord>): CalendarSlotRecord => ({
  id: "slot-1",
  slotIndex: 1,
  bucket: "experience",
  requestedBucket: "experience",
  shortageReason: null,
  status: "reserved",
  sourceId: "e1",
  sourceType: "founder_experience",
  sourceTitle: "Pricing is a positioning signal",
  postId: null,
  postStatus: null,
  scheduledDate: "2026-10-13",
  ...overrides,
});

function render(props: Partial<Parameters<typeof CalendarView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(CalendarView, {
      clientId: "00000000-0000-4000-8000-0000000000c1",
      monthKey: "2026-10",
      monthLabel: "October 2026",
      today: "2026-10-11",
      canPlan: true,
      calendar: { id: "cal-1", planRevision: 3 },
      slots: [],
      entries: [],
      ...props,
    }),
  );
}

describe("CalendarView", () => {
  it("explains an empty month and offers Add entry", () => {
    const html = render();
    expect(html).toContain("Nothing on the calendar yet");
    expect(html).toContain("Pick a Content Bank entry, then choose the date to post it.");
    expect(html).toContain("Add entry");
    expect(html).toContain("Replan month");
  });

  it("shows each state as a word, not just a symbol, on the grid and the phone list", () => {
    const html = render({
      slots: [
        slot({ id: "a", scheduledDate: "2026-10-13", status: "reserved" }),
        slot({ id: "b", scheduledDate: "2026-10-08", status: "drafting", sourceTitle: "Pricing signals" }),
        slot({ id: "c", scheduledDate: "2026-10-06", status: "drafted", postId: "p1", sourceTitle: "Proposal review checklist" }),
      ],
    });
    for (const word of ["Reserved", "Drafting", "Drafted"]) expect(html).toContain(word);
    expect(html).toContain("Pricing is a positioning signal");
    // Both layouts are present; CSS chooses one by screen width.
    expect(html).toContain("Tue, Oct 13");
  });

  it("allows two entries on one day", () => {
    const html = render({
      slots: [
        slot({ id: "a", scheduledDate: "2026-10-22", sourceTitle: "Retainer pricing shifts" }),
        slot({ id: "b", scheduledDate: "2026-10-22", sourceTitle: "Why clients stay", slotIndex: 2 }),
      ],
    });
    expect(html).toContain("Retainer pricing shifts");
    expect(html).toContain("Why clients stay");
  });

  it("lists slots from the old monthly plan under Needs a date instead of dropping them", () => {
    const html = render({
      slots: [
        slot({ id: "old", scheduledDate: null, sourceTitle: "Old reserved entry" }),
        slot({ id: "ph", scheduledDate: null, status: "planned", bucket: "evergreen", sourceId: null, sourceType: null, sourceTitle: null }),
      ],
    });
    expect(html).toContain("Needs a date");
    expect(html).toContain("Old reserved entry");
    expect(html).toContain("Evergreen slot from the old plan");
  });

  it("dims the actions and says who can grant them when the user cannot plan", () => {
    const html = render({ canPlan: false, slots: [slot({})] });
    expect(html).toContain("You cannot add entries to the calendar. Ask an account admin to add the Manage ideas capability.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Add entry/);
  });

  it("keeps Add entry disabled in the empty state for a user who cannot plan", () => {
    const html = render({ canPlan: false, slots: [] });
    expect(html).toContain("Nothing on the calendar yet");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Add entry/);
    expect(html.match(/Add entry/g)?.length).toBe(1);
  });
});

describe("DatePickerGrid", () => {
  it("disables past days, labels counts, and marks the chosen day", () => {
    const html = renderToStaticMarkup(
      createElement(DatePickerGrid, {
        monthKey: "2026-11",
        today: "2026-11-10",
        counts: { "2026-11-12": 2, "2026-11-18": 1 },
        selected: "2026-11-20",
        onSelect: () => undefined,
      }),
    );
    expect(html).toContain("Thu, Nov 12, 2 posts");
    expect(html).toContain("Wed, Nov 18, 1 post");
    expect(html).toContain("Mon, Nov 9, past date");
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Fri, Nov 20"|aria-label="Fri, Nov 20"[^>]*aria-pressed="true"/);
  });
});
