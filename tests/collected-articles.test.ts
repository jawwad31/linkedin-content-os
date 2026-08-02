import { describe, expect, it } from "vitest";

import {
  parseArticleStatusFilter,
} from "@/features/research/collected-articles/queries";
import {
  DEFAULT_COLLECTED_ARTICLE_PAGE_SIZE,
  parseCollectedArticlePage,
  parseCollectedArticlePageSize,
} from "@/features/research/collected-articles/pagination";

describe("collected article query parameters", () => {
  it("accepts only known article statuses", () => {
    expect(parseArticleStatusFilter("relevant")).toBe("relevant");
    expect(parseArticleStatusFilter("used")).toBe("used");
    expect(parseArticleStatusFilter("deleted")).toBe("all");
    expect(parseArticleStatusFilter(undefined)).toBe("all");
  });

  it("normalizes invalid pages to the first page", () => {
    expect(parseCollectedArticlePage("3")).toBe(3);
    expect(parseCollectedArticlePage("0")).toBe(1);
    expect(parseCollectedArticlePage("-4")).toBe(1);
    expect(parseCollectedArticlePage("not-a-number")).toBe(1);
  });

  it("allows the supported page sizes including the 100-item batch limit", () => {
    expect(parseCollectedArticlePageSize("25")).toBe(25);
    expect(parseCollectedArticlePageSize("50")).toBe(50);
    expect(parseCollectedArticlePageSize("100")).toBe(100);
    expect(parseCollectedArticlePageSize("20")).toBe(
      DEFAULT_COLLECTED_ARTICLE_PAGE_SIZE,
    );
  });
});
