import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/content-bank/actions", () => ({
  toggleAllowReuseAction: vi.fn(),
  archiveContentBankEntryAction: vi.fn(),
  deleteContentBankExperienceAction: vi.fn(),
  loadContentBankUsageAction: vi.fn(),
}));
vi.mock("@/features/calendar/actions", () => ({
  addCalendarEntryAction: vi.fn(),
  cancelCalendarSlotsAction: vi.fn(),
  getAddableDateCountsAction: vi.fn(),
  moveCalendarSlotsAction: vi.fn(),
}));

import { ContentBankPanel } from "@/features/content-bank/content-bank-panel";
import type { ClientPermission, EffectiveClientRole } from "@/lib/access/roles";

function render(role: EffectiveClientRole, permissions: ClientPermission[] = []) {
  return renderToStaticMarkup(
    createElement(ContentBankPanel, { clientId: "client-1", role, permissions, entries: [] }),
  );
}

describe("Content Bank empty state (wireframe s3)", () => {
  it("says what the Content Bank is for, with one New entry action", () => {
    const html = render("client_admin");
    expect(html).toContain("No entries yet");
    expect(html).toContain("Entries are the source material for posts. Add an experience, a trend reaction or a resource.");
    expect(html.match(/New entry/g)?.length).toBe(1);
    expect(html).not.toContain("You cannot add entries");
  });

  it("disables New entry with one reason for a user without Manage experiences", () => {
    const html = render("client_user", ["ideas_manage"]);
    expect(html).toContain("You cannot add entries. Ask an account admin to add the Manage experiences capability.");
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>)[\s\S])*New entry/);
  });
});
