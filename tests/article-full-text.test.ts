import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("@/features/research/automation/safe-fetch", async () => {
  const actual = await vi.importActual<typeof import("@/features/research/automation/safe-fetch")>(
    "@/features/research/automation/safe-fetch",
  );
  return { ...actual, fetchPublicText: (...args: unknown[]) => state.fetch(...args) };
});

import {
  ARTICLE_TEXT_LIMIT,
  ARTICLE_TEXT_MINIMUM,
  clipArticleText,
  readArticleText,
} from "@/features/research/collected-articles/article-text";
import { toSourceArticle } from "@/features/posts/generate/source-article";

const URL_OK = "https://example.com/post";
const page = (body: string) => ({
  url: URL_OK,
  original: `<html><head><title>T</title></head><body><nav>Menu</nav><article>${body}</article><footer>Footer</footer></body></html>`,
});
const sentence = "Meta now bills lead ads on submissions rather than impressions. ";

beforeEach(() => {
  state.fetch.mockReset();
});

describe("reading the whole article page", () => {
  it("returns the readable text of the article and drops the page furniture", async () => {
    state.fetch.mockResolvedValue(page(`<p>${sentence.repeat(20)}</p>`));
    const result = await readArticleText(URL_OK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("Meta now bills lead ads");
    expect(result.text).not.toContain("Menu");
    expect(result.text).not.toContain("Footer");
    expect(result.truncated).toBe(false);
  });

  it("keeps a very long article, cut at the limit on a word boundary and marked as cut", async () => {
    // Longer than the reader's usual page-text ceiling, so the extractor must not reject it.
    state.fetch.mockResolvedValue(page(`<p>${sentence.repeat(1500)}</p>`));
    const result = await readArticleText(URL_OK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(ARTICLE_TEXT_LIMIT + 1);
    expect(result.text.endsWith("…")).toBe(true);
  });

  it("treats a stub, a blocked page or a network error as unavailable, never as an exception", async () => {
    state.fetch.mockResolvedValue(page("<p>Please enable JavaScript.</p>"));
    expect(await readArticleText(URL_OK)).toEqual({ ok: false });
    expect("Please enable JavaScript.".length).toBeLessThan(ARTICLE_TEXT_MINIMUM);
    state.fetch.mockRejectedValue(new Error("SOURCE_BLOCKED"));
    expect(await readArticleText(URL_OK)).toEqual({ ok: false });
    state.fetch.mockRejectedValue(new Error("SOURCE_UNAVAILABLE"));
    expect(await readArticleText("http://localhost/x")).toEqual({ ok: false });
  });

  it("clips text without touching short text", () => {
    expect(clipArticleText("short text")).toEqual({ text: "short text", truncated: false });
    const long = "word ".repeat(5000);
    const clipped = clipArticleText(long, 100);
    expect(clipped.truncated).toBe(true);
    expect(clipped.text.length).toBeLessThanOrEqual(101);
    expect(clipped.text).not.toMatch(/\bwor…$/);
  });
});

describe("what the writer is given for an article", () => {
  const row = {
    id: "a1",
    title: "Meta changes lead ad billing",
    summary: "Short teaser",
    url: URL_OK,
    source_name: "Example Blog",
    published_at: "2026-10-01T08:00:00Z",
  };

  it("adds the whole article text when it was read", () => {
    const article = toSourceArticle({ ...row, full_text: "The full article. ".repeat(10) });
    expect(article.text).toContain("The full article.");
    expect(article.summary).toBe("Short teaser");
    expect(article.url).toBe(URL_OK);
  });

  it("leaves the field out, not empty, when the page could not be read", () => {
    expect(toSourceArticle({ ...row, full_text: null })).not.toHaveProperty("text");
    expect(toSourceArticle({ ...row })).not.toHaveProperty("text");
    expect(toSourceArticle({ ...row, full_text: "   " })).not.toHaveProperty("text");
  });

  it("keeps the summary exactly as before (so stored plans are not invalidated)", () => {
    const summary = "x".repeat(900);
    expect(toSourceArticle({ ...row, summary }).summary).toBe(`${"x".repeat(700)}...`);
    expect(toSourceArticle({ ...row, summary: null }).summary).toBeNull();
  });
});
