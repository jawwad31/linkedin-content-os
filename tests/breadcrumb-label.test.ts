import { describe, expect, it } from "vitest";

import { breadcrumbLabel } from "@/lib/format/breadcrumb-label";

describe("breadcrumbLabel", () => {
  it("collapses whitespace and keeps a short label as it is", () => {
    expect(breadcrumbLabel("  Why we\n rebuilt   onboarding ", "Untitled post")).toBe(
      "Why we rebuilt onboarding",
    );
  });

  it("uses the fallback when there is no text", () => {
    expect(breadcrumbLabel(null, "Untitled post")).toBe("Untitled post");
    expect(breadcrumbLabel("   \n\t", "Untitled post")).toBe("Untitled post");
  });

  it("cuts a long label to the limit with one ellipsis character", () => {
    const label = breadcrumbLabel("abcdefghijklmnopqrstuvwxyz", "Untitled", 10);

    expect(label).toBe("abcdefghi…");
    expect(Array.from(label)).toHaveLength(10);
  });

  it("does not leave a space before the ellipsis or split an emoji", () => {
    expect(breadcrumbLabel("one two three four", "x", 8)).toBe("one two…");
    expect(breadcrumbLabel("😀😀😀😀😀", "x", 3)).toBe("😀😀…");
  });
});
