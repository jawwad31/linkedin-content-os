import { XMLParser, XMLValidator } from "fast-xml-parser";

import { MAX_SUMMARY_LENGTH } from "./constants";

export type ParsedFeedEntry = {
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
};

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in (value as XmlNode)) {
    return String((value as XmlNode)["#text"] ?? "").trim();
  }
  return "";
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSummary(value: string): string {
  if (value.length <= MAX_SUMMARY_LENGTH) return value;
  return `${value.slice(0, MAX_SUMMARY_LENGTH).trimEnd()}…`;
}

function extractSummary(node: XmlNode): string | null {
  const raw =
    node.description ?? node.summary ?? node["content:encoded"] ?? node.content;

  const text = textOf(raw);
  if (!text) return null;

  return truncateSummary(stripHtml(text));
}

function extractPublishedAt(node: XmlNode): string | null {
  const raw = node.pubDate ?? node.published ?? node.updated ?? node["dc:date"];
  const text = textOf(raw);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function extractAtomLink(node: XmlNode): string {
  const links = asArray(node.link as XmlNode | XmlNode[] | string | undefined);
  if (links.length === 0) return "";

  const alternate = links.find(
    (link) =>
      typeof link === "object" &&
      link !== null &&
      (link as XmlNode)["@_rel"] === "alternate",
  );
  const withoutRel = links.find(
    (link) =>
      typeof link === "object" &&
      link !== null &&
      !("@_rel" in (link as XmlNode)),
  );
  const chosen = alternate ?? withoutRel ?? links[0];

  if (typeof chosen === "string") return chosen;
  return String((chosen as XmlNode)?.["@_href"] ?? "");
}

/**
 * Parses RSS 2.0 <item> and Atom <entry> feeds only (no RDF/RSS 1.0
 * support). Throws on genuinely malformed XML; the caller (collectSource)
 * treats that as a safe per-source fetch failure, not a crash.
 */
export function parseFeedEntries(xml: string): ParsedFeedEntry[] {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error("Feed content is not valid XML.");
  }

  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: XmlNode | XmlNode[] } };
    feed?: { entry?: XmlNode | XmlNode[] };
  };
  if (
    !(parsed.rss && Object.hasOwn(parsed.rss, "channel")) &&
    !Object.hasOwn(parsed, "feed")
  )
    throw new Error("Not an RSS or Atom feed.");

  const rssItems = asArray(parsed.rss?.channel?.item);
  if (rssItems.length > 0) {
    return rssItems.map((item) => ({
      title: textOf(item.title),
      url: textOf(item.link),
      summary: extractSummary(item),
      publishedAt: extractPublishedAt(item),
    }));
  }

  const atomEntries = asArray(parsed.feed?.entry);
  if (atomEntries.length > 0) {
    return atomEntries.map((entry) => ({
      title: textOf(entry.title),
      url: extractAtomLink(entry),
      summary: extractSummary(entry),
      publishedAt: extractPublishedAt(entry),
    }));
  }

  return [];
}
