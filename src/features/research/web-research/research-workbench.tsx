"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AddToCalendarDialog,
  type CalendarEntryChoice,
} from "@/features/calendar/add-to-calendar-dialog";
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
        className="break-words text-link underline underline-offset-2"
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

/**
 * Web Briefings. The list shows one saved prompt, the schedule and the briefings;
 * ?briefing=ID opens one briefing on its own page. Advanced sources, classification
 * and run history arrive as `advancedSlot` and render only on the list.
 */
export function ResearchWorkbench({
  clientId,
  settings,
  briefings,
  canManage,
  canCreatePosts,
  createPostsReason,
  canSave,
  saveReason,
  canAddToCalendar,
  addToCalendarReason,
  providerConfigured,
  openBriefingId,
  scheduleSlot,
  advancedSlot,
}: {
  clientId: string;
  settings: ResearchSettings | null;
  briefings: BriefingView[];
  canManage: boolean;
  /** Create post needs both Manage ideas and Draft posts. */
  canCreatePosts: boolean;
  /** One-line reason shown beside a disabled "Create post" control. */
  createPostsReason?: string | null;
  /** Save to Content Bank needs the research contribution capability. */
  canSave: boolean;
  saveReason?: string | null;
  /** Add to Calendar needs Manage ideas. */
  canAddToCalendar: boolean;
  addToCalendarReason?: string | null;
  providerConfigured: boolean;
  openBriefingId?: string;
  scheduleSlot?: ReactNode;
  advancedSlot?: ReactNode;
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
  // Findings saved during this visit; the server list covers the rest after a refresh.
  const [savedNow, setSavedNow] = useState<Record<string, string>>({});
  const [calendarEntry, setCalendarEntry] = useState<CalendarEntryChoice | null>(
    null,
  );
  const runKey = useRef<{ revision: number; key: string } | null>(null);
  const dirty =
    !!saved &&
    (prompt !== saved.prompt ||
      lookbackDays !== saved.lookbackDays ||
      useProfileContext !== saved.useProfileContext);
  const active = briefings.some((b) => b.outcome === "running");
  const openBriefing = openBriefingId
    ? (briefings.find((b) => b.id === openBriefingId) ?? null)
    : null;
  const briefingMissing = !!openBriefingId && !openBriefing;
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
  // The one primary action on this page: runs the saved revision only. Unsaved
  // edits must be saved first (Save and run in the prompt card).
  const runNowAction =
    canManage && saved && !openBriefing ? (
      <Button
        variant="brand"
        disabled={!!busy || active || dirty || !saved.revision}
        onClick={() => perform("run", () => run(saved.revision))}
      >
        {busy === "run" ? "Researching…" : "Run now"}
      </Button>
    ) : !canManage && !openBriefing ? (
      // Members see the control, disabled: only an account admin may run research.
      <Button variant="brand" disabled>
        Run now
      </Button>
    ) : undefined;
  return (
    <div className="space-y-6">
      <PageHeader
        {...(openBriefing
          ? {
              breadcrumb: [
                {
                  label: "Research",
                  href: `/client/${clientId}/research?tab=briefings`,
                },
                {
                  label:
                    openBriefing.findings[0]?.title ??
                    outcomes[openBriefing.outcome],
                },
              ],
            }
          : { title: "Research" })}
        description="Research your saved prompt, review evidence, and select findings for content."
        action={runNowAction}
      />
      {openBriefing ? (
        <p className="rounded-card border border-dashed border-border-grey bg-white px-4 py-3 text-small text-muted-foreground">
          Research does not create posts or approvals. Nothing here is used
          until you choose it.
        </p>
      ) : null}
      {!openBriefing && canManage && saved ? (
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
                  className="h-[38px] w-16 rounded-control border border-border-grey bg-white px-2 py-1"
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
      ) : !openBriefing ? (
        <p className="text-small text-muted-foreground">
          You cannot run research. Account admins manage the private research
          prompt and run it. You can review the saved findings below.
        </p>
      ) : null}
      {!openBriefing ? scheduleSlot : null}
      {error ? (
        <p role="alert" className="text-small text-danger-strong">
          {error}
        </p>
      ) : null}
      {message || busy ? (
        <p role="status" aria-live="polite" className="text-small">
          {busy
            ? "Working… Keep this page open for the result."
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
      {briefingMissing ? (
        <p role="alert" className="text-small text-danger-strong">
          That briefing is not available. Showing all briefings.
        </p>
      ) : null}
      {openBriefing ? (
        <Card id={`briefing-${openBriefing.id}`}>
          <CardHeader>
            <CardTitle>{outcomes[openBriefing.outcome]}</CardTitle>
            <p className="text-caption text-muted-foreground">
              {new Date(openBriefing.created_at).toLocaleString()} · Prompt
              version {openBriefing.revision} ·{" "}
              {openBriefing.candidate_count} candidate sources
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {openBriefing.outcome === "failed" ? (
              <p className="text-small text-danger-strong">
                This run did not complete. Check provider setup and retry with
                Run now. Any retained candidate evidence is shown below.
              </p>
            ) : null}
            {openBriefing.outcome === "not_configured" ? (
              <p className="text-small text-warning-strong">
                Web research is not configured. This was not an empty successful
                search.
              </p>
            ) : null}
            {openBriefing.coverage_gaps.length ? (
              <div className="rounded-control bg-soft-white p-3">
                <p className="text-small font-medium">
                  Coverage and uncertainty
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-small">
                  {openBriefing.coverage_gaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {openBriefing.findings.map((finding, index) => (
              <article
                key={finding.id}
                className="min-w-0 space-y-3 rounded-control border border-border-grey p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-caption text-muted-foreground">
                      Finding {index + 1}
                    </p>
                    <h3 className="min-w-0 break-words text-body font-medium">
                      {finding.title}
                    </h3>
                  </div>
                </div>
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
                <div className="space-y-2">
                  <p className="text-caption font-medium text-muted-foreground">
                    Sources and dates
                  </p>
                  <ul className="space-y-3">
                    {finding.sources.map((source) => (
                      <EvidenceLink
                        key={source.url}
                        source={source}
                        fetchedAt={
                          openBriefing.candidates.find((c) => c.url === source.url)
                            ?.fetchedAt
                        }
                      />
                    ))}
                  </ul>
                </div>
                {(() => {
                  const entryId =
                    savedNow[finding.id] ?? finding.content_bank_entry_id;
                  if (entryId) {
                    const choice: CalendarEntryChoice = {
                      sourceId: entryId,
                      sourceType: "founder_experience",
                      title: finding.title,
                      typeLabel: "Trend reaction",
                      reuseLabel: "Reusable",
                    };
                    return (
                      <div
                        role="status"
                        className="space-y-3 rounded-control bg-surface-sunken p-3"
                      >
                        <p className="text-small">
                          Finding {index + 1} is now in Content Bank as a trend
                          reaction. Reusable, unused.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {canCreatePosts ? (
                            <Link
                              href={`/client/${clientId}/posts/new?sourceType=founder_experience&sourceId=${encodeURIComponent(entryId)}`}
                              className={buttonVariants({
                                variant: "outline",
                                size: "sm",
                              })}
                            >
                              Create post
                            </Link>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              Create post
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canAddToCalendar}
                            onClick={() => setCalendarEntry(choice)}
                          >
                            Add to Calendar
                          </Button>
                          <Link
                            href={`/client/${clientId}/content-bank`}
                            className="text-small text-link underline"
                          >
                            Open Content Bank
                          </Link>
                        </div>
                        {!canCreatePosts && createPostsReason ? (
                          <p className="text-caption text-muted-foreground">
                            {createPostsReason}
                          </p>
                        ) : null}
                        {!canAddToCalendar && addToCalendarReason ? (
                          <p className="text-caption text-muted-foreground">
                            {addToCalendarReason}
                          </p>
                        ) : null}
                      </div>
                    );
                  }
                  if (finding.approval_status === "archived") return null;
                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="brand"
                          disabled={!!busy || !canSave}
                          onClick={() =>
                            perform("save_finding", async () => {
                              const data = await send(
                                clientId,
                                "save_to_content_bank",
                                { findingId: finding.id },
                              );
                              setSavedNow((current) => ({
                                ...current,
                                [finding.id]: data.entryId,
                              }));
                            })
                          }
                        >
                          {busy === "save_finding"
                            ? "Saving…"
                            : "Save to Content Bank"}
                        </Button>
                        {canManage && !finding.content_idea_id ? (
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
                              })
                            }
                          >
                            Archive finding
                          </Button>
                        ) : null}
                      </div>
                      {!canSave && saveReason ? (
                        <p className="text-caption text-muted-foreground">
                          {saveReason}
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </article>
            ))}
            <details>
              <summary className="cursor-pointer text-small font-medium">
                All discovered candidate sources ({openBriefing.candidates.length})
              </summary>
              <p className="my-2 text-caption text-muted-foreground">
                All URLs returned by this bounded search are retained, including
                candidates that did not become findings. This is not an
                exhaustive inventory of the web.
              </p>
              <ul className="space-y-4">
                {openBriefing.candidates.map((source: Candidate) => (
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
      ) : (
        <>
          {!briefings.length ? (
            <EmptyState
              icon={Search}
              title="No briefings yet"
              description={
                canManage
                  ? "Write a prompt, then run it now or on a schedule."
                  : "An administrator writes the research prompt, then runs it now or on a schedule."
              }
              action={canManage ? (
                <Button
                  type="button"
                  variant="brand"
                  onClick={() => document.getElementById("web-research-prompt")?.focus()}
                >
                  Write a prompt
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-white">
              {briefings.map((briefing) => {
                const createdAt = new Date(briefing.created_at).toLocaleString();
                return (
                  <div
                    key={briefing.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="break-words text-body font-medium text-near-black">
                        {briefing.findings[0]?.title ??
                          outcomes[briefing.outcome]}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {createdAt} · {briefing.candidate_count} sources ·{" "}
                        {outcomes[briefing.outcome]}
                      </p>
                    </div>
                    <Link
                      href={`/client/${clientId}/research?tab=briefings&briefing=${briefing.id}`}
                      aria-label={`Open briefing from ${createdAt}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
          {advancedSlot}
        </>
      )}
      <AddToCalendarDialog
        clientId={clientId}
        entry={calendarEntry}
        onClose={() => setCalendarEntry(null)}
      />
    </div>
  );
}
