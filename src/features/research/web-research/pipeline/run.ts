import "server-only";

import { getLlmConfig } from "@/lib/llm/config";
import { writeLlmLog } from "@/lib/llm/log";
import {
  researchBudget,
  RESEARCH_BUDGET,
  type Candidate,
  type ResearchResult,
} from "../contracts";
import {
  baseResult,
  finishBriefing,
  normalizeEvidenceUrl,
  readEnvelope,
  validDateOrNull,
  type SearchInput,
} from "../provider";
import { callSearch, callStructured, type ModelConfig, type RunLimits } from "./llm";
import {
  EXTRACTION_INSTRUCTIONS,
  PLAN_INSTRUCTIONS,
  SEARCH_INSTRUCTIONS,
  SYNTHESIS_INSTRUCTIONS,
} from "./instructions";
import { mapLimited, readSourcePage, type PageRead } from "./reader";
import { extractionSchema, planSchema, synthesisSchema } from "./schemas";
import { quoteIsOnPage, verifiedDates, windowStatus } from "./verify";

export type PipelineInput = SearchInput & {
  /** Called before each stage; a scheduled run renews its lease here and throws if it was lost. */
  beforeStage?: () => Promise<void>;
};

type Origin = "web" | "rss" | "import";
type Lane = { name: string; focus: string; queries: string[] };
type ReadPage = Extract<PageRead, { ok: true }> & { origins: Set<Origin> };
type Evidence = {
  id: string;
  url: string;
  title: string;
  claim: string;
  excerpt: string;
  publishedOn: string | null;
  announcedOn: string | null;
  effectiveOn: string | null;
  dateEvidence: string | null;
  sourceKind: "primary" | "secondary" | "unknown";
  previousState: string | null;
  audience: string | null;
  limitations: string | null;
};

const FAIL_FAST = new Set([
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_CREDITS",
  "PROVIDER_MODEL_NOT_FOUND",
  "PROVIDER_BAD_REQUEST",
  "PROVIDER_RATE_LIMITED",
]);
const MAX_EVIDENCE = 40;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};
const clean = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const validDay = (value: string | null | undefined) => validDateOrNull(value ?? null);

class LeaseLost extends Error {}

/**
 * The web research run. The saved prompt is split into topic lanes, each lane is searched, the
 * promising pages are opened and read in full, claims are extracted from the page text and checked
 * against it, and only then does a tool-free step write the briefing from that retained evidence.
 * It never throws away what it has collected: a step that fails or runs out of time leaves a
 * plain coverage note and the run carries on with what it has.
 */
export async function researchWeb(input: PipelineInput): Promise<ResearchResult> {
  const config = getLlmConfig("webResearch");
  if (!config)
    return {
      ...baseResult("NOT_CONFIGURED"),
      outcome: "not_configured",
      coverageGaps: [
        "Web research is not configured. An administrator must configure its provider before running it.",
      ],
    };
  const budget = researchBudget();
  const deadline = Date.now() + budget.totalSeconds * 1000;
  const limits: RunLimits = {
    config: config as ModelConfig,
    budget,
    remainingMs: () => deadline - Date.now(),
    usage: { input: 0, output: 0, modelCalls: 0, repairs: 0 },
  };
  const contextBytes = new TextEncoder().encode(
    JSON.stringify({
      savedPrompt: input.settings.prompt,
      profile: input.settings.useProfileContext ? input.profile : null,
      sources: input.sources ?? [],
      previous: input.previous.map((p) => ({ k: p.developmentKey, w: p.whatChanged })),
    }),
  ).byteLength;
  if (contextBytes > RESEARCH_BUDGET.maxInputBytes)
    return {
      ...baseResult("INPUT_TOO_LARGE"),
      coverageGaps: [
        "The research context exceeds this run's input budget. Refine the prompt or turn off optional profile context and retry. No content was truncated.",
      ],
    };

  const now = new Date();
  const gaps: string[] = [];
  const consulted = new Map<string, Candidate>();
  let result: ResearchResult;
  try {
    result = await runStages(input, limits, now, gaps, consulted);
  } catch (error) {
    if (error instanceof LeaseLost) throw error;
    // Anything unexpected still keeps the sources collected so far.
    console.error(
      `[web-research] run stopped unexpectedly: ${error instanceof Error ? error.name : "unknown"}`,
    );
    result = {
      ...baseResult("PROVIDER_ERROR"),
      outcome: consulted.size ? "partial" : "failed",
      candidates: [...consulted.values()],
      coverageGaps: [
        ...new Set([
          ...gaps,
          "The research run stopped unexpectedly. The sources collected so far are shown; retry to continue.",
        ]),
      ],
    };
  }
  result.tokenInput = limits.usage.input || null;
  result.tokenOutput = limits.usage.output || null;
  try {
    await writeLlmLog({
      clientId: input.clientId,
      userId: input.userId,
      provider: config.provider,
      model: config.model,
      feature: "web_research",
      status: result.outcome === "failed" ? "error" : "success",
      tokenInputCount: result.tokenInput,
      tokenOutputCount: result.tokenOutput,
      errorType: result.errorCode,
    });
  } catch {
    console.error("[web-research] Could not write provider metadata.");
  }
  return result;
}

