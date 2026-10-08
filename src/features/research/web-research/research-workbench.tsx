"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  BriefingView,
  Candidate,
  Evidence,
  ResearchSettings,
} from "./contracts";

async function send(clientId: string, action: string, input: unknown) {
  const response = await fetch(`/api/client/${clientId}/web-research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(result.error?.message ?? "Could not complete this action.");
  return result.data;
}
const outcomes: Record<string, string> = {
  running: "Running",
  success: "Briefing ready",
  empty: "No evidence-backed findings",
  partial: "Partial coverage",
  failed: "Research failed",
  not_configured: "Provider setup required",
};
function EvidenceLink({
  source,
  fetchedAt,
}: {
  source: Evidence;
  fetchedAt?: string;
}) {
  return (
    <li className="min-w-0 space-y-1 text-small">
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-brand-purple underline underline-offset-2"
      >
        {source.title}
      </a>
      <p className="break-words text-caption text-muted-foreground">
        {source.sourceKind} source · {new URL(source.url).hostname}
      </p>
      <p className="text-caption text-muted-foreground">
        Published: {source.publishedOn ?? "unknown"} · Announced:{" "}
        {source.announcedOn ?? "unknown"} · Effective:{" "}
        {source.effectiveOn ?? "unknown"}
      </p>
      {fetchedAt ? (
        <p className="text-caption text-muted-foreground">
          Fetched: {new Date(fetchedAt).toLocaleString()}
        </p>
      ) : null}
      {source.dateEvidence ? (
        <details className="text-caption text-muted-foreground">
          <summary className="cursor-pointer">Reported date evidence</summary>
          <p className="whitespace-pre-wrap">{source.dateEvidence}</p>
        </details>
      ) : null}
    </li>
  );
}

export function ResearchWorkbench({
  clientId,
  settings,
  briefings,
  canManage,
  canCreatePosts,
  providerConfigured,
}: {
  clientId: string;
  settings: ResearchSettings | null;
  briefings: BriefingView[];
  canManage: boolean;
  canCreatePosts: boolean;
  providerConfigured: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(settings);
  const [prompt, setPrompt] = useState(settings?.prompt ?? "");
  const [lookbackDays, setLookbackDays] = useState(settings?.lookbackDays ?? 7);
  const [useProfileContext, setUseProfileContext] = useState(
    settings?.useProfileContext ?? false,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<
    {
      findingId: string;
      ideaId: string;
      postId: string | null;
      error: string | null;
    }[]
  >([]);
  const runKey = useRef<{ revision: number; key: string } | null>(null);
  const dirty =
    !!saved &&
    (prompt !== saved.prompt ||
      lookbackDays !== saved.lookbackDays ||
      useProfileContext !== saved.useProfileContext);
  const active = briefings.some((b) => b.outcome === "running");
  async function perform(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not complete this action. Refresh and try again.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function save() {
    if (!saved) return null;
    const data = await send(clientId, "save", {
      prompt,
      lookbackDays,
      useProfileContext,
      expectedRevision: saved.revision,
    });
    const next = {
      prompt,
      lookbackDays,
      useProfileContext,
      revision: data.revision,
    };
    setSaved(next);
    runKey.current = null;
    return next;
  }
  async function run(revision: number) {
    if (runKey.current?.revision !== revision)
      runKey.current = { revision, key: crypto.randomUUID() };
    const result = await send(clientId, "run", {
      expectedRevision: revision,
      requestKey: runKey.current.key,
    });
    runKey.current = null;
    setMessage(outcomes[result.outcome] ?? "Research saved.");
  }
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    );
  }
  return (
    <div className="space-y-6">
      {canManage && saved ? (
        <Card>
          <CardHeader>
            <CardTitle>Saved research prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-small text-muted-foreground">
              Choose what to research.{" "}
              {saved.revision
                ? `Saved version ${saved.revision}.`
                : "Save this starter prompt before your first run."}{" "}
              {dirty
                ? "You have unsaved edits."
                : "Your editor matches the saved prompt."}
            </p>
            <label
              htmlFor="web-research-prompt"
              className="block text-small font-medium"
            >
              Research instructions
            </label>
            <Textarea
              id="web-research-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={9}
              maxLength={12000}
              disabled={!!busy}
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-small">
                Look back
                <input
                  aria-label="Research lookback in days"
                  type="number"
                  min={1}
                  max={30}
                  value={lookbackDays}
                  disabled={!!busy}
                  onChange={(e) => setLookbackDays(Number(e.target.value))}
                  className="w-16 rounded-control border border-border-grey bg-white px-2 py-1"
                />{" "}
                days
              </label>
              <label className="flex items-center gap-2 text-small">
                <input
                  type="checkbox"
                  checked={useProfileContext}
                  disabled={!!busy}
                  onChange={(e) => setUseProfileContext(e.target.checked)}
                />{" "}
                Use profile context
              </label>
            </div>
            <p className="text-caption text-muted-foreground">
              Profile context is optional and starts off. When off, research
              follows your prompt independently. A period specified in your
              prompt takes precedence over the lookback setting.
            </p>
            {!providerConfigured ? (
              <p className="text-small text-warning-strong">
                Web research needs provider setup. You can save settings now.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!!busy || (!dirty && saved.revision > 0)}
                onClick={() =>
                  perform("save", async () => {
                    await save();
                    setMessage("Research settings saved.");
                  })
                }
              >
                {busy === "save" ? "Saving…" : "Save prompt"}
              </Button>
              <Button
                disabled={!!busy || active || dirty || !saved.revision}
                onClick={() => perform("run", () => run(saved.revision))}
              >
                {busy === "run" ? "Researching…" : "Run saved prompt"}
              </Button>
              {dirty || !saved.revision ? (
                <Button
                  disabled={!!busy || active}
                  onClick={() =>
                    perform("save_run", async () => {
                      const next = await save();
                      if (next) await run(next.revision);
                    })
                  }
                >
                  {busy === "save_run"
                    ? "Saving and researching…"
                    : "Save and run"}
                </Button>
              ) : null}
              {dirty ? (
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => {
                    setPrompt(saved.prompt);
                    setLookbackDays(saved.lookbackDays);
                    setUseProfileContext(saved.useProfileContext);
                  }}
                >
                  Discard edits
                </Button>
              ) : null}
            </div>
            <p className="text-caption text-muted-foreground">
              Each run is bounded to six search actions and 90 seconds of
              provider time. Coverage may be partial. Running research does not
              create posts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-small text-muted-foreground">
          Administrators manage the private research prompt. You can review the
          saved findings below.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-small text-danger-strong">
          {error}
        </p>
      ) : null}
      {message || busy ? (
        <p role="status" aria-live="polite" className="text-small">
          {busy
            ? busy === "create"
              ? "Drafting selected findings. Each post will go to review…"
              : "Working… Keep this page open for the result."
            : message}
        </p>
      ) : null}
      {active ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-small">A research run is in progress.</p>
          <Button variant="outline" onClick={() => router.refresh()}>
            Refresh results
          </Button>
        </div>
      ) : null}
      {canCreatePosts ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!!busy || !selected.length}
            onClick={() =>
              perform("create", async () => {
                const data = await send(clientId, "create_posts", {
                  findingIds: selected,
                });
                setCreated(data.items);
                setMessage(
                  `${data.items.filter((item: { postId: string | null }) => item.postId).length} post(s) ready for human review.`,
                );
              })
            }
          >
            {busy === "create"
              ? "Drafting…"
              : `Create separate posts${selected.length ? ` (${selected.length})` : ""}`}
          </Button>
          <p className="text-caption text-muted-foreground">
            Select up to three approved findings. Each becomes its own post;
            repeat selections reuse its idea.
          </p>
        </div>
      ) : null}
      {created.length ? (
        <ul className="space-y-2 text-small">
          {created.map((item) => (
            <li key={item.findingId}>
              <Link
                className="text-brand-purple underline"
                href={
                  item.postId
                    ? `/client/${clientId}/posts/${item.postId}/review`
                    : `/client/${clientId}/ideas`
                }
              >
                {item.postId ? "Open post review" : "Open selected idea"}
              </Link>
              {item.error ? (
                <p role="alert" className="text-danger-strong">
                  {item.error}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!briefings.length ? (
        <p className="rounded-control border border-dashed border-border-grey p-6 text-small text-muted-foreground">
          No web briefings yet. Save your prompt and run it to collect evidence
          and suggested angles.
        </p>
      ) : null}
      {briefings.map((briefing) => (
        <Card key={briefing.id}>
          <CardHeader>
            <CardTitle>{outcomes[briefing.outcome]}</CardTitle>
            <p className="text-caption text-muted-foreground">
              {new Date(briefing.created_at).toLocaleString()} · Prompt version{" "}
              {briefing.revision} · {briefing.candidate_count} candidate sources
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {briefing.summary ? (
              <p className="whitespace-pre-wrap text-small">
                {briefing.summary}
              </p>
            ) : null}
            {briefing.outcome === "failed" ? (
              <p className="text-small text-danger-strong">
                This run did not complete. Check provider setup and retry with
                Run saved prompt. Any retained candidate evidence is shown
                below.
              </p>
            ) : null}
            {briefing.outcome === "not_configured" ? (
              <p className="text-small text-warning-strong">
                Web research is not configured. This was not an empty successful
                search.
              </p>
            ) : null}
            {briefing.coverage_gaps.length ? (
              <div className="rounded-control bg-soft-white p-3">
                <p className="text-small font-medium">
                  Coverage and uncertainty
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-small">
                  {briefing.coverage_gaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {briefing.findings.map((finding) => (
              <article
                key={finding.id}
                className="min-w-0 space-y-3 rounded-control border border-border-grey p-4"
              >
                <div className="flex items-start gap-3">
                  {canCreatePosts && finding.approval_status === "approved" ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${finding.title}`}
                      checked={selected.includes(finding.id)}
                      disabled={
                        !!busy ||
                        (!selected.includes(finding.id) && selected.length >= 3)
                      }
                      onChange={() => toggle(finding.id)}
                      className="mt-1"
                    />
                  ) : null}
                  <h3 className="min-w-0 break-words text-body font-medium">
                    {finding.title}
                  </h3>
                </div>
                <p className="text-caption text-muted-foreground">
                  {finding.category === "confirmed_change"
                    ? "Confirmed change"
                    : "Trend analysis"}{" "}
                  · {finding.confidence} confidence ·{" "}
                  {finding.novelty.replace("_", " ")} · Consequence{" "}
                  {finding.consequence}/5 · Relevance {finding.relevance}/5 ·{" "}
                  {finding.approval_status}
                </p>
                <p className="whitespace-pre-wrap text-small">
                  <strong>What changed: </strong>
                  {finding.whatChanged}
                </p>
                <p className="whitespace-pre-wrap text-small">
                  <strong>Why it matters: </strong>
                  {finding.whyItMatters}
                </p>
                <p className="whitespace-pre-wrap text-small">
                  <strong>Action: </strong>
                  {finding.agencyAction}
                </p>
                <p className="whitespace-pre-wrap text-small">
                  <strong>Suggested angle: </strong>
                  {finding.angle}
                </p>
                <ul className="space-y-3">
                  {finding.sources.map((source) => (
                    <EvidenceLink
                      key={source.url}
                      source={source}
                      fetchedAt={
                        briefing.candidates.find((c) => c.url === source.url)
                          ?.fetchedAt
                      }
                    />
                  ))}
                </ul>
                {canManage &&
                !finding.content_idea_id &&
                finding.approval_status !== "archived" ? (
                  <div className="flex flex-wrap gap-2">
                    {finding.approval_status !== "approved" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() =>
                          perform("review", async () => {
                            await send(clientId, "review", {
                              findingId: finding.id,
                              status: "approved",
                            });
                            setMessage(
                              "Finding approved for selection. This does not approve a post.",
                            );
                          })
                        }
                      >
                        Approve finding
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() =>
                        perform("review", async () => {
                          await send(clientId, "review", {
                            findingId: finding.id,
                            status: "archived",
                          });
                          setSelected((ids) =>
                            ids.filter((id) => id !== finding.id),
                          );
                        })
                      }
                    >
                      Archive finding
                    </Button>
                  </div>
                ) : null}
                {finding.content_idea_id ? (
                  <Link
                    href={`/client/${clientId}/ideas`}
                    className="text-small text-brand-purple underline"
                  >
                    Selected idea is available in Ideas
                  </Link>
                ) : null}
              </article>
            ))}
            <details>
              <summary className="cursor-pointer text-small font-medium">
                All discovered candidate sources ({briefing.candidates.length})
              </summary>
              <p className="my-2 text-caption text-muted-foreground">
                All URLs returned by this bounded search are retained, including
                candidates that did not become findings. This is not an
                exhaustive inventory of the web.
              </p>
              <ul className="space-y-4">
                {briefing.candidates.map((source: Candidate) => (
                  <EvidenceLink
                    key={source.url}
                    source={source}
                    fetchedAt={source.fetchedAt}
                  />
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
