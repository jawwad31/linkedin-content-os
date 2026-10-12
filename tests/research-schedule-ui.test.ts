import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { AutomationPanel } from "@/features/research/automation/automation-panel";
import { scheduleSchema, type AutomationView } from "@/features/research/automation/contracts";

const base = { version: 1, enabled: true, timezone: "Asia/Karachi", time: "09:00" };

describe("research schedule input", () => {
  it("accepts daily (missing or null) and each day of the week", () => {
    expect(scheduleSchema.safeParse(base).success).toBe(true);
    expect(scheduleSchema.safeParse({ ...base, weekday: null }).success).toBe(true);
    for (const weekday of [1, 4, 7]) expect(scheduleSchema.safeParse({ ...base, weekday }).success).toBe(true);
  });

  it("rejects a day outside Monday to Sunday or a fraction", () => {
    for (const weekday of [0, 8, 2.5, "monday"]) expect(scheduleSchema.safeParse({ ...base, weekday }).success).toBe(false);
  });
});

const view = (weekday: number | null): AutomationView => ({
  canManage: true,
  schedule: {
    version: 2, enabled: true, timezone: "Asia/Karachi", local_time: "09:00:00",
    weekday, next_due_at: null, last_due_at: null,
  },
  sources: [], versions: [], notifications: [],
});

function render(weekday: number | null) {
  return renderToStaticMarkup(createElement(AutomationPanel, { clientId: "client-1", view: view(weekday), part: "schedule" }));
}

describe("research schedule control", () => {
  it("shows a Daily or Weekly choice, and no day picker for a daily schedule", () => {
    const html = render(null);
    expect(html).toContain("How often");
    expect(html).toContain('<option value="daily" selected="">Daily</option>');
    expect(html).toContain('<option value="weekly">Weekly</option>');
    expect(html).not.toContain("Day of the week");
  });

  it("shows the saved day for a weekly schedule", () => {
    const html = render(3);
    expect(html).toContain('<option value="weekly" selected="">Weekly</option>');
    expect(html).toContain("Day of the week");
    expect(html).toContain('<option value="3" selected="">Wednesday</option>');
  });
});