async function runStages(
  input: PipelineInput,
  limits: RunLimits,
  now: Date,
  gaps: string[],
  consulted: Map<string, Candidate>,
): Promise<ResearchResult> {
  const { budget } = limits;
  const stage = async () => {
    try {
      await input.beforeStage?.();
    } catch {
      throw new LeaseLost("LEASE_CHANGED");
    }
  };
  const origins = new Map<string, Set<Origin>>();
  let searches = 0;
  let timeStopped = false;
  const timeLow = (needMs: number) => {
    const low = limits.remainingMs() < needMs;
    if (low) timeStopped = true;
    return low;
  };
  const note = (url: string, title: string | undefined, origin: Origin, fetchedAt = now.toISOString()) => {
    let key: string;
    try {
      key = normalizeEvidenceUrl(url);
    } catch {
      return null;
    }
    if (!consulted.has(key))
      consulted.set(key, {
        url: key,
        title: clean(title || host(url), 500),
        publishedOn: null,
        announcedOn: null,
        effectiveOn: null,
        dateEvidence: null,
        sourceKind: "unknown",
        fetchedAt,
      });
    origins.set(key, (origins.get(key) ?? new Set()).add(origin));
    return key;
  };

  // 1. Plan: the saved prompt decides the lanes. No profile data is given to this step.
  await stage();
  const rssTitles = (input.sources ?? []).filter((s) => s.kind !== "article").slice(0, 20).map((s) => s.title);
  const planned = await callStructured(limits, {
    stage: "plan",
    name: "research_plan",
    schema: planSchema,
    instructions: PLAN_INSTRUCTIONS(budget.maxLanes),
    input: {
      savedPrompt: input.settings.prompt,
      lookbackDays: input.settings.lookbackDays,
      today: isoDay(now),
      recentFeedHeadlines: rssTitles,
    },
    maxOutputTokens: 2_000,
    timeoutMs: 40_000,
  });
  if (!planned.ok && FAIL_FAST.has(planned.code))
    return {
      ...baseResult(planned.code),
      coverageGaps: ["The research planning step could not run, so nothing was searched."],
    };
  let lanes: Lane[] = planned.ok
    ? planned.data.lanes
        .map((lane) => ({
          name: clean(lane.name, 80),
          focus: clean(lane.focus, 400),
          queries: lane.queries.map((q) => clean(q, 200)).filter(Boolean).slice(0, 2),
        }))
        .filter((lane) => lane.name && lane.queries.length)
        .slice(0, budget.maxLanes)
    : [];
  if (!lanes.length) {
    gaps.push(
      "The planning step did not return a usable plan, so the saved prompt was searched as written, as one topic.",
    );
    const prompt = clean(input.settings.prompt, 400);
    lanes = [{ name: "Saved prompt", focus: prompt, queries: [prompt] }];
  }
  const range = planned.ok ? planned.data.explicitDateRange : null;
  const fromIso = validDay(range?.from) ?? isoDay(new Date(now.getTime() - input.settings.lookbackDays * 86_400_000));
  const toIso = validDay(range?.to) ?? isoDay(now);

  // 2. Discover: each lane is searched on its own, a few at a time.
  await stage();
  const laneUrls: string[][] = lanes.map(() => []);
  const laneState: ("ok" | "empty" | "failed")[] = lanes.map(() => "failed");
  let firstFailure: string | null = null;
  let budgetCut = false;
  const searched = await mapLimited(lanes, 3, () => timeLow(8_000), (lane) =>
    callSearch(limits, {
      instructions: SEARCH_INSTRUCTIONS,
      input: { lane: lane.name, focus: lane.focus, queries: lane.queries, from: fromIso, to: toIso },
      searches: budget.searchesPerLane,
      timeoutMs: 60_000,
    }),
  );
  searched.forEach((outcome, index) => {
    if (!outcome) {
      timeStopped = true;
      return;
    }
    if (!outcome.ok) {
      if (outcome.code === "TIME_BUDGET") timeStopped = true;
      else firstFailure ??= outcome.code;
      return;
    }
    const read = readEnvelope(outcome.envelope, now);
    searches += read.result.toolCalls;
    gaps.push(...read.result.coverageGaps);
    if (outcome.envelope.status && outcome.envelope.status !== "completed") budgetCut = true;
    for (const [, candidate] of read.consulted) {
      const key = note(candidate.url, candidate.title, "web");
      if (key && !laneUrls[index].includes(key)) laneUrls[index].push(key);
    }
    laneState[index] = laneUrls[index].length ? "ok" : "empty";
    if (!read.result.toolCalls)
      gaps.push(`The topic "${lanes[index].name}" was not searched: the model answered without using search.`);
  });
  if (laneState.every((state) => state === "failed") && firstFailure)
    return {
      ...baseResult(firstFailure),
      toolCalls: searches,
      candidates: [...consulted.values()],
      coverageGaps: [`Every topic search failed (${firstFailure}). See the reason above.`],
    };
  laneState.forEach((state, index) => {
    if (state === "failed")
      gaps.push(`The topic "${lanes[index].name}" could not be searched. Retry to cover it.`);
    else if (state === "empty")
      gaps.push(`The search for "${lanes[index].name}" returned no sources.`);
  });

  // 3. Read: open the promising pages. Search snippets are never treated as the evidence.
  await stage();
  const sources = input.sources ?? [];
  const rssLeads = sources.filter((s) => s.kind !== "article");
  const rssCap = Math.min(budget.maxRssLeadPages, rssLeads.length);
  const chosen: string[] = [];
  const webCap = Math.max(1, budget.maxPages - rssCap);
  for (let round = 0; chosen.length < webCap; round++) {
    let progressed = false;
    for (const urls of laneUrls) {
      const url = urls[round];
      if (url && !chosen.includes(url) && chosen.length < webCap) {
        chosen.push(url);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  let rssAdded = 0;
  for (const lead of rssLeads) {
    if (rssAdded >= rssCap) break;
    const key = note(lead.url, lead.title, "rss", lead.fetchedAt);
    if (!key) continue;
    // A feed article that web search also found is read once and keeps both origins.
    if (chosen.includes(key)) continue;
    chosen.push(key);
    rssAdded++;
  }
  const pages = new Map<string, ReadPage>();
  const failures: { host: string; reason: string }[] = [];
  for (const imported of sources.filter((s) => s.kind === "article")) {
    const key = note(imported.url, imported.title, "import", imported.fetchedAt);
    if (key)
      pages.set(key, {
        ok: true,
        requestedUrl: imported.url,
        url: key,
        title: clean(imported.title, 500),
        text: imported.text.slice(0, budget.pageTextChars),
        truncated: imported.text.length > budget.pageTextChars,
        contentHash: imported.contentHash,
        fetchedAt: imported.fetchedAt,
        origins: origins.get(key) ?? new Set<Origin>(["import"]),
      });
  }
  const reads = await mapLimited(
    chosen.filter((url) => !pages.has(url)),
    4,
    () => timeLow(25_000),
    (url) => readSourcePage(url, { charLimit: budget.pageTextChars, now: new Date() }),
  );
  const toRead = chosen.filter((url) => !pages.has(url));
  reads.forEach((outcome, index) => {
    const requested = toRead[index];
    if (!outcome) return;
    if (!outcome.ok) {
      failures.push({ host: host(requested), reason: outcome.reason });
      return;
    }
    // Key the page by where the content really came from, and carry the origins and the date of
    // the reading onto that address.
    const finalKey = normalizeEvidenceUrl(outcome.url);
    const kept = origins.get(requested) ?? new Set<Origin>(["web"]);
    if (finalKey !== requested) consulted.delete(requested);
    note(finalKey, outcome.title, [...kept][0] ?? "web", outcome.fetchedAt);
    for (const origin of kept) origins.set(finalKey, (origins.get(finalKey) ?? new Set()).add(origin));
    const entry = consulted.get(finalKey);
    if (entry) {
      entry.title = clean(outcome.title, 500);
      entry.fetchedAt = outcome.fetchedAt;
    }
    pages.set(finalKey, { ...outcome, url: finalKey, origins: origins.get(finalKey)! });
  });
  const notAttempted = reads.filter((outcome) => !outcome).length;
  if (failures.length)
    gaps.push(
      `${failures.length} page${failures.length === 1 ? "" : "s"} could not be opened and read, so ${failures.length === 1 ? "it was" : "they were"} not used as evidence (blocked, paid, not plain HTML, or empty): ${[...new Set(failures.map((f) => f.host))].slice(0, 4).join(", ")}.`,
    );
  if (notAttempted) gaps.push("The time budget was reached before every chosen page was read.");

  // 4. Extract and verify: claims come only from page text, and each is checked against it.
  const pageList = [...pages.values()];
  const pageIds = new Map(pageList.map((page, index) => [`P${index + 1}`, page]));
  const evidence: Evidence[] = [];
  let unsupported = 0;
  let beforeWindow = 0;
  let extractFailed = 0;
  if (pageList.length) {
    await stage();
    const batches: [string, ReadPage][][] = [];
    const entries = [...pageIds.entries()];
    for (let i = 0; i < entries.length; i += budget.pagesPerExtraction)
      batches.push(entries.slice(i, i + budget.pagesPerExtraction));
    const extracted = await mapLimited(batches, 2, () => timeLow(30_000), (batch) =>
      callStructured(limits, {
        stage: "extract",
        name: "page_claims",
        schema: extractionSchema,
        instructions: EXTRACTION_INSTRUCTIONS,
        input: {
          savedPrompt: input.settings.prompt,
          from: fromIso,
          to: toIso,
          pages: batch.map(([id, page]) => ({ id, url: page.url, title: page.title, text: page.text })),
        },
        maxOutputTokens: 4_000,
        timeoutMs: 70_000,
      }),
    );
    const seen = new Set<string>();
    for (const outcome of extracted) {
      if (!outcome) continue;
      if (!outcome.ok) {
        extractFailed++;
        continue;
      }
      for (const claim of outcome.data.claims) {
        const page = pageIds.get(claim.pageId);
        const text = clean(claim.claim, 1500);
        if (!page || text.length < 10 || !quoteIsOnPage(claim.excerpt, page.text)) {
          unsupported++;
          continue;
        }
        const dates = verifiedDates(
          {
            publishedOn: claim.publishedOn,
            announcedOn: claim.announcedOn,
            effectiveOn: claim.effectiveOn,
            dateEvidence: claim.dateEvidence,
          },
          page.text,
          validDateOrNull,
          now,
        );
        if (windowStatus(dates, fromIso) === "before") {
          beforeWindow++;
          continue;
        }
        const dedupe = `${page.url}|${text.toLowerCase()}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        if (evidence.length >= MAX_EVIDENCE) continue;
        evidence.push({
          id: `E${evidence.length + 1}`,
          url: page.url,
          title: page.title,
          claim: text,
          excerpt: clean(claim.excerpt, 700),
          ...dates,
          sourceKind: claim.sourceKind,
          previousState: claim.previousState ? clean(claim.previousState, 1000) : null,
          audience: claim.audience ? clean(claim.audience, 600) : null,
          limitations: claim.limitations ? clean(claim.limitations, 1200) : null,
        });
      }
    }
    if (extractFailed)
      gaps.push(
        `The evidence step failed for ${extractFailed} group${extractFailed === 1 ? "" : "s"} of pages, so claims from those pages are missing. Retry to cover them.`,
      );
    if (unsupported)
      gaps.push(
        `${unsupported} extracted claim${unsupported === 1 ? " was" : "s were"} dropped because the quoted passage was not found on the page it was attributed to.`,
      );
    if (beforeWindow)
      gaps.push(
        `${beforeWindow} claim${beforeWindow === 1 ? " was" : "s were"} left out because its dates fall before ${fromIso}.`,
      );
  } else if (consulted.size) {
    gaps.push("No page could be read, so there was no evidence to check and no findings were written.");
  }
  if (timeStopped || budgetCut)
    gaps.push("The time or output budget was reached. Coverage may be incomplete.");

  const laneReport = lanes
    .map((lane, index) =>
      laneState[index] === "ok"
        ? `${lane.name} (${laneUrls[index].length} sources)`
        : `${lane.name} (${laneState[index] === "empty" ? "no sources" : "not searched"})`,
    )
    .join("; ");
  const base = baseResult();
  base.toolCalls = searches;
  base.coverageGaps = gaps;
  const finish = (text: string) => {
    const finished = finishBriefing({
      result: base,
      consulted,
      texts: [text],
      previous: input.previous,
      now,
      budgetReached: false,
    });
    // Repeated coverage with no new fact is left out; the count is said in the summary.
    const repeated = finished.findings.filter((f) => f.novelty === "repeated").length;
    finished.findings = finished.findings.filter((f) => f.novelty !== "repeated");
    const parts = [
      finished.summary,
      repeated
        ? `${repeated} item${repeated === 1 ? "" : "s"} already reported in earlier briefings ${repeated === 1 ? "was" : "were"} left out.`
        : "",
      `Topics searched: ${laneReport}.`,
    ].filter(Boolean);
    finished.summary = parts.join(" ").slice(0, 2000);
    return finished;
  };

  if (!evidence.length)
    return finish(
      JSON.stringify({
        summary: pageList.length
          ? "No verified claims were found on the pages read for the saved prompt in the selected window."
          : "No pages could be read for the saved prompt.",
        coverageGaps: [],
        findings: [],
      }),
    );

  // 5. Write: a tool-free step that sees only the retained evidence, never the open web.
  await stage();
  const written = await callStructured(limits, {
    stage: "synthesize",
    name: "research_briefing",
    schema: synthesisSchema,
    instructions: SYNTHESIS_INSTRUCTIONS(fromIso, toIso),
    input: {
      savedPrompt: input.settings.prompt,
      window: { from: fromIso, to: toIso },
      optionalProfileContext: input.settings.useProfileContext ? input.profile : null,
      previousDevelopments: input.previous.map((p) => ({
        id: p.id,
        developmentKey: p.developmentKey,
        whatChanged: p.whatChanged.slice(0, 600),
      })),
      topicsSearched: lanes.map((lane, index) => ({ name: lane.name, status: laneState[index] })),
      evidence: evidence.map((item) => ({
        id: item.id,
        title: item.title,
        claim: item.claim,
        excerpt: item.excerpt,
        publishedOn: item.publishedOn,
        announcedOn: item.announcedOn,
        effectiveOn: item.effectiveOn,
        sourceKind: item.sourceKind,
        previousState: item.previousState,
        audience: item.audience,
        limitations: item.limitations,
      })),
    },
    maxOutputTokens: budget.maxOutputTokens,
    timeoutMs: budget.timeoutMs,
  });
  if (!written.ok) {
    base.errorCode = written.code === "TIME_BUDGET" ? "TIMEOUT" : written.code;
    base.outcome = consulted.size ? "partial" : "failed";
    base.candidates = [...consulted.values()];
    base.coverageGaps = [
      ...new Set([
        ...gaps,
        `The final writing step failed (${written.code}) after ${evidence.length} claims were verified against their pages. The sources are kept; retry to produce the briefing.`,
      ]),
    ];
    base.summary = `Topics searched: ${laneReport}.`.slice(0, 2000);
    return base;
  }
  const byId = new Map(evidence.map((item) => [item.id, item]));
  let uncited = 0;
  const findings = written.data.findings.flatMap((finding) => {
    const cited = [...new Set(finding.evidenceIds)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    if (!cited.length) {
      uncited++;
      return [];
    }
    // Sources, dates and quotes are copied from the verified evidence, never from the model.
    const sources = [...new Set(cited.map((item) => item.url))].map((url) => {
      const group = cited.filter((item) => item.url === url);
      const first = (pick: (item: Evidence) => string | null) =>
        group.map(pick).find((value) => value) ?? null;
      const dated = group.find((item) => item.publishedOn || item.announcedOn || item.effectiveOn);
      return {
        url,
        title: group[0].title,
        publishedOn: dated?.publishedOn ?? null,
        announcedOn: dated?.announcedOn ?? null,
        effectiveOn: dated?.effectiveOn ?? null,
        dateEvidence: dated?.dateEvidence ?? null,
        sourceKind: group.some((item) => item.sourceKind === "primary") ? "primary" : group[0].sourceKind,
        excerpt: first((item) => item.excerpt) ?? undefined,
      };
    });
    return [
      {
        developmentKey: finding.developmentKey,
        title: finding.title,
        whatChanged: finding.whatChanged,
        whyItMatters: finding.whyItMatters,
        agencyAction: finding.agencyAction,
        angle: finding.angle,
        previousState: finding.previousState ?? firstOf(cited, "previousState"),
        audience: finding.audience ?? firstOf(cited, "audience"),
        limitations: finding.limitations ?? firstOf(cited, "limitations"),
        category: finding.category,
        confidence: finding.confidence,
        consequence: Math.min(5, Math.max(1, Math.round(finding.consequence) || 1)),
        relevance: Math.min(5, Math.max(1, Math.round(finding.relevance) || 1)),
        novelty: finding.novelty,
        previousFindingId: finding.previousFindingId,
        sources,
      },
    ];
  });
  if (uncited)
    gaps.push(
      `${uncited} proposed finding${uncited === 1 ? "" : "s"} cited no retained evidence and ${uncited === 1 ? "was" : "were"} left out.`,
    );
  base.coverageGaps = gaps;
  return finish(
    JSON.stringify({
      summary: written.data.summary.slice(0, 1500),
      coverageGaps: written.data.coverageGaps.slice(0, 6).map((gap) => gap.slice(0, 480)),
      findings: findings.slice(0, 12),
    }),
  );
}

function firstOf(items: Evidence[], key: "previousState" | "audience" | "limitations") {
  return items.map((item) => item[key]).find((value) => value) ?? null;
}
