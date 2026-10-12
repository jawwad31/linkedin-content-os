import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { draftFailureCopy, formatElapsed, reuseNotice } from "@/features/posts/generate/drafting-copy";
import type { StandaloneContentBankOption } from "@/features/posts/generate/standalone-brief-schema";
import { StandalonePostForm } from "@/features/posts/generate/standalone-post-form";

describe("drafting copy", () => {
  it("formats elapsed time as minutes and padded seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(32.9)).toBe("0:32");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(-4)).toBe("0:00");
    expect(formatElapsed(Number.NaN)).toBe("0:00");
  });

  it("says a Content Bank entry stays reserved, not used, after a failed draft", () => {
    const copy = draftFailureCopy(true);
    expect(copy.headline).toBe("Drafting stopped while writing. Your source and fields are saved.");
    expect(copy.detail).toContain("has not been used up");
    expect(copy.detail).toContain("reserved");
    expect(draftFailureCopy(false).detail).toContain("Nothing has been used");
  });

  it("explains reuse in the wireframe's words", () => {
    expect(reuseNotice(false)).toBe("Single-use. This entry is used up once the post is drafted. Reuse is turned off.");
    expect(reuseNotice(true)).toContain("stays available");
  });
});

const entry: StandaloneContentBankOption = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceType: "founder_experience",
  entryType: "work_log",
  title: "Rebuilt onboarding after losing 2 clients",
  categoryLabel: "Observation",
  readiness: "ready",
  usageStatus: "unused",
  allowReuse: false,
  eligible: true,
  eligibilityMessage: null,
  suggestedTakeaway: "A written 30-day plan beats a kickoff call.",
  canOffer: false,
  details: [{ label: "Takeaway", value: "A written 30-day plan beats a kickoff call." }],
};

function render(props: Partial<Parameters<typeof StandalonePostForm>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(StandalonePostForm, {
      clientId: "client-1",
      documents: [],
      documentsUnavailable: false,
      canUpload: false,
      initialContentBankSource: entry,
      initialSourceError: null,
      draftBlockedReason: null,
      ...props,
    }),
  );
}

describe("Create post screen", () => {
  it("shows the entry with a Change link, the reuse notice and the fields prefilled from it", () => {
    const html = render();
    expect(html).toContain("Rebuilt onboarding after losing 2 clients");
    expect(html).toContain("/client/client-1/content-bank");
    expect(html).toContain(">Change<");
    expect(html).toContain("Single-use. This entry is used up once the post is drafted. Reuse is turned off.");
    expect(html).toContain('value="Rebuilt onboarding after losing 2 clients"');
    expect(html).toContain('value="A written 30-day plan beats a kickoff call."');
    for (const label of ["Topic", "Instructions", "Intended reader", "Takeaway", "Pillar", "Post type", "Funnel stage"]) {
      expect(html).toContain(label);
    }
  });

  it("has one primary Draft post button and none of the old pickers", () => {
    const html = render();
    expect(html.match(/Draft post/g)?.length).toBe(1);
    expect(html).not.toContain("Create a standalone post");
    expect(html).not.toContain("Create draft");
    // Label text only: "maxLength" is an HTML attribute, not a length picker.
    expect(html).not.toMatch(/>\s*(Tone|Length|Hook|Template)/i);
  });

  it("disables Draft post with the reason line when the person cannot draft", () => {
    const reason = "You cannot draft posts. Ask an account admin to add the Draft posts capability.";
    const html = render({ draftBlockedReason: reason });
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Draft post<\/button>/);
    expect(html).toContain(reason);
    expect(html).toMatch(/<fieldset[^>]*\sdisabled=""/);
  });

  it("disables Draft post when the entry is not eligible, and says why", () => {
    const html = render({
      initialContentBankSource: { ...entry, eligible: false, eligibilityMessage: "Mark this entry ready before creating a post." },
    });
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Draft post<\/button>/);
    expect(html).toContain("Mark this entry ready before creating a post.");
  });

  it("without a selected entry offers a note and points to Content Bank", () => {
    const html = render({ initialContentBankSource: null });
    expect(html).toContain("Pasted note or transcript");
    expect(html).toContain("press Create post");
  });
});
