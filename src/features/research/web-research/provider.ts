import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  evidenceSchema,
  findingSchema,
  isPublicWebUrl,
  RESEARCH_BUDGET,
  type Candidate,
  type Finding,
  type ResearchResult,
  type ResearchSettings,
} from "./contracts";

export type Previous = Pick<Finding, "developmentKey" | "whatChanged" | "sources"> & {
  id: string;
  fingerprint: string;
};
export type SearchInput = {
  clientId: string;
  userId: string;
  settings: ResearchSettings;
  profile: Record<string, unknown> | null;
  previous: Previous[];
  sources?: {
    id: string;
    url: string;
    title: string;
    text: string;
    contentHash: string;
    fetchedAt: string;
    kind?: "article" | "rss";
    feedUrl?: string;
    feedPublishedAt?: string | null;
  }[];
};
export type Envelope = {
  status?: string;
  output?: {
    type?: string;
    status?: string;
    action?: { sources?: { url?: string; title?: string }[] };
    content?: {
      type?: string;
      text?: string;
      annotations?: { type?: string; url?: string; title?: string }[];
    }[];
  }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    server_tool_use?: { web_search_requests?: number | null } | null;
    server_tool_use_details?: { web_search_requests?: number | null } | null;
  } | null;
};

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}
export function normalizeEvidenceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
function fingerprint(finding: Finding): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        key: normalized(finding.developmentKey),
        change: normalized(finding.whatChanged),
        urls: finding.sources.map((s) => normalizeEvidenceUrl(s.url)).sort(),
        dates: finding.sources.map((s) => [
          s.publishedOn,
          s.announcedOn,
          s.effectiveOn,
        ]),
      }),
    )
    .digest("hex");
}
/**
 * The provider's own explanation of a failed call, flattened and trimmed. It is for the
 * server log only: it is never saved with the briefing or shown to the team.
 */
export async function providerErrorDetail(
  response: Pick<Response, "text">,
): Promise<string> {
  let message = "";
  try {
    const body = (await response.text()).slice(0, 4000);
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: unknown } | string;
        message?: unknown;
      };
      const candidate =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message ?? parsed.message;
      message = typeof candidate === "string" ? candidate : body;
    } catch {
      message = body;
    }
  } catch {
    /* No readable body. */
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

export function providerFailureCode(status: number): string {
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 402) return "PROVIDER_CREDITS";
  if (status === 404) return "PROVIDER_MODEL_NOT_FOUND";
  if (status === 400) return "PROVIDER_BAD_REQUEST";
  return "PROVIDER_ERROR";
}

/**
 * Finds the briefing object in the model's text. Models that search often write a short
 * remark before the answer, split the answer over several messages, or wrap it in a code fence,
 * so a plain parse of everything glued together fails even though the briefing is fine.
 * Whatever is found still goes through the full schema check afterwards.
 */
export function readBriefingJson(texts: string[]): unknown {
  const asObject = (text: string): unknown => {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    for (const attempt of [
      trimmed,
      fenced,
      first >= 0 && last > first ? trimmed.slice(first, last + 1) : undefined,
    ]) {
      if (!attempt) continue;
      try {
        const value: unknown = JSON.parse(attempt);
        if (value && typeof value === "object" && !Array.isArray(value))
          return value;
      } catch {
        /* Try the next reading. */
      }
    }
    return undefined;
  };
  // Everything together first (the normal case), then the last message first.
  for (const text of [texts.join(""), ...[...texts].reverse()]) {
    const value = asObject(text);
    if (value !== undefined) return value;
  }
  return undefined;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export function validDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value)
    ? value
    : null;
}
const clip = (value: unknown, max: number) =>
  typeof value === "string" && value.length > max ? value.slice(0, max) : value;
const onlyKeys = (value: unknown, keys: string[]): Record<string, unknown> | unknown =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => keys.includes(key)),
      )
    : value;

/**
 * Repairs small slips in one proposed finding before the strict check, so a finding is not lost
 * over something trivial: a date that is not a real YYYY-MM-DD becomes unknown (null, never a
 * guess), a value that is not an id becomes null (the app sets it itself), extra fields are
 * ignored and over-long text is cut to its limit. Everything else still has to pass the check.
 */
