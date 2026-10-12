import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: { ok: true, clients: [] } as
    | { ok: true; clients: { id: string }[] }
    | { ok: false },
}));

vi.mock("@/features/clients/queries", () => ({
  getAccessibleClients: vi.fn(async () => state.result),
}));

import { ClientList } from "@/features/clients/client-list";
import type { AccessibleClient } from "@/features/clients/queries";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  state.result = { ok: true, clients: [] };
});

describe("where sign-in lands (no agency area, no workspace switcher)", () => {
  it("takes a person with one company straight into it", async () => {
    state.result = { ok: true, clients: [{ id: ID_A }] };
    expect(await resolveAuthenticatedDestination("user")).toBe(`/client/${ID_A}/posts`);
  });

  it("shows the Companies list to a person who can reach several", async () => {
    state.result = { ok: true, clients: [{ id: ID_A }, { id: ID_B }] };
    expect(await resolveAuthenticatedDestination("user")).toBe("/clients");
  });

  it("sends a person with no company, or a failed lookup, to no-access", async () => {
    expect(await resolveAuthenticatedDestination("user")).toBe("/no-access");
    state.result = { ok: false };
    expect(await resolveAuthenticatedDestination("user")).toBe("/no-access");
  });

  it("never routes to the removed agency pages", async () => {
    for (const clients of [[], [{ id: ID_A }], [{ id: ID_A }, { id: ID_B }]]) {
      state.result = { ok: true, clients };
      expect(await resolveAuthenticatedDestination("user")).not.toContain("/agency");
    }
  });
});

const company = (id: string, name: string, role: AccessibleClient["role"] = "client_admin"): AccessibleClient => ({
  id, name, founderName: null, industry: "Marketing", updatedAt: "2026-10-12T08:00:00.000Z", role,
});

describe("Companies list", () => {
  it("lists each company with its role and opens it at Posts, with no create or delete control", () => {
    const html = renderToStaticMarkup(createElement(ClientList, { clients: [company(ID_A, "Acme Co"), company(ID_B, "Beta Ltd")] }));
    expect(html).toContain("Acme Co");
    expect(html).toContain("Beta Ltd");
    expect(html).toContain(`href="/client/${ID_A}/posts"`);
    expect(html).toContain("Account Admin");
    expect(html).not.toContain("Agency");
    expect(html).not.toMatch(/Create company|New company|Delete|Archive/);
    expect(html).not.toContain("/dashboard");
  });

  it("has an honest empty state", () => {
    const html = renderToStaticMarkup(createElement(ClientList, { clients: [] }));
    expect(html).toContain("No companies yet");
  });
});
