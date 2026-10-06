import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/calendar/actions", () => ({
  cancelCalendarSlotsAction: vi.fn(),
  commitCalendarPlanAction: vi.fn(),
  previewCalendarPlanAction: vi.fn(),
  resetMonthToDefaultsAction: vi.fn(),
  saveAccountDefaultsAction: vi.fn(),
  saveMonthSettingsAction: vi.fn(),
}));

import { CalendarPanel } from "@/features/calendar/calendar-panel";
import type {
  CalendarDefaultsRecord,
  CalendarRecord,
  CalendarSlotRecord,
  CandidateEntry,
} from "@/features/calendar/queries";

const settings = {
  timezone: "Asia/Karachi",
  postCount: 30,
  shares: { experience: 40, asset: 10, evergreen: 40, news: 10 },
  newsCapPercent: 20,
};

const defaults: CalendarDefaultsRecord = {
  version: 2,
  settings,
  updatedAt: "2026-10-01T00:00:00Z",
};

const calendar: CalendarRecord = {
  id: "00000000-0000-4000-8000-000000000900",
  month: "2026-11",
  settings,
  defaultsVersion: 2,
  settingsRevision: 1,
  planRevision: 1,
  plannedAt: "2026-10-07T00:00:00Z",
};

const entry = (id: string, title: string, overrides: Partial<CandidateEntry> = {}): CandidateEntry => ({
  id,
  sourceType: "founder_experience",
  title,
  summary: null,
  category: "observation",
  allowReuse: false,
  usageCount: 0,
  inPlan: false,
  ...overrides,
});

const baseSlot: CalendarSlotRecord = {
  id: "slot-1",
  slotIndex: 1,
  bucket: "experience",
  requestedBucket: "experience",
  shortageReason: null,
  status: "reserved",
  sourceId: "e1",
  sourceType: "founder_experience",
  sourceTitle: "Migrated the CRM in a weekend",
  postId: null,
  postStatus: null,
};

function render(overrides: Partial<Parameters<typeof CalendarPanel>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(CalendarPanel, {
      clientId: "00000000-0000-4000-8000-0000000000c1",
      monthKey: "2026-11",
      monthLabel: "November 2026",
      canPlan: true,
      canEditDefaults: true,
      defaults: null,
      calendar: null,
      slots: [],
      candidates: { experience: [], asset: [] },
      ...overrides,
    }),
  );
}

describe("CalendarPanel", () => {
  it("starts blank with two clearly separate save actions when nothing is saved", () => {
    const html = render();

    expect(html).toContain("Settings for November 2026");
    expect(html).toContain("Not saved yet. Enter the settings for this month.");
    expect(html).toContain("Save for this month");
    expect(html).toContain("Applies to November 2026 only. Account defaults stay as they are.");
    expect(html).toContain("Save as default");
    expect(html).toContain("Existing months and plans are not changed.");
    // No hardcoded allocation: every numeric field starts empty.
    expect(html).not.toMatch(/value="(40|10|50|60)"/);
    // Source selection and the plan need a saved month first.
    expect(html).not.toContain("Choose Content Bank entries");
    expect(html).not.toContain("Plan for November 2026");
  });

  it("starts a new month from the account defaults and says so", () => {
    const html = render({ defaults });

    expect(html).toContain("Started from the account defaults (version 2)");
    expect(html).toContain('value="30"');
    expect(html).toContain('value="Asia/Karachi"');
    expect(html).toContain("12 experience");
  });

  it("disables Save as default for non-admins and explains why", () => {
    const html = render({ defaults, canEditDefaults: false });

    expect(html).toContain("Only Account and Agency Admins can change the account defaults.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save as default<\/button>/);
  });

  it("is read-only without the planning permission", () => {
    const html = render({ canPlan: false, defaults, calendar, slots: [baseSlot] });

    expect(html).not.toContain("Save for this month");
    expect(html).not.toContain("Choose Content Bank entries");
    expect(html).not.toContain("Cancel slot");
    expect(html).toContain("Planning requires the Idea Creator permission.");
    expect(html).toContain("Migrated the CRM in a weekend");
  });

  it("reports whether the saved month matches the account defaults", () => {
    expect(render({ defaults, calendar })).toContain(
      "This month matches the account defaults (version 2).",
    );

    const differing = {
      ...calendar,
      settings: { ...settings, postCount: 12 },
    };
    expect(render({ defaults, calendar: differing })).toContain(
      "This month differs from the account defaults (version 2).",
    );
    expect(render({ defaults, calendar: differing })).toContain(
      "Reset this month to the current defaults",
    );
  });

  it("shows candidates with reuse and usage history, preselecting only the current plan", () => {
    const html = render({
      defaults,
      calendar,
      slots: [baseSlot],
      candidates: {
        experience: [
          entry("e1", "Migrated the CRM in a weekend", { inPlan: true }),
          entry("e2", "Lost a client over a late report", { allowReuse: true, usageCount: 2 }),
        ],
        asset: [],
      },
    });

    expect(html).toContain("Choose Content Bank entries");
    expect(html).toContain("Reusable");
    expect(html).toContain("Used 2x before");
    expect(html).toContain("In current plan");
    expect(html).toContain("1 selected of 12 needed");
    expect(html).toContain("No eligible entries. Evergreen posts will fill these slots.");
    // The reusable entry is offered but not selected for the user.
    expect(html.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(1);
  });

  it("renders the saved plan, an unfinished news placeholder, and shortage substitution", () => {
    const html = render({
      defaults,
      calendar,
      slots: [
        baseSlot,
        {
          ...baseSlot,
          id: "slot-2",
          slotIndex: 2,
          bucket: "evergreen",
          requestedBucket: "experience",
          shortageReason: "fewer_selected",
          status: "planned",
          sourceId: null,
          sourceType: null,
          sourceTitle: null,
        },
        {
          ...baseSlot,
          id: "slot-3",
          slotIndex: 3,
          bucket: "news",
          requestedBucket: "news",
          status: "placeholder",
          sourceId: null,
          sourceType: null,
          sourceTitle: null,
        },
        {
          ...baseSlot,
          id: "slot-4",
          slotIndex: 4,
          sourceId: "e9",
          sourceTitle: "Already drafted",
          postId: "post-1",
          postStatus: "approved",
        },
      ],
    });

    expect(html).toContain("4 of 30 slots planned. Drafts are not written yet.");
    expect(html).toContain("News placeholder. Timely material has not been chosen yet.");
    expect(html).toContain("border-dashed");
    expect(html).toContain("Planned as experience, but fewer entries were selected than the plan asked for.");
    expect(html).toContain("Post: approved");
    // A slot that already has a post cannot be cancelled from the plan.
    expect(html.match(/Cancel slot \d/g)?.length ?? 0).toBe(3);
    expect(html).toContain("1 with posts are kept");
  });

  it("labels every input and exposes the month navigation context", () => {
    const html = render({ defaults });

    for (const label of ["Posts this month", "Timezone", "News cap"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/<label for=/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
  });
});
