import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/features/calendar/actions", () => ({
  addCalendarEntryAction: vi.fn(),
  getAddableDateCountsAction: vi.fn(),
}));

import type { BriefingView, StoredFinding } from "@/features/research/web-research/contracts";
import { ResearchWorkbench } from "@/features/research/web-research/research-workbench";

const finding = (extra: Partial<StoredFinding> = {}): StoredFinding => ({
  id: "11111111-1111-4111-8111-111111111111",
  fingerprint: "fp",
  approval_status: "pending",
  content_idea_id: null,
  content_bank_entry_id: null,
  developmentKey: "key",
  title: "Meta changes lead ad billing",
  whatChanged: "Meta now bills lead ads on submissions.",
  whyItMatters: "Cost per lead moves.",
  agencyAction: "Re-baseline targets.",
  angle: "Cost per lead will look different.",
  category: "confirmed_change",
  confidence: "high",
  consequence: 4,
  relevance: 5,
  novelty: "new",
  previousFindingId: null,
  sources: [
    {
      url: "https://example.com/a",
      title: "Meta announcement",
      publishedOn: "2026-10-01",
      announcedOn: null,
      effectiveOn: null,
      dateEvidence: null,
      sourceKind: "primary",
    },
  ],
  ...extra,
});

const briefing = (findings: StoredFinding[]): BriefingView => ({
  id: "22222222-2222-4222-8222-222222222222",
  revision: 1,
  outcome: "success",
  summary: "An overall summary essay",
  coverage_gaps: [],
  error_code: null,
  created_at: "2026-10-12T08:00:00.000Z",
  candidate_count: 1,
  findings,
  candidates: [],
});

function render(
  findings: StoredFinding[],
  props: Partial<Parameters<typeof ResearchWorkbench>[0]> = {},
) {
  const view = briefing(findings);
  return renderToStaticMarkup(
    createElement(ResearchWorkbench, {
      clientId: "client-1",
      settings: null,
      briefings: [view],
      canManage: true,
      canCreatePosts: true,
      createPostsReason: null,
      canSave: true,
      saveReason: null,
      canAddToCalendar: true,
      addToCalendarReason: null,
      providerConfigured: true,
      openBriefingId: view.id,
      ...props,
    }),
  );
}

describe("a research briefing page", () => {
  it("offers Save to Content Bank on each finding and no other way to start a post", () => {
    const html = render([finding()]);
    expect(html).toContain("Save to Content Bank");
    expect(html).not.toContain("Create separate posts");
    expect(html).not.toContain("Add selected findings to newsletter");
    expect(html).not.toContain("Approve finding");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("/ideas");
    expect(html).not.toContain("An overall summary essay");
  });

  it("confirms a saved finding and points to Create post and Add to Calendar", () => {
    const entryId = "33333333-3333-4333-8333-333333333333";
    const html = render([finding({ content_bank_entry_id: entryId })]);
    expect(html).toContain("Finding 1 is now in Content Bank as a trend reaction. Reusable, unused.");
    expect(html).toContain(`/client/client-1/posts/new?sourceType=founder_experience&amp;sourceId=${entryId}`);
    expect(html).toContain("Add to Calendar");
    expect(html).not.toContain("Save to Content Bank");
  });

  it("disables Save with one reason when the person cannot contribute research", () => {
    const html = render([finding()], {
      canSave: false,
      saveReason: "You cannot save findings to the Content Bank. Ask an account admin to add the Research contribution capability.",
    });
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Save to Content Bank/);
    expect(html).toContain("You cannot save findings to the Content Bank.");
  });

  it("disables Create post and Add to Calendar with their reasons on a saved finding", () => {
    const html = render(
      [finding({ content_bank_entry_id: "33333333-3333-4333-8333-333333333333" })],
      {
        canCreatePosts: false,
        createPostsReason: "You cannot create posts. Ask an account admin to add the Draft posts capability.",
        canAddToCalendar: false,
        addToCalendarReason: "You cannot add entries to the calendar. Ask an account admin to add the Manage ideas capability.",
      },
    );
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Create post/);
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Add to Calendar/);
    expect(html).toContain("You cannot create posts.");
    expect(html).toContain("You cannot add entries to the calendar.");
  });

  it("shows no actions on an archived finding", () => {
    const html = render([finding({ approval_status: "archived" })]);
    expect(html).not.toContain("Save to Content Bank");
  });
});

describe("the Research list for a member", () => {
  it("shows Run now disabled, with the reason", () => {
    const html = render([], { canManage: false, openBriefingId: undefined });
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Run now/);
    expect(html).toContain("You cannot run research.");
  });
});
