import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dateIsWrittenIn,
  quoteIsOnPage,
  verifiedDates,
  windowStatus,
} from "@/features/research/web-research/pipeline/verify";
import { strictJsonSchema, synthesisSchema } from "@/features/research/web-research/pipeline/schemas";
import { researchBudget, RESEARCH_BUDGET } from "@/features/research/web-research/contracts";
import { validDateOrNull } from "@/features/research/web-research/provider";

const PAGE =
  "Google Business Profile is removing Q&A. Published October 1, 2026. Starting November 3, 2026, customers can no longer submit new questions on business profiles. It’s the first step—more to follow.";
const now = new Date("2026-10-13T09:00:00Z");

describe("a quote must be on the page", () => {
  it("accepts a copied passage despite case, spacing and curly quotes", () => {
    expect(quoteIsOnPage("customers can no longer   submit NEW questions", PAGE)).toBe(true);
    expect(quoteIsOnPage("It's the first step-more to follow", PAGE)).toBe(true);
  });
  it("accepts two copied passages joined by an ellipsis, and rejects one that is not copied", () => {
    expect(quoteIsOnPage("Google Business Profile is removing Q&A ... customers can no longer submit", PAGE)).toBe(true);
    expect(quoteIsOnPage("Google Business Profile is removing Q&A ... and the feature returns next year", PAGE)).toBe(false);
  });
  it("rejects a paraphrase, an invented claim and a quote too short to mean anything", () => {
    expect(quoteIsOnPage("Google will shut down Q&A for all businesses next month", PAGE)).toBe(false);
    expect(quoteIsOnPage("removing Q&A", PAGE)).toBe(false);
    expect(quoteIsOnPage("", PAGE)).toBe(false);
  });
});

describe("a date must be written in its evidence", () => {
  it("recognises the usual ways of writing a date and nothing else", () => {
    for (const writing of ["November 3, 2026", "Nov 3, 2026", "3 November 2026", "3rd November 2026", "2026-11-03", "11/3/2026", "11/03/2026", "03.11.2026"])
      expect(dateIsWrittenIn("2026-11-03", `Rolls out on ${writing}.`), writing).toBe(true);
    expect(dateIsWrittenIn("2026-11-03", "Rolls out on November 30, 2026.")).toBe(false);
    expect(dateIsWrittenIn("2026-11-03", "Rolls out on 111/3/2026.")).toBe(false);
    expect(dateIsWrittenIn("2026-11-03", null)).toBe(false);
    expect(dateIsWrittenIn(null, "November 3, 2026")).toBe(false);
  });
});

describe("only dates the page supports are kept", () => {
  const raw = {
    publishedOn: "2026-10-01",
    announcedOn: "2026-10-01",
    effectiveOn: "2026-11-03",
    dateEvidence: "Published October 1, 2026. Starting November 3, 2026",
  };
  it("keeps announcement and effective dates apart when the page writes both", () => {
    expect(verifiedDates(raw, PAGE, validDateOrNull, now)).toEqual(raw);
  });
  it("makes a date unknown when its evidence is not on the page, or does not write that date", () => {
    expect(verifiedDates({ ...raw, dateEvidence: "Published September 9, 2026" }, PAGE, validDateOrNull, now)).toEqual({
      publishedOn: null, announcedOn: null, effectiveOn: null, dateEvidence: null,
    });
    // The quote is on the page but only writes two of the three dates.
    expect(verifiedDates({ ...raw, effectiveOn: "2026-12-25" }, PAGE, validDateOrNull, now)).toMatchObject({
      publishedOn: "2026-10-01", effectiveOn: null,
    });
    expect(verifiedDates({ ...raw, dateEvidence: null }, PAGE, validDateOrNull, now).publishedOn).toBeNull();
  });
  it("never accepts a publication date in the future, but an effective date may be", () => {
    const future = "Published December 1, 2027. Starting December 5, 2027";
    const page = `${PAGE} ${future}`;
    const kept = verifiedDates(
      { publishedOn: "2027-12-01", announcedOn: null, effectiveOn: "2027-12-05", dateEvidence: future },
      page, validDateOrNull, now,
    );
    expect(kept).toMatchObject({ publishedOn: null, effectiveOn: "2027-12-05" });
  });
  it("tells a claim before the window from one inside it, or unknown", () => {
    expect(windowStatus({ publishedOn: "2026-09-01", announcedOn: null, effectiveOn: null }, "2026-10-06")).toBe("before");
    expect(windowStatus({ publishedOn: "2026-09-01", announcedOn: null, effectiveOn: "2026-11-03" }, "2026-10-06")).toBe("inside");
    expect(windowStatus({ publishedOn: null, announcedOn: null, effectiveOn: null }, "2026-10-06")).toBe("unknown");
  });
});

describe("structured-output schema and budget", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("builds a plain schema: every field required, nothing extra, no length or format keywords", () => {
    const schema = strictJsonSchema(synthesisSchema);
    const text = JSON.stringify(schema);
    for (const keyword of ["minLength", "maxLength", "minimum", "maximum", "\"format\"", "pattern", "$schema"])
      expect(text, keyword).not.toContain(keyword);
    const finding = (schema as { properties: { findings: { items: { additionalProperties: boolean; required: string[]; properties: { evidenceIds: { items: { type: string } } } } } } }).properties.findings.items;
    expect(finding.additionalProperties).toBe(false);
    expect(finding.required).toEqual(Object.keys(finding.properties));
    expect(finding.properties.evidenceIds.items.type).toBe("string");
  });
  it("uses the documented defaults and clamps any setting that is out of range", () => {
    expect(researchBudget()).toMatchObject({ maxLanes: 4, searchesPerLane: 2, maxToolCalls: 8, maxPages: 14, totalSeconds: 240 });
    vi.stubEnv("RESEARCH_MAX_LANES", "2");
    vi.stubEnv("RESEARCH_SEARCHES_PER_LANE", "3");
    vi.stubEnv("RESEARCH_MAX_PAGES", "999");
    vi.stubEnv("RESEARCH_TOTAL_SECONDS", "90");
    expect(researchBudget()).toMatchObject({ maxLanes: 2, searchesPerLane: 3, maxToolCalls: 6, maxPages: RESEARCH_BUDGET.maxPages, totalSeconds: 90 });
  });
});
