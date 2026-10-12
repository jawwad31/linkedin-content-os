import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/client/c1/posts",
}));
vi.mock("@/features/auth/actions", () => ({ logout: vi.fn() }));

import { AccountMenu } from "@/components/app-shell/account-menu";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { MobileClientNav } from "@/components/app-shell/mobile-client-nav";

describe("the account menu at the foot of the rail", () => {
  it("shows the company name, and keeps Change password and Log out out of sight until it is opened", () => {
    const html = renderToStaticMarkup(createElement(AccountMenu, { clientName: "Avelune" }));
    expect(html).toContain("Avelune");
    expect(html).toContain('aria-label="Account menu for Avelune"');
    expect(html).not.toContain("Change password");
    expect(html).not.toContain("Log out");
  });

  it("is the only account control in the desktop rail", () => {
    const html = renderToStaticMarkup(
      createElement(AppSidebar, { clientId: "c1", clientName: "Avelune", showResearch: true, postsNeedingYou: 0 }),
    );
    expect(html).toContain("Avelune");
    expect(html).not.toContain("Change password");
    expect(html).not.toContain("Log out");
    expect((html.match(/Account menu for/g) ?? []).length).toBe(1);
  });

  it("falls back to a single initial for an unnamed company and shows two initials for a long name", () => {
    expect(renderToStaticMarkup(createElement(AccountMenu, { clientName: "" }))).toContain(">V<");
    expect(renderToStaticMarkup(createElement(AccountMenu, { clientName: "Acme Marketing Group" }))).toContain(">AM<");
  });

  it("keeps the phone drawer free of always-visible account links as well", () => {
    const html = renderToStaticMarkup(
      createElement(MobileClientNav, { clientId: "c1", clientName: "Avelune", showResearch: true, postsNeedingYou: 0 }),
    );
    expect(html).not.toContain("Change password");
    expect(html).not.toContain("Log out");
  });
});
