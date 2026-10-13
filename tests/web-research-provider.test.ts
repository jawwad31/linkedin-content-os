import { afterEach, describe, expect, it, vi } from "vitest";
import { mapWebResponse } from "@/features/research/web-research/provider";
import { RESEARCH_BUDGET } from "@/features/research/web-research/contracts";
import { researchFinding, webResponse } from "./fixtures/web-research";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const now = new Date("2026-10-08T08:00:00Z");
describe("P07 bounded search and evidence mapping", () => {
  it("uses imported source provenance and preserves its actual fetched date", () => {
    const source = researchFinding.sources[0];
    const imported = [
      {
        id: "85284621-181c-41ac-bf9b-a489feef4c63",
        url: source.url,
        title: source.title,
        text: "Actual imported primary source text.",
        contentHash: "abc",
        fetchedAt: "2026-10-07T08:00:00Z",
      },
    ];
    const result = mapWebResponse(
      webResponse([researchFinding], []),
      [],
      now,
      imported,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.candidates[0].fetchedAt).toBe(imported[0].fetchedAt);
  });
  it("retains every consulted candidate, uses date evidence, and never substitutes fetch dates", () => {
    const source = { ...researchFinding.sources[0], dateEvidence: null };
    const response = webResponse(
      [{ ...researchFinding, sources: [source] }],
      [
        { url: source.url, title: source.title },
        { url: "https://example.org/not-selected", title: "Other candidate" },
      ],
    );
    const result = mapWebResponse(response, [], now);
    expect(result.outcome).toBe("success");
    expect(result.candidates).toHaveLength(2);
    expect(result.findings[0].sources[0]).toMatchObject({
      publishedOn: null,
      effectiveOn: null,
    });
    expect(result.candidates[0].fetchedAt).toBe(now.toISOString());
  });
  it("rejects invented citations but keeps findings with a bad date or no primary source, labelled honestly", () => {
    const invented = {
      ...researchFinding,
      sources: [
        {
          ...researchFinding.sources[0],
          url: "https://invented.example/release",
        },
      ],
    };
    const badDate = {
      ...researchFinding,
      sources: [{ ...researchFinding.sources[0], publishedOn: "2026-02-30" }],
    };
    const secondary = {
      ...researchFinding,
      sources: [{ ...researchFinding.sources[0], sourceKind: "secondary" }],
    };
    const result = mapWebResponse(webResponse([invented]), [], now);
    expect(result.outcome).toBe("partial");
    expect(result.findings).toHaveLength(0);
    expect(result.coverageGaps).toEqual([
      "A finding was omitted because a source link was absent from the search evidence.",
    ]);
    // The bad date becomes unknown and the secondary-only "confirmed change" is kept as a
    // trend, so the user can decide about both (checked separately: the same key would group).
    const dated = mapWebResponse(webResponse([badDate]), [], now);
    expect(dated.findings).toHaveLength(1);
    expect(dated.findings[0].sources[0]).toMatchObject({ publishedOn: null });
    const trend = mapWebResponse(webResponse([secondary]), [], now);
    expect(trend.findings).toHaveLength(1);
    expect(trend.findings[0]).toMatchObject({ category: "trend_analysis" });
    expect(trend.candidates).toHaveLength(1);
  });
  it("repairs small slips in a finding instead of losing it, without inventing anything", () => {
    const slipped = {
      ...researchFinding,
      previousFindingId: "",
      extraField: "ignored",
      title: "T".repeat(400),
      sources: [
        {
          ...researchFinding.sources[0],
          publishedOn: "October 2026",
          announcedOn: "2026-10",
          effectiveOn: "2026-10-08",
          unknownKey: true,
        },
      ],
    };
    const result = mapWebResponse(webResponse([slipped]), [], now);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toHaveLength(300);
    expect(result.findings[0].sources[0]).toMatchObject({
      publishedOn: null,
      announcedOn: null,
      effectiveOn: "2026-10-08",
    });
    // Required content is not repaired: a finding with no whatChanged is still omitted.
    const empty = { ...researchFinding, whatChanged: "" };
    expect(mapWebResponse(webResponse([empty]), [], now).findings).toHaveLength(0);
  });
  it("groups the same development and distinguishes repeated coverage from a meaningful follow-up", () => {
    const first = mapWebResponse(webResponse(), [], now).findings[0];
    const previous = [{ ...first, id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" }];
    expect(
      mapWebResponse(webResponse(), previous, now).findings[0].novelty,
    ).toBe("repeated");
    const follow = {
      ...researchFinding,
      whatChanged: "The same platform expanded that setting to all accounts.",
      novelty: "follow_up",
      sources: [
        {
          ...researchFinding.sources[0],
          url: "https://example.com/expanded",
          announcedOn: "2026-10-08",
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([follow], follow.sources), previous, now)
        .findings[0].novelty,
    ).toBe("follow_up");
    const grouped = mapWebResponse(
      webResponse(
        [researchFinding, follow],
        [...researchFinding.sources, ...follow.sources],
      ),
      [],
      now,
    );
    expect(grouped.findings).toHaveLength(1);
    expect(grouped.findings[0].sources).toHaveLength(2);
    expect(grouped.findings[0].whatChanged).toContain(follow.whatChanged);
  });
  it("deduplicates an RSS article also found by web search while retaining its citation and collection time", () => {
    const source = researchFinding.sources[0];
    const feed = {
      id: "85284621-181c-41ac-bf9b-a489feef4c63",
      url: `${source.url}?utm_source=rss#article`,
      title: source.title,
      text: researchFinding.whatChanged,
      contentHash: "feed-url-hash",
      fetchedAt: "2026-10-07T08:00:00Z",
      kind: "rss" as const,
      feedUrl: "https://example.com/feed.xml",
      feedPublishedAt: "2026-10-06T00:00:00Z",
    };
    const rssFinding = {
      ...researchFinding,
      sources: [{ ...source, url: feed.url }],
    };
    const result = mapWebResponse(
      webResponse([rssFinding, researchFinding]),
      [],
      now,
      [feed],
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].sources).toHaveLength(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      url: source.url,
      fetchedAt: feed.fetchedAt,
    });
  });
  it("groups different RSS/web reports of one event, labels a later report as repeated, and retains a distinct development", () => {
    const coverage = {
      ...researchFinding.sources[0],
      url: "https://publisher.example/measurement-coverage",
      sourceKind: "secondary" as const,
    };
    const feed = {
      id: "85284621-181c-41ac-bf9b-a489feef4c63",
      url: coverage.url,
      title: coverage.title,
      text: researchFinding.whatChanged,
      contentHash: "coverage-hash",
      fetchedAt: "2026-10-07T08:00:00Z",
      kind: "rss" as const,
      feedUrl: "https://publisher.example/feed.xml",
      feedPublishedAt: null,
    };
    const report = {
      ...researchFinding,
      category: "trend_analysis",
      sources: [coverage],
    };
    const grouped = mapWebResponse(
      webResponse([report, researchFinding]),
      [],
      now,
      [feed],
    );
    expect(grouped.findings).toHaveLength(1);
    expect(grouped.findings[0].sources).toHaveLength(2);
    const previous = [
      { ...grouped.findings[0], id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" },
    ];
    const other = {
      ...researchFinding,
      developmentKey: "different-account-security-release",
      whatChanged:
        "The platform introduced a separate account security control.",
    };
    const later = mapWebResponse(
      webResponse([researchFinding, other]),
      previous,
      now,
    );
    expect(later.findings).toHaveLength(2);
    expect(later.findings[0]).toMatchObject({
      novelty: "repeated",
      previousFindingId: previous[0].id,
    });
    expect(later.findings[1]).toMatchObject({
      novelty: "new",
      previousFindingId: null,
    });
  });
  it("keeps a real update at the same article URL but rejects a follow-up supported only by another tracking link", () => {
    const first = mapWebResponse(webResponse(), [], now).findings[0];
    const previous = [{ ...first, id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" }];
    const follow = {
      ...researchFinding,
      whatChanged: "The platform expanded the setting to every account.",
      novelty: "follow_up",
      sources: [
        {
          ...researchFinding.sources[0],
          announcedOn: "2026-10-08",
          dateEvidence:
            "Updated October 8: the setting is available to every account.",
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([follow]), previous, now).findings[0],
    ).toMatchObject({
      novelty: "follow_up",
      previousFindingId: previous[0].id,
    });
    const trackingOnly = {
      ...follow,
      sources: [
        {
          ...researchFinding.sources[0],
          url: `${researchFinding.sources[0].url}?utm_source=other#updated`,
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([trackingOnly]), previous, now).findings[0],
    ).toMatchObject({
      novelty: "repeated",
      previousFindingId: previous[0].id,
    });
  });
  it("keeps distinct non-English developments separate instead of collapsing their keys", () => {
    const measurement = {
      ...researchFinding,
      developmentKey: "تحديث القياس",
      whatChanged: "تم تحديث خيارات القياس لجميع الحسابات.",
    };
    const security = {
      ...researchFinding,
      developmentKey: "تحديث الأمان",
      whatChanged: "تم طرح خيارات أمان جديدة لجميع الحسابات.",
    };
    const result = mapWebResponse(
      webResponse([measurement, security]),
      [],
      now,
    );
    expect(result.findings).toHaveLength(2);
    expect(
      new Set(result.findings.map((finding) => finding.fingerprint)).size,
    ).toBe(2);
  });
  it("recognizes changed non-English facts as a follow-up to their own development", () => {
    const measurement = {
      ...researchFinding,
      developmentKey: "تحديث القياس",
      whatChanged: "تم تحديث خيارات القياس لبعض الحسابات فقط.",
    };
    const first = mapWebResponse(webResponse([measurement]), [], now)
      .findings[0];
    const previous = [{ ...first, id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" }];
    const expanded = {
      ...measurement,
      whatChanged: "تم توسيع خيارات القياس لتشمل جميع الحسابات.",
      novelty: "follow_up",
      sources: [
        {
          ...measurement.sources[0],
          announcedOn: "2026-10-08",
          dateEvidence: "Updated October 8: available to every account.",
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([expanded]), previous, now).findings[0],
    ).toMatchObject({
      novelty: "follow_up",
      previousFindingId: previous[0].id,
    });
  });
  it("reports no evidence honestly, retains candidates after invalid synthesis, and identifies partial tool failure/budget stops", () => {
    expect(mapWebResponse(webResponse([], []), [], now).outcome).toBe("empty");
    const invalid = webResponse();
    invalid.output[1].content![0].text = "invalid";
    expect(mapWebResponse(invalid, [], now)).toMatchObject({
      outcome: "partial",
      errorCode: "INVALID_RESPONSE",
    });
    const failed = webResponse();
    failed.output[0].status = "failed";
    expect(mapWebResponse(failed, [], now).outcome).toBe("partial");
    const budget = webResponse();
    budget.output.push(
      ...Array.from({ length: RESEARCH_BUDGET.maxToolCalls - 1 }, () => budget.output[0]),
    );
    expect(mapWebResponse(budget, [], now).coverageGaps.join(" ")).toContain(
      "budget",
    );
    expect(
      mapWebResponse({ status: "completed", output: [] }, [], now).outcome,
    ).toBe("failed");
  });
  it("accepts Router citation metadata with reported searches, but never a generated URL alone", () => {
    const raw = webResponse();
    const message = raw.output[1];
    const citation = {
      type: "url_citation",
      url: researchFinding.sources[0].url,
      title: "Release",
    };
    const response = {
      status: "completed",
      output: [
        {
          ...message,
          content: [{ ...message.content![0], annotations: [citation] }],
        },
      ],
      usage: { server_tool_use: { web_search_requests: 2 } },
    };
    expect(mapWebResponse(response, [], now)).toMatchObject({
      outcome: "success",
      toolCalls: 2,
    });
    expect(
      mapWebResponse(
        { ...response, output: [message], usage: undefined },
        [],
        now,
      ),
    ).toMatchObject({
      outcome: "failed",
      errorCode: "NO_SEARCH_EVIDENCE",
      findings: [],
    });
    expect(
      mapWebResponse({ ...response, usage: undefined }, [], now).outcome,
    ).toBe("partial");
    expect(
      mapWebResponse(
        {
          ...response,
          usage: { server_tool_use: { web_search_requests: RESEARCH_BUDGET.maxToolCalls } },
        },
        [],
        now,
      ).outcome,
    ).toBe("partial");
  });
  describe("finding the briefing in the model's text", () => {
    const answer = () => {
      const raw = webResponse();
      const text = raw.output[1].content![0].text!;
      return { raw, text };
    };
    it.each([
      ["a code fence", (t: string) => ["```json\n" + t + "\n```"]],
      ["a remark before the answer", (t: string) => ["Here is the briefing:\n" + t]],
      ["a remark and a fence", (t: string) => ["Done searching.\n```json\n" + t + "\n```\nHope this helps."]],
      ["a remark in an earlier message", (t: string) => ["I will search now.", t]],
    ])("still reads the briefing when it comes with %s", (_name, shape) => {
      const { raw, text } = answer();
      const parts = shape(text);
      raw.output[1].content = parts.map((part) => ({
        type: "output_text",
        text: part,
        annotations: [],
      }));
      const result = mapWebResponse(raw, [], now);
      expect(result.outcome).toBe("success");
      expect(result.findings).toHaveLength(1);
    });
    it("logs only the shape of the problem, never the model's text, when nothing can be read", () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { raw } = answer();
      raw.output[1].content![0].text = "SECRET-PROFILE-VALUE and no briefing here";
      expect(mapWebResponse(raw, [], now)).toMatchObject({
        outcome: "partial",
        errorCode: "INVALID_RESPONSE",
      });
      const line = String(logged.mock.calls[0][0]);
      expect(line).toContain("no JSON object found");
      expect(line).not.toContain("SECRET-PROFILE-VALUE");
      // An object that is the wrong shape reports which fields, not their values.
      raw.output[1].content![0].text = JSON.stringify({ summary: 5, secret: "SECRET-X" });
      mapWebResponse(raw, [], now);
      const shapeLine = String(logged.mock.calls[1][0]);
      expect(shapeLine).toContain("summary");
      expect(shapeLine).not.toContain("SECRET-X");
      logged.mockRestore();
    });
  });
  it("logs which fields made a finding fail, never their values", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bad = { ...researchFinding, consequence: "SECRET-NOT-A-NUMBER", extraKey: "SECRET-X" };
    const result = mapWebResponse(webResponse([bad]), [], now);
    expect(result.findings).toHaveLength(0);
    const line = String(logged.mock.calls[0][0]);
    expect(line).toContain("consequence");
    expect(line).not.toContain("SECRET");
    logged.mockRestore();
  });
  it("retains Router candidates after failed search/synthesis and incomplete generation", () => {
    const raw = webResponse();
    raw.output[0].type = "openrouter:web_search";
    raw.output[0].status = "failed";
    expect(mapWebResponse(raw, [], now)).toMatchObject({
      outcome: "partial",
      toolCalls: 1,
    });
    raw.output[1].content![0].text = "invalid JSON";
    expect(mapWebResponse(raw, [], now)).toMatchObject({
      outcome: "partial",
      errorCode: "INVALID_RESPONSE",
    });
    expect(mapWebResponse(raw, [], now).candidates).toHaveLength(1);
    const incomplete = webResponse();
    incomplete.output[0].type = "openrouter:web_search";
    incomplete.status = "incomplete";
    expect(mapWebResponse(incomplete, [], now).outcome).toBe("partial");
  });
});