function softenFinding(item: unknown): unknown {
  const finding = onlyKeys(item, Object.keys(findingSchema.shape)) as Record<string, unknown>;
  if (!finding || typeof finding !== "object") return item;
  finding.previousFindingId = z.string().uuid().safeParse(finding.previousFindingId).success
    ? finding.previousFindingId
    : null;
  for (const [key, max] of [
    ["developmentKey", 200],
    ["title", 300],
    ["whatChanged", 2000],
    ["whyItMatters", 1500],
    ["agencyAction", 1500],
    ["angle", 700],
    ["previousState", 1000],
    ["audience", 600],
    ["limitations", 1200],
  ] as const)
    finding[key] = clip(finding[key], max);
  // Optional text the model left empty or null is simply absent, not a reason to lose the finding.
  for (const key of ["previousState", "audience", "limitations"] as const)
    if (typeof finding[key] !== "string" || !finding[key]) delete finding[key];
  if (Array.isArray(finding.sources))
    finding.sources = finding.sources.map((source) => {
      const kept = onlyKeys(source, Object.keys(evidenceSchema.shape)) as Record<string, unknown>;
      if (!kept || typeof kept !== "object") return source;
      for (const key of ["publishedOn", "announcedOn", "effectiveOn"])
        kept[key] = validDateOrNull(kept[key]);
      kept.dateEvidence = kept.dateEvidence ?? null;
      kept.title = clip(kept.title, 500);
      kept.excerpt = clip(kept.excerpt, 700);
      if (typeof kept.excerpt !== "string" || !kept.excerpt) delete kept.excerpt;
      kept.dateEvidence = clip(kept.dateEvidence, 1200);
      return kept;
    });
  return finding;
}

export function baseResult(errorCode: string | null = null): ResearchResult {
  return {
    outcome: "failed",
    summary: "",
    coverageGaps: [],
    candidates: [],
    findings: [],
    errorCode,
    toolCalls: 0,
    tokenInput: null,
    tokenOutput: null,
  };
}

export type BriefingContext = {
  result: ResearchResult;
  consulted: Map<string, Candidate>;
  texts: string[];
  previous: Previous[];
  now: Date;
  /** True when the provider reported an unfinished answer or the search allowance was used up. */
  budgetReached: boolean;
  /** The provider's own status word, for the server log only. */
  status?: string;
};

/**
 * Reads one provider reply into the pages it consulted, the number of searches it ran and its
 * text. URL provenance comes from tool outputs and annotations, never from generated JSON alone.
 */
export function readEnvelope(
  raw: Envelope,
  now = new Date(),
  sources: SearchInput["sources"] = [],
): { result: ResearchResult; consulted: Map<string, Candidate>; texts: string[] } {
  const result = baseResult();
  const consulted = new Map<string, Candidate>();
  const add = (url?: string, title?: string) => {
    if (!url) return;
    if (!isPublicWebUrl(url)) {
      result.coverageGaps.push(
        "A source URL was excluded because it was not a valid public web link.",
      );
      return;
    }
    const key = normalizeEvidenceUrl(url);
    if (!consulted.has(key))
      consulted.set(key, {
        url: key,
        title: title?.slice(0, 500) || new URL(url).hostname,
        publishedOn: null,
        announcedOn: null,
        effectiveOn: null,
        dateEvidence: null,
        sourceKind: "unknown",
        fetchedAt: now.toISOString(),
      });
  };
  const texts: string[] = [];
  for (const source of sources) {
    add(source.url, source.title);
    const retained = consulted.get(normalizeEvidenceUrl(source.url));
    if (retained) retained.fetchedAt = source.fetchedAt;
  }
  for (const output of raw.output ?? []) {
    if (
      output.type === "web_search_call" ||
      output.type === "openrouter:web_search"
    ) {
      result.toolCalls++;
      if (output.status && output.status !== "completed")
        result.coverageGaps.push(
          "A search action did not complete. Coverage may be incomplete.",
        );
      for (const source of output.action?.sources ?? [])
        add(source.url, source.title);
    }
    if (output.type === "message")
      for (const content of output.content ?? []) {
        if (content.type === "output_text" && content.text)
          texts.push(content.text);
        for (const citation of content.annotations ?? [])
          if (citation.type === "url_citation")
            add(citation.url, citation.title);
      }
  }
  // OpenRouter reports server search usage independently of output items. Do
  // not sum it with those items: they describe the same searches.
  for (const usage of [
    raw.usage?.server_tool_use,
    raw.usage?.server_tool_use_details,
  ]) {
    const count = usage?.web_search_requests;
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
      result.toolCalls = Math.max(result.toolCalls, count);
  }
  result.tokenInput = Number.isSafeInteger(raw.usage?.input_tokens)
    ? raw.usage!.input_tokens!
    : null;
  result.tokenOutput = Number.isSafeInteger(raw.usage?.output_tokens)
    ? raw.usage!.output_tokens!
    : null;
  return { result, consulted, texts };
}

