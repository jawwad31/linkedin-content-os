import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/ui/page-header";

describe("PageHeader breadcrumb", () => {
  it("renders the plain heading and no breadcrumb without one", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { title: "Newsletter" }));

    expect(html).toContain(">Newsletter</h1>");
    expect(html).not.toContain("<nav");
  });

  it("links the parent steps and makes the last step the plain heading", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        breadcrumb: [
          { label: "Newsletter", href: "/client/c1/newsletter" },
          { label: "November edition" },
        ],
      }),
    );

    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/client/c1/newsletter"');
    expect(html).toMatch(/<h1[^>]*aria-current="page"[^>]*>November edition<\/h1>/);
    expect(html).not.toMatch(/<a [^>]*>November edition<\/a>/);
  });

  it("keeps a long last step to one line with its full text in the title attribute", () => {
    const label = "x".repeat(200);
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        breadcrumb: [{ label: "Posts", href: "/client/c1/posts" }, { label }],
      }),
    );

    expect(html).toMatch(/<h1[^>]*title="x{200}"[^>]*class="[^"]*\btruncate\b/);
  });
});
