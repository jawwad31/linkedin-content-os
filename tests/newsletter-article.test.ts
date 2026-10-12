import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleView } from "@/features/newsletter/article-view";
import { parseArticle } from "@/features/newsletter/article";
import { describeEdition } from "@/features/newsletter/newsletter-list";
import type { EditionSummary } from "@/features/newsletter/contracts";

describe("article view", () => {
  it("reads headings, lists and paragraphs", () => {
    expect(
      parseArticle("# Title\n\nOne line\nsecond line\n\n- a\n- b\n\n1. x\n2. y"),
    ).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "One line second line" },
      { kind: "list", ordered: false, items: ["a", "b"] },
      { kind: "list", ordered: true, items: ["x", "y"] },
    ]);
  });
  it("links only public web addresses and never injects markup", () => {
    const html = renderToStaticMarkup(
      createElement(ArticleView, {
        markdown:
          "See [the notes](https://example.com/notes), [local](http://localhost/secret) and <script>alert(1)</script> **bold**.",
      }),
    );
    expect(html).toContain('href="https://example.com/notes"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("localhost");
    expect(html).toContain("local");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>bold</strong>");
  });
});

describe("edition list", () => {
  const base: EditionSummary = {
    id: "e",
    revision: 1,
    status: "outline",
    approved_revision: null,
    outline_revision: null,
    publication_url: null,
    published_on: null,
    created_at: "2026-10-12",
    name: "November edition",
    planStatus: "ready",
    hasQa: false,
    qaDecision: null,
    qaNotes: 0,
  };
  it("says where each edition stands and what to do next", () => {
    expect(describeEdition(base)).toMatchObject({
      status: "Outline ready to review",
      action: "Review outline",
    });
    expect(describeEdition({ ...base, planStatus: null }).action).toBe(
      "Plan outline",
    );
    expect(
      describeEdition({ ...base, outline_revision: 1 }).action,
    ).toBe("Draft edition");
    expect(
      describeEdition({ ...base, status: "review", hasQa: true, qaNotes: 2 }),
    ).toMatchObject({ status: "Draft ready · 2 QA notes", action: "Review" });
    expect(
      describeEdition({
        ...base,
        revision: 2,
        status: "approved",
        approved_revision: 2,
      }),
    ).toMatchObject({ status: "Approved version 2", action: "Copy or export" });
    expect(describeEdition({ ...base, status: "rejected" }).action).toBe("Edit");
    expect(describeEdition({ ...base, planStatus: "research_gap" }).tone).toBe(
      "warning",
    );
  });
});
