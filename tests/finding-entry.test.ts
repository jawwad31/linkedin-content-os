import { describe, expect, it } from "vitest";

import type { Finding } from "@/features/research/web-research/contracts";
import {
  findingToEntryFields,
  sourceLine,
  sourceLines,
} from "@/features/research/web-research/finding-entry";
import { getContentBankPostEligibility } from "@/features/content-bank/post-eligibility";
import type { ContentBankEntry } from "@/features/content-bank/schemas";

const source = (n: number, publishedOn: string | null = "2026-10-01") => ({
  url: `https://example.com/story-${n}`,
  title: `Story ${n}`,
  publishedOn,
  announcedOn: null,
  effectiveOn: null,
  dateEvidence: null,
  sourceKind: "primary" as const,
});

const finding: Finding = {
  developmentKey: "meta-change",
  title: "Meta changes how lead ads are billed",
  whatChanged: "Meta now bills lead ads on form submissions.",
  whyItMatters: "Local clients will see cost per lead move.",
  agencyAction: "Re-baseline lead cost targets before the change.",
  angle: "Cost per lead is about to look different.",
  category: "confirmed_change",
  confidence: "high",
  consequence: 4,
  relevance: 5,
  novelty: "new",
  previousFindingId: null,
  sources: [source(1), source(2, null)],
};

describe("findingToEntryFields", () => {
  it("maps a finding onto a trend reaction entry", () => {
    const fields = findingToEntryFields(finding);
    expect(fields.title).toBe("Meta changes how lead ads are billed");
    expect(fields.whatWasLearned).toBe("Cost per lead is about to look different.");
    expect(fields.whatChanged).toBe("Meta now bills lead ads on form submissions.");
    expect(fields.whyItMatters).toBe("Local clients will see cost per lead move.");
    expect(fields.takeaway).toBe("Re-baseline lead cost targets before the change.");
  });

  it("keeps each source with its date, and says when a date was not reported", () => {
    const proof = findingToEntryFields(finding).whatHappened.split("\n");
    expect(proof).toEqual([
      "- Story 1 (published 2026-10-01): https://example.com/story-1",
      "- Story 2 (date not reported): https://example.com/story-2",
    ]);
  });

  it("cuts the title and the long fields to what the Content Bank accepts", () => {
    const fields = findingToEntryFields({
      ...finding,
      title: "T".repeat(300),
      whatChanged: "W".repeat(5000),
    });
    expect(fields.title.length).toBeLessThanOrEqual(200);
    expect(fields.whatChanged.length).toBeLessThanOrEqual(2000);
    expect(fields.whatChanged.endsWith("…")).toBe(true);
  });

  it("drops whole source lines, never half a link", () => {
    const many = Array.from({ length: 80 }, (_, i) => source(i));
    const text = sourceLines(many, 2000);
    expect(text.length).toBeLessThanOrEqual(2000);
    for (const line of text.split("\n")) expect(line).toBe(sourceLine(many[Number(/story-(\d+)/.exec(line)![1])]));
  });
});

describe("trend reactions saved from a finding in the Content Bank", () => {
  const entry = (extra: Partial<ContentBankEntry>): ContentBankEntry =>
    ({
      id: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      sourceType: "founder_experience",
      entryType: "trend_reaction",
      sourceTrendCardId: null,
      sourceResearchFindingId: null,
      readiness: "ready",
      allowReuse: true,
      usageStatus: "unused",
      ...extra,
    }) as ContentBankEntry;

  it("can be used for a post or the calendar when it has a finding", () => {
    const withFinding = entry({ sourceResearchFindingId: "33333333-3333-4333-8333-333333333333" });
    expect(getContentBankPostEligibility(withFinding).eligible).toBe(true);
    expect(getContentBankPostEligibility(withFinding, "calendar").eligible).toBe(true);
  });

  it("still needs some research source", () => {
    const bare = getContentBankPostEligibility(entry({}));
    expect(bare.eligible).toBe(false);
    expect(bare.message).toMatch(/no longer has its research source/);
  });

  it("keeps the card-linked reaction working", () => {
    expect(
      getContentBankPostEligibility(entry({ sourceTrendCardId: "44444444-4444-4444-8444-444444444444" })).eligible,
    ).toBe(true);
  });
});