/** URL provenance comes from tool outputs/annotations, never from generated JSON alone. */
export function mapWebResponse(
  raw: Envelope,
  previous: Previous[],
  now = new Date(),
  sources: SearchInput["sources"] = [],
): ResearchResult {
  const { result, consulted, texts } = readEnvelope(raw, now, sources);
  return finishBriefing({
    result,
    consulted,
    texts,
    previous,
    now,
    budgetReached:
      raw.status !== "completed" ||
      result.toolCalls >= RESEARCH_BUDGET.maxToolCalls,
    status: raw.status,
  });
}

/**
 * Turns the briefing text into the saved result: validates it, drops findings whose links were not
 * consulted, labels each finding new, repeated or follow-up, and marks the outcome. The same rules
 * apply whichever stage produced the text.
 */
export function finishBriefing(context: BriefingContext): ResearchResult {
  const { result, consulted, texts, previous, now } = context;
  const parsed = readBriefingJson(texts);
  const header = z
    .object({
      summary: z.string().max(2000),
      coverageGaps: z.array(z.string().max(500)).max(12),
      findings: z.array(z.unknown()).max(12),
    })
    .safeParse(parsed);
  if (!header.success) {
    // Server log only, and only the shape of the problem: never the model's text, which can
    // carry the saved prompt or profile context.
    console.error(
      `[web-research] briefing could not be validated: ${
        parsed === undefined
          ? `no JSON object found in ${texts.length} text part(s) of ${texts.join("").length} characters (starts with "{": ${texts.join("").trimStart().startsWith("{")}, "{" count ${texts.join("").split("{").length - 1}), response status ${context.status ?? "unknown"}`
          : header.error.issues
              .slice(0, 6)
              .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.code}`)
              .join("; ")
      }`,
    );
    result.candidates = [...consulted.values()];
    result.errorCode = "INVALID_RESPONSE";
    result.outcome = consulted.size ? "partial" : "failed";
    result.coverageGaps = [
      "Sources were collected, but the briefing could not be validated. Review the candidate links or retry.",
    ];
    return result;
  }
  result.summary = header.data.summary;
  result.coverageGaps.push(...header.data.coverageGaps);
  const seen = new Set<string>();
  for (const item of header.data.findings) {
    const checked = findingSchema.safeParse(softenFinding(item));
    if (!checked.success) {
      // Server log only: which fields failed and why, never their values.
      console.error(
        `[web-research] a finding was omitted, fields that failed: ${checked.error.issues
          .slice(0, 8)
          .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.code}`)
          .join("; ")}`,
      );
      result.coverageGaps.push(
        "A finding was omitted because its fields or dates could not be validated.",
      );
      continue;
    }
    const finding = checked.data;
    if (
      finding.sources.some(
        (source) => !consulted.has(normalizeEvidenceUrl(source.url)),
      )
    ) {
      result.coverageGaps.push(
        "A finding was omitted because a source link was absent from the search evidence.",
      );
      continue;
    }
    for (const source of finding.sources) {
      source.url = normalizeEvidenceUrl(source.url);
      // A reported date without supporting text is unknown, never a fetch-date fallback.
      if (!source.dateEvidence)
        source.publishedOn = source.announcedOn = source.effectiveOn = null;
      consulted.set(source.url, {
        ...source,
        fetchedAt: consulted.get(source.url)?.fetchedAt ?? now.toISOString(),
      });
    }
    // Kept, not dropped: the user decides what to keep. It is labelled as a trend instead of a
    // confirmed change, so the label never claims more than the evidence shows.
    if (
      finding.category === "confirmed_change" &&
      !finding.sources.some((s) => s.sourceKind === "primary")
    )
      finding.category = "trend_analysis";
    const hash = fingerprint(finding);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const grouped = result.findings.find(
      (f) =>
        normalized(f.developmentKey) === normalized(finding.developmentKey),
    );
    if (grouped) {
      for (const source of finding.sources)
        if (!grouped.sources.some((s) => s.url === source.url))
          grouped.sources.push(source);
      for (const field of [
        "whatChanged",
        "whyItMatters",
        "agencyAction",
        "angle",
      ] as const) {
        if (normalized(grouped[field]) !== normalized(finding[field]))
          grouped[field] += `\n\n${finding[field]}`;
      }
      if (finding.novelty === "follow_up") grouped.novelty = "follow_up";
      grouped.fingerprint = fingerprint(grouped);
    } else result.findings.push({ ...finding, fingerprint: hash });
  }
  for (const finding of result.findings) {
    const match = previous.find(
      (p) =>
        p.fingerprint === finding.fingerprint ||
        normalized(p.developmentKey) === normalized(finding.developmentKey),
    );
    if (!match) {
      finding.novelty = "new";
      finding.previousFindingId = null;
    } else {
      const changed =
        normalized(match.whatChanged) !== normalized(finding.whatChanged);
      const newEvidence = finding.sources.some(
        (s) =>
          !match.sources.some(
            (old) =>
              normalizeEvidenceUrl(old.url) === s.url &&
              old.publishedOn === s.publishedOn &&
              old.announcedOn === s.announcedOn &&
              old.effectiveOn === s.effectiveOn,
          ),
      );
      finding.novelty =
        changed && newEvidence && finding.novelty === "follow_up"
          ? "follow_up"
          : "repeated";
      finding.previousFindingId = match.id;
    }
  }
  result.findings.sort(
    (a, b) => b.consequence + b.relevance - (a.consequence + a.relevance),
  );
  result.candidates = [...consulted.values()];
  if (context.budgetReached) {
    result.coverageGaps.push(
      "The search or output budget was reached. Coverage may be incomplete.",
    );
  }
  if (!result.toolCalls)
    result.coverageGaps.push(
      "The provider did not perform a web search; evidence coverage could not be confirmed.",
    );
  result.coverageGaps = [...new Set(result.coverageGaps)];
  result.outcome = result.coverageGaps.length
    ? "partial"
    : result.findings.length
      ? "success"
      : "empty";
  if (!result.toolCalls && !result.candidates.length) {
    result.outcome = "failed";
    result.errorCode = "NO_SEARCH_EVIDENCE";
  }
  return result;
}

