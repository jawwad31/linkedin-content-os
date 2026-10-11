"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AutomationView } from "./contracts";

const notificationLabels = {
  ready: "Briefing ready",
  partial: "Partial research coverage",
  failure: "Research needs attention",
};
export function AutomationPanel({
  clientId,
  view,
}: {
  clientId: string;
  view: AutomationView;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(view.schedule.enabled);
  const [timezone, setTimezone] = useState(view.schedule.timezone);
  const [time, setTime] = useState(view.schedule.local_time.slice(0, 5));
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    enabled !== view.schedule.enabled ||
    timezone !== view.schedule.timezone ||
    time !== view.schedule.local_time.slice(0, 5);
  async function send(action: string, input: unknown) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/client/${clientId}/research-automation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, input }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(
          result.error?.message ?? "Could not save this research action.",
        );
      setMessage(
        action === "schedule"
          ? "Schedule saved."
          : result.data.error
            ? "Source saved, but could not be fully read. Check the URL and retry."
            : result.data.changed === 0
              ? "Source saved. No new content was detected."
              : "Source saved.",
      );
      if (action === "source") setUrl("");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {view.canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Research schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-small text-muted-foreground">
                Run your saved prompt once daily, using its saved lookback and
                profile setting. Missed days produce one catch-up briefing.
                Editing or pausing cancels unfinished scheduled work.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-small">
                  Local time
                  <Input
                    aria-label="Daily research time"
                    type="time"
                    step="60"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="space-y-1 text-small">
                  Timezone
                  <Input
                    aria-label="Research timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Asia/Karachi"
                    disabled={busy}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-small">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={busy}
                />
                Enable daily research
              </label>
              <p className="text-caption text-muted-foreground">
                {view.schedule.enabled
                  ? "Saved schedule enabled"
                  : "Saved schedule paused"}
                . {dirty ? "You have unsaved changes." : ""} Next due:{" "}
                {view.schedule.next_due_at
                  ? new Date(view.schedule.next_due_at).toLocaleString()
                  : "none"}
                . Previous due:{" "}
                {view.schedule.last_due_at
                  ? new Date(view.schedule.last_due_at).toLocaleString()
                  : "none"}
                .
              </p>
              <p className="text-caption text-muted-foreground">
                When daylight saving skips your chosen time, research runs at
                the next valid time. Repeated local times run once. Research
                never starts post drafting or publication.
              </p>
              <Button
                disabled={busy || (!dirty && view.schedule.version > 0)}
                onClick={() =>
                  send("schedule", {
                    version: view.schedule.version,
                    enabled,
                    timezone,
                    time,
                  })
                }
              >
                {busy ? "Saving…" : "Save schedule"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Read an article</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-small text-muted-foreground">
                Import a public article to use alongside your saved prompt. Up
                to four article sources. Add RSS feeds below to follow new
                articles from your preferred publishers.
              </p>
              <label className="block space-y-1 text-small">
                Public URL
                <Input
                  type="url"
                  aria-label="Research source URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  disabled={busy}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !url}
                  onClick={() => send("source", { url, kind: "article" })}
                >
                  Read article
                </Button>
              </div>
              {!view.sources.length ? (
                <p className="text-small text-muted-foreground">
                  No imported articles yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {view.sources.map((source) => (
                    <li
                      key={source.id}
                      className="rounded-card border border-outline-variant p-3 text-small"
                    >
                      <a
                        className="break-all text-link underline"
                        href={source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {source.url}
                      </a>
                      <p>
                        {source.kind === "blog"
                          ? "Retired blog source · history retained"
                          : `Article · ${source.enabled ? "Enabled" : "Paused"}`}{" "}
                        · Checked:{" "}
                        {source.checked_at
                          ? new Date(source.checked_at).toLocaleString()
                          : "not yet"}
                      </p>
                      {source.error_code ? (
                        <p className="text-warning-strong">
                          Could not fully read this source. Earlier revisions
                          are retained.
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {source.kind === "article" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                send("source", {
                                  url: source.url,
                                  kind: source.kind,
                                  sourceId: source.id,
                                  enabled: !source.enabled,
                                })
                              }
                            >
                              {source.enabled
                                ? "Pause source"
                                : "Resume source"}
                            </Button>
                            {source.enabled ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  send("source", {
                                    url: source.url,
                                    kind: source.kind,
                                  })
                                }
                              >
                                Read again
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            send("source", {
                              url: source.url,
                              kind: source.kind,
                              sourceId: source.id,
                              enabled: false,
                              archived: true,
                            })
                          }
                        >
                          Archive source
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {view.versions.length ? (
                <details>
                  <summary className="cursor-pointer text-small font-medium">
                    Saved source revisions ({view.versions.length} recent)
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {view.versions.map((version) => (
                      <li
                        key={version.id}
                        className="rounded-card border border-outline-variant p-3"
                      >
                        <details>
                          <summary className="cursor-pointer break-words text-small">
                            {version.title} · {version.change_kind} · Fetched{" "}
                            {new Date(version.fetched_at).toLocaleString()}
                          </summary>
                          <a
                            className="break-all text-small text-link underline"
                            href={version.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Source link
                          </a>
                          <p className="my-2 text-caption text-muted-foreground">
                            Publication date: unknown. This is the saved text,
                            treated as source material.
                          </p>
                          <p className="whitespace-pre-wrap break-words text-small">
                            {version.content}
                          </p>
                        </details>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Research notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {view.notifications.length ? (
            <ul className="space-y-2">
              {view.notifications.map((n) => (
                <li key={n.id} className="text-small">
                  <Link
                    className="text-link underline"
                    href={`/client/${clientId}/research?tab=briefings&briefing=${n.briefing_id}#briefing-${n.briefing_id}`}
                  >
                    {notificationLabels[n.kind]}
                  </Link>{" "}
                  · {new Date(n.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-muted-foreground">
              Scheduled briefings and failures will appear here.
            </p>
          )}
        </CardContent>
      </Card>
      {message ? (
        <p role="status" className="text-small">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-small text-danger-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
