import type { Finding } from "./contracts";

/** Same ceiling the Content Bank applies when a trend reaction is edited. */
const FIELD_LIMIT = 2000;

export type FindingEntryFields = {
  title: string;
  whatHappened: string;
  whatWasLearned: string;
  whatChanged: string;
  whyItMatters: string;
  takeaway: string;
};

function clip(value: string, limit: number): string {
  const text = value.trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** One line per source: "- Title (published 2026-10-01): https://…". */
export function sourceLine(source: Finding["sources"][number]): string {
  const published = source.publishedOn ? `published ${source.publishedOn}` : "date not reported";
  return `- ${source.title} (${published}): ${source.url}`;
}

/** Keeps whole source lines only, so a cut never leaves half a link in the entry. */
export function sourceLines(sources: Finding["sources"], limit: number): string {
  const lines: string[] = [];
  let length = 0;
  for (const source of sources) {
    const line = sourceLine(source);
    if (length + line.length + 1 > limit) break;
    lines.push(line);
    length += line.length + 1;
  }
  return lines.join("\n");
}

/**
 * Maps one research finding onto a trend-reaction Content Bank entry. The finding
 * stays the evidence: its dated sources are written into the "what happened / proof"
 * field, and the finding's own record is linked by the database column, not copied.
 */
export function findingToEntryFields(finding: Finding): FindingEntryFields {
  return {
    title: clip(finding.title, 200),
    whatHappened: sourceLines(finding.sources, FIELD_LIMIT),
    whatWasLearned: clip(finding.angle, FIELD_LIMIT),
    whatChanged: clip(finding.whatChanged, FIELD_LIMIT),
    whyItMatters: clip(finding.whyItMatters, FIELD_LIMIT),
    takeaway: clip(finding.agencyAction, FIELD_LIMIT),
  };
}
