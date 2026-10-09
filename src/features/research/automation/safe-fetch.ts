import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { createHash } from "node:crypto";

export const SOURCE_LIMITS = {
  bytes: 512_000,
  text: 40_000,
  redirects: 3,
  timeoutMs: 20_000,
  links: 10,
} as const;
const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [ip, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blocked.addSubnet(ip, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export function sourceUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 2048 ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) ||
    /(^|\.)(localhost|local|internal)$/i.test(url.hostname)
  )
    throw new Error("SOURCE_BLOCKED");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new Error("SOURCE_BLOCKED");
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url;
}
type Address = { address: string; family: number };
type PageResponse = {
  status: number;
  location?: string;
  type: string;
  body: Buffer;
};
export type FetchDependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  request: (
    url: URL,
    address: Address,
    signal: AbortSignal,
  ) => Promise<PageResponse>;
};
// Connect using the vetted address, while retaining hostname for TLS and Host.
// agent:false prevents reusing a connection resolved outside this validation.
const requestPublicTextPage = (
  url: URL,
  address: Address,
  signal: AbortSignal,
  maxBytes: number,
): ReturnType<FetchDependencies["request"]> =>
  new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        agent: false,
        signal,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/xml,text/plain",
          "Accept-Encoding": "identity",
          "User-Agent": "Virel-Research/1.0",
        },
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all)
            callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.destroy();
          resolve({
            status,
            location: res.headers.location,
            type: "",
            body: Buffer.alloc(0),
          });
          return;
        }
        const type = res.headers["content-type"] ?? "";
        if (
          status !== 200 ||
          !/^(text\/(html|plain|xml)|application\/(xhtml\+xml|xml|rss\+xml|atom\+xml))(;|$)/i.test(
            type,
          ) ||
          (res.headers["content-encoding"] &&
            res.headers["content-encoding"] !== "identity") ||
          (/charset=/i.test(type) &&
            !/charset\s*=\s*["']?(utf-8|utf8|us-ascii)/i.test(type)) ||
          Number(res.headers["content-length"] ?? 0) > maxBytes
        ) {
          res.destroy();
          reject(new Error("SOURCE_UNAVAILABLE"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new Error("SOURCE_TOO_LARGE"));
          } else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({ status, type, body: Buffer.concat(chunks) }),
        );
        res.on("error", () => reject(new Error("SOURCE_UNAVAILABLE")));
      },
    );
    req.on("error", () => reject(new Error("SOURCE_UNAVAILABLE")));
  });
export const requestSourcePage: FetchDependencies["request"] = (
  url,
  address,
  signal,
) => requestPublicTextPage(url, address, signal, SOURCE_LIMITS.bytes);
const defaults: FetchDependencies = {
  resolve: (host) => lookup(host, { all: true, verbatim: true }),
  request: requestSourcePage,
};
export type SourcePage = {
  url: string;
  title: string;
  original: string;
  text: string;
  contentHash: string;
  fetchedAt: string;
  links: string[];
};
function plain(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|apos);/g,
      (entity) =>
        ({
          "&nbsp;": " ",
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
        })[entity]!,
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function extractPage(original: string, url: URL): SourcePage {
  const cleaned = original
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    );
  const main =
    cleaned.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? cleaned;
  const text = plain(main);
  if (text.length > SOURCE_LIMITS.text) throw new Error("SOURCE_TOO_LARGE");
  if (!text) throw new Error("SOURCE_UNAVAILABLE");
  const title = plain(
    original.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.hostname,
  ).slice(0, 500);
  const links: string[] = [];
  for (const match of original.matchAll(
    /(?:href\s*=\s*["']([^"']+)["']|<loc>\s*([^<]+)\s*<\/loc>)/gi,
  )) {
    try {
      const next = sourceUrl(
        new URL((match[1] ?? match[2]).replace(/&amp;/g, "&"), url).href,
      );
      if (
        next.origin === url.origin &&
        next.href !== url.href &&
        !/\.(png|jpg|pdf|zip|css|js)(\?|$)/i.test(next.pathname) &&
        !links.includes(next.href)
      )
        links.push(next.href);
    } catch {
      /* Invalid links are not fetched. */
    }
    if (links.length === SOURCE_LIMITS.links) break;
  }
  return {
    url: url.href,
    title,
    original,
    text,
    contentHash: createHash("sha256")
      .update(title + "\n" + text)
      .digest("hex"),
    fetchedAt: new Date().toISOString(),
    links,
  };
}
export async function fetchPublicText(
  value: string,
  deps?: FetchDependencies,
  timeoutMs: number = SOURCE_LIMITS.timeoutMs,
  maxBytes: number = SOURCE_LIMITS.bytes,
): Promise<{ url: string; original: string }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2_000_000)
    throw new Error("SOURCE_TOO_LARGE");
  const network = deps ?? {
    ...defaults,
    request: (url: URL, address: Address, signal: AbortSignal) =>
      requestPublicTextPage(url, address, signal, maxBytes),
  };
  const signal = AbortSignal.timeout(
    Math.min(timeoutMs, SOURCE_LIMITS.timeoutMs),
  );
  let url = sourceUrl(value);
  for (let redirects = 0; redirects <= SOURCE_LIMITS.redirects; redirects++) {
    if (signal.aborted) throw new Error("SOURCE_UNAVAILABLE");
    // DNS is also subject to the total deadline; aborting must not await it forever.
    const addresses = await Promise.race([
      network.resolve(url.hostname.replace(/^\[|\]$/g, "")),
      new Promise<never>((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new Error("SOURCE_UNAVAILABLE")),
          { once: true },
        ),
      ),
    ]);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error("SOURCE_BLOCKED");
    if (signal.aborted) throw new Error("SOURCE_UNAVAILABLE");
    const response = await network.request(url, addresses[0], signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location || redirects === SOURCE_LIMITS.redirects)
        throw new Error("SOURCE_UNAVAILABLE");
      url = sourceUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status !== 200 || response.body.length > maxBytes)
      throw new Error("SOURCE_UNAVAILABLE");
    return {
      original: new TextDecoder("utf-8", { fatal: true }).decode(response.body),
      url: url.href,
    };
  }
  throw new Error("SOURCE_UNAVAILABLE");
}
export async function fetchSource(
  value: string,
  deps: FetchDependencies = defaults,
): Promise<SourcePage> {
  const page = await fetchPublicText(value, deps);
  return extractPage(page.original, new URL(page.url));
}
