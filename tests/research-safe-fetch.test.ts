import { describe, it, expect, vi } from "vitest";
import https from "node:https";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ClientRequest } from "node:http";
import {
  fetchSource,
  isPublicAddress,
  sourceUrl,
  extractPage,
  SOURCE_LIMITS,
  requestSourcePage,
  type FetchDependencies,
} from "@/features/research/automation/safe-fetch";
import { researchTick } from "@/worker/research-tick";
import { fetchFeed } from "@/features/research/rss-collector/feed-fetch";
import { parseFeedEntries } from "@/features/research/rss-collector/feed-parser";
import { SAFE_FEED_ERROR } from "@/features/research/rss-collector/constants";
const address = { address: "93.184.216.34", family: 4 };
function deps(): FetchDependencies {
  return {
    resolve: vi.fn(async () => [address]),
    request: vi.fn(async () => ({
      status: 200,
      type: "text/html",
      body: Buffer.from(
        "<title>Test</title><article>Material platform change with supporting detail.</article>",
      ),
    })),
  };
}
describe("bounded source fetching and independent worker gates", () => {
  it("reads RSS/Atom using pinned safe fetching, rejects private redirects and ordinary HTML", async () => {
    const d = deps();
    const xml =
      "<rss><channel><item><title>Release</title><link>https://example.com/release</link><description>Confirmed update</description><pubDate>Fri, 09 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>";
    d.request = vi.fn(async () => ({
      status: 200,
      type: "application/rss+xml",
      body: Buffer.from(xml),
    }));
    const result = await fetchFeed("https://example.com/feed", 20000, d);
    expect(result).toEqual({ ok: true, body: xml });
    expect(parseFeedEntries(xml)).toMatchObject([
      {
        title: "Release",
        url: "https://example.com/release",
        publishedAt: "2026-10-09T09:00:00.000Z",
      },
    ]);
    expect(
      parseFeedEntries(
        '<feed><entry><title>Atom release</title><link rel="alternate" href="https://example.com/atom"/></entry></feed>',
      )[0].url,
    ).toBe("https://example.com/atom");
    expect(() =>
      parseFeedEntries("<html><body>Not a feed</body></html>"),
    ).toThrow();
    d.request = vi.fn(async () => ({
      status: 302,
      type: "",
      body: Buffer.alloc(0),
      location: "http://169.254.169.254",
    }));
    expect(await fetchFeed("https://example.com/feed", 20000, d)).toEqual({
      ok: false,
      error: SAFE_FEED_ERROR,
    });
    expect(d.request).toHaveBeenCalledTimes(1);
  });
  it("pins the actual HTTP lookup, disables connection reuse and rejects compressed/binary responses", async () => {
    let type = "text/html";
    let encoding = "identity";
    const get = vi.spyOn(https, "get").mockImplementation(((
      ...args: unknown[]
    ) => {
      const options = args[1] as {
        agent: boolean;
        headers: Record<string, string>;
        lookup: (
          host: string,
          options: { all: boolean },
          callback: (error: unknown, address: unknown, family?: number) => void,
        ) => void;
      };
      expect(options.agent).toBe(false);
      expect(options.headers["Accept-Encoding"]).toBe("identity");
      expect(options.headers.Authorization).toBeUndefined();
      options.lookup("example.com", { all: false }, (error, ip, family) => {
        expect(error).toBeNull();
        expect(ip).toBe(address.address);
        expect(family).toBe(4);
      });
      options.lookup("example.com", { all: true }, (error, list) => {
        expect(error).toBeNull();
        expect(list).toEqual([address]);
      });
      const response = new PassThrough() as unknown as IncomingMessage;
      response.statusCode = 200;
      response.headers = { "content-type": type, "content-encoding": encoding };
      queueMicrotask(() => {
        (args[2] as (r: IncomingMessage) => void)(response);
        if (!response.destroyed)
          (response as unknown as PassThrough).end(
            "<article>Factual text</article>",
          );
      });
      return new EventEmitter() as ClientRequest;
    }) as typeof https.get);
    try {
      const page = await requestSourcePage(
        new URL("https://example.com"),
        address,
        AbortSignal.timeout(1000),
      );
      expect(page.body.toString()).toContain("Factual text");
      encoding = "gzip";
      await expect(
        requestSourcePage(
          new URL("https://example.com"),
          address,
          AbortSignal.timeout(1000),
        ),
      ).rejects.toThrow("SOURCE_UNAVAILABLE");
      encoding = "identity";
      type = "application/pdf";
      await expect(
        requestSourcePage(
          new URL("https://example.com"),
          address,
          AbortSignal.timeout(1000),
        ),
      ).rejects.toThrow("SOURCE_UNAVAILABLE");
    } finally {
      get.mockRestore();
    }
  });
  it("blocks non-public IPv4/IPv6, mapped addresses, credential URLs and unsafe ports", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.2",
      "169.254.169.254",
      "100.64.0.1",
      "192.168.0.1",
      "::1",
      "::ffff:8.8.8.8",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
    ])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    for (const url of [
      "file:///etc/passwd",
      "http://user:secret@example.com",
      "http://127.1",
      "http://2130706433",
      "http://example.com:8000",
    ])
      expect(() => sourceUrl(url)).toThrow();
  });
  it("rejects private or mixed DNS answers before connecting", async () => {
    const d = deps();
    d.resolve = vi.fn(async () => [
      address,
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(fetchSource("https://example.com", d)).rejects.toThrow(
      "SOURCE_BLOCKED",
    );
    expect(d.request).not.toHaveBeenCalled();
  });
  it("uses the validated address and resolves each redirected host again", async () => {
    const d = deps();
    d.request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        location: "https://other.test/article",
        type: "",
        body: Buffer.alloc(0),
      })
      .mockResolvedValueOnce({
        status: 200,
        type: "text/html",
        body: Buffer.from("<article>Actual source text.</article>"),
      });
    const page = await fetchSource("https://example.com", d);
    expect(d.resolve).toHaveBeenCalledWith("other.test");
    expect(d.request).toHaveBeenNthCalledWith(
      1,
      expect.any(URL),
      address,
      expect.any(AbortSignal),
    );
    expect(page.url).toBe("https://other.test/article");
    const privateRedirect = deps();
    privateRedirect.request = vi.fn(async () => ({
      status: 302,
      location: "http://169.254.169.254/latest/meta-data",
      type: "",
      body: Buffer.alloc(0),
    }));
    await expect(
      fetchSource("https://example.com", privateRedirect),
    ).rejects.toThrow("SOURCE_BLOCKED");
  });
  it("bounds redirects, UTF-8 bytes and selected text without silently truncating facts", async () => {
    const d = deps();
    d.request = vi.fn(async () => ({
      status: 302,
      location: "/loop",
      type: "",
      body: Buffer.alloc(0),
    }));
    await expect(fetchSource("https://example.com", d)).rejects.toThrow();
    expect(d.request).toHaveBeenCalledTimes(4);
    const big = deps();
    big.request = vi.fn(async () => ({
      status: 200,
      type: "text/html",
      body: Buffer.alloc(SOURCE_LIMITS.bytes + 1),
    }));
    await expect(fetchSource("https://example.com", big)).rejects.toThrow();
    expect(() =>
      extractPage(
        "<article>" + "x".repeat(SOURCE_LIMITS.text + 1) + "</article>",
        new URL("https://example.com"),
      ),
    ).toThrow("SOURCE_TOO_LARGE");
  });
  it("keeps originals, removes active markup, extracts bounded same-origin sitemap/index links and hashes material text", () => {
    const html =
      '<title>A change</title><nav>Random navigation</nav><script>secret()</script><article>Confirmed release</article><a href="/one?utm_source=x">One</a><a href="https://evil.test">Cross host</a>';
    const p = extractPage(html, new URL("https://example.com/blog"));
    expect(p.original).toBe(html);
    expect(p.text).toBe("Confirmed release");
    expect(p.links).toEqual(["https://example.com/one"]);
    expect(p.contentHash).toHaveLength(64);
    expect(
      extractPage(
        html.replace("Random navigation", "Changed chrome"),
        new URL(p.url),
      ).contentHash,
    ).toBe(p.contentHash);
    expect(
      extractPage(
        "<urlset><url><loc>https://example.com/news</loc></url></urlset>",
        new URL("https://example.com/sitemap.xml"),
      ).links,
    ).toEqual(["https://example.com/news"]);
  });
  it("dispatches research when RSS is off, continues RSS after research failure and stays idle when both are off", async () => {
    const tasks = {
      research: vi.fn(async () => {}),
      rss: vi.fn(async () => {}),
      onError: vi.fn(),
    };
    await researchTick(
      { rssEnabled: false, automationEnabled: true, rssDue: true },
      tasks,
    );
    expect(tasks.research).toHaveBeenCalledTimes(1);
    expect(tasks.rss).not.toHaveBeenCalled();
    tasks.research.mockRejectedValueOnce(new Error("failure"));
    await researchTick(
      { rssEnabled: true, automationEnabled: true, rssDue: true },
      tasks,
    );
    expect(tasks.onError).toHaveBeenCalledWith("research");
    expect(tasks.rss).toHaveBeenCalledTimes(1);
    await researchTick(
      { rssEnabled: false, automationEnabled: false, rssDue: true },
      tasks,
    );
    expect(tasks.research).toHaveBeenCalledTimes(2);
  });
});