export async function readBoundedResponse(response: Response): Promise<Envelope> {
  if (!response.body) throw new Error("INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESEARCH_BUDGET.maxResponseBytes) {
        await reader.cancel();
        throw new Error("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const envelope = z
    .object({
      status: z.string().optional(),
      output: z
        .array(
          z
            .object({
              type: z.string().optional(),
              status: z.string().optional(),
              action: z
                .object({
                  sources: z
                    .array(
                      z.object({
                        url: z.string().optional(),
                        title: z.string().optional(),
                      }),
                    )
                    .optional(),
                })
                .passthrough()
                .optional(),
              content: z
                .array(
                  z
                    .object({
                      type: z.string().optional(),
                      text: z.string().optional(),
                      annotations: z
                        .array(
                          z
                            .object({
                              type: z.string().optional(),
                              url: z.string().optional(),
                              title: z.string().optional(),
                            })
                            .passthrough(),
                        )
                        .optional(),
                    })
                    .passthrough(),
                )
                .optional(),
            })
            .passthrough(),
        )
        .optional(),
      usage: z
        .object({
          input_tokens: z.number().int().nonnegative().optional(),
          output_tokens: z.number().int().nonnegative().optional(),
          server_tool_use: z
            .object({
              web_search_requests: z
                .number()
                .int()
                .nonnegative()
                .nullable()
                .optional(),
            })
            .passthrough()
            .nullable()
            .optional(),
          server_tool_use_details: z
            .object({
              web_search_requests: z
                .number()
                .int()
                .nonnegative()
                .nullable()
                .optional(),
            })
            .passthrough()
            .nullable()
            .optional(),
        })
        .passthrough()
        .nullable()
        .optional(),
    })
    .passthrough();
  return envelope.parse(raw);
}
