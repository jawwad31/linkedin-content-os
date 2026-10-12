"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { isPublicWebUrl } from "@/features/research/web-research/contracts";
import {
  exportNewsletter,
  generateNewsletter,
  saveNewsletter,
  transitionNewsletter,
} from "./actions";
import { ArticleView } from "./article-view";
import {
  QA_GATES,
  exportEdition,
  hasPrivateEvidenceLink,
  normalizeQa,
  qaBlocksApproval,
  type Edition,
  type EditionInput,
  type EditionVersion,
  type NewsletterSource,
  type QaIssue,
} from "./contracts";

const SEVERITY_ORDER: QaIssue["severity"][] = [
  "critical",
  "major",
  "moderate",
  "minor",
];
const SEVERITY_BADGE = {
  critical: "danger",
  major: "danger",
  moderate: "warning",
  minor: "neutral",
} as const;
const GATE_LABEL: Record<(typeof QA_GATES)[number], string> = {
  source_boundary: "Stays within the chosen sources",
  numeric_and_date_integrity: "Numbers and dates are right",
  claim_to_evidence: "Claims match the evidence",
  editorial_coherence: "Makes one clear point",
  publishing_integrity: "Honest about what it is",
};

export function ReadScreen({
  clientId,
  edition,
  versions,
  sources,
  canDraft,
  canReview,
  canPublish,
}: {
  clientId: string;
  edition: Edition;
  versions: EditionVersion[];
  sources: NewsletterSource[];
  canDraft: boolean;
  canReview: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const version = versions.find((v) => v.revision === edition.revision)!;
  const payload: EditionInput = version.payload;
  const qa = normalizeQa(version.qa);
  // Editions written before the plan stage hold their text in sections; show that when there is no article.
  const shown = payload.article?.trim()
    ? payload.article
    : payload.sections
        .map((s) => `## ${s.heading}\n\n${s.body}`)
        .join("\n\n");
  const approved =
    edition.status === "approved" && edition.approved_revision === edition.revision;
  const published = edition.status === "published";
  const rejected = edition.status === "rejected";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(shown);
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const [publication, setPublication] = useState({
    url: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const selections = sources.map((s) => ({
    id: s.source_id,
    type: s.source_type,
    reuseConfirmed: false,
  }));
  const titleOf = (id: string) =>
    String(
      sources.find((s) => s.source_id === id)?.snapshot.title ?? "Source",
    );

  const work = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setMessage("");
      try {
        await fn();
      } catch {
        setMessage("Could not complete this action. Refresh and try again.");
      }
    });
  const fail = (m: string) => {
    setMessage(m);
    router.refresh();
  };
  const transition = (
    action: "approve" | "reject" | "publish" | "archive",
    done: string,
  ) =>
    work(async () => {
      const r = await transitionNewsletter(
        clientId,
        edition.id,
        edition.revision,
        action,
        action === "publish" ? publication : undefined,
      );
      if (!r.ok) return fail(r.message);
      setMessage(done);
      if (action === "archive") {
        router.push(`/client/${clientId}/newsletter`);
        return;
      }
      router.refresh();
    });
  const runQa = () =>
    work(async () => {
      setMessage("Checking the edition… this takes under a minute.");
      const r = await generateNewsletter(
        clientId,
        edition.id,
        edition.revision,
        crypto.randomUUID(),
        "qa",
      );
      if (!r.ok) return fail(r.message);
      router.refresh();
    });
  /** An edit is saved as a new version, then checked, so the notes always describe what you see. */
  const saveEdit = () =>
    work(async () => {
      if (hasPrivateEvidenceLink(text)) {
        setMessage("Remove private evidence links from the text first.");
        return;
      }
      setMessage("Saving your edit…");
      const saved = await saveNewsletter(
        clientId,
        edition.id,
        edition.revision,
        crypto.randomUUID(),
        { ...payload, article: text, claims: undefined },
        selections,
      );
      if (!saved.ok) return fail(saved.message);
      setEditing(false);
      setMessage("Checking the edition… this takes under a minute.");
      const checked = await generateNewsletter(
        clientId,
        edition.id,
        saved.revision,
        crypto.randomUUID(),
        "qa",
      );
      if (!checked.ok) return fail(checked.message);
      router.refresh();
    });
  const backToOutline = () =>
    work(async () => {
      const r = await saveNewsletter(
        clientId,
        edition.id,
        edition.revision,
        crypto.randomUUID(),
        { ...payload, article: undefined, claims: undefined },
        selections,
      );
      if (!r.ok) return fail(r.message);
      router.refresh();
    });
  const copy = (download: boolean) =>
    work(async () => {
      const r = await exportNewsletter(clientId, edition.id, edition.revision);
      if (!r.ok) return setMessage(r.message);
      try {
        if (download) {
          const href = URL.createObjectURL(
            new Blob([r.text], { type: "text/plain;charset=utf-8" }),
          );
          const a = document.createElement("a");
          a.href = href;
          a.download = "newsletter-edition.txt";
          a.click();
          URL.revokeObjectURL(href);
          setMessage("Text file exported.");
        } else {
          // Both versions go on the clipboard: an editor that takes formatting gets the
          // headings, lists and links; a plain field gets text with a blank line between blocks.
          if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write)
            await navigator.clipboard.write([
              new ClipboardItem({
                "text/html": new Blob([r.html], { type: "text/html" }),
                "text/plain": new Blob([r.text], { type: "text/plain" }),
              }),
            ]);
          else await navigator.clipboard.writeText(r.text);
          setMessage(
            "Copied. Paste it into the LinkedIn newsletter editor. The first line is the title.",
          );
        }
      } catch {
        setMessage("Copy is unavailable in this browser. Use Export.");
      }
    });

  const tag = published ? (
    <Badge variant="success">✓ Published</Badge>
  ) : approved ? (
    <Badge variant="success">✓ Approved</Badge>
  ) : rejected ? (
    <Badge variant="warning">Edits requested</Badge>
  ) : (
    <Badge variant="info">Needs review</Badge>
  );
  const blocked = qaBlocksApproval(qa);
  const issues = [...(qa?.issues ?? [])].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: "Newsletter", href: `/client/${clientId}/newsletter` },
          { label: payload.title },
        ]}
        action={tag}
      />
      <p className="text-small text-muted-foreground">
        {published
          ? `Version ${edition.revision} · published ${edition.published_on ?? ""}`
          : approved
            ? `Version ${edition.revision} approved`
            : `Version ${edition.revision} · AI draft · Not approved`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-card border border-border-subtle bg-white p-6">
          {editing ? (
            <label className="flex flex-col gap-2 text-small font-medium">
              Edit the edition (plain text with headings and links)
              <Textarea
                className="min-h-[28rem] font-mono text-small"
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          ) : (
            <ArticleView markdown={shown} />
          )}
        </section>

        <aside className="flex h-fit flex-col gap-3 rounded-card border border-border-subtle bg-white p-5">
          <h2 className="text-card-title font-semibold">
            QA notes · {qa?.issues.length ?? 0}
          </h2>
          <p className="text-caption text-muted-foreground">
            Advice only. QA does not approve.
          </p>
          {!qa ? (
            <>
              <p className="text-small">
                QA has not run on this version.
              </p>
              {canDraft ? (
                <Button size="sm" variant="secondary" disabled={busy} onClick={runQa}>
                  Run QA
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-small">
                {qa.decision === "pass"
                  ? "QA found nothing that needs fixing."
                  : qa.decision === "revise"
                    ? "QA suggests edits before you approve."
                    : qa.decision === "replan"
                      ? "QA says the outline needs to change."
                      : "QA found a problem that blocks approval."}
              </p>
              {issues.length ? (
                <ul className="flex flex-col gap-3">
                  {issues.map((issue) => (
                    <li key={issue.id} className="flex flex-col gap-1 text-small">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={SEVERITY_BADGE[issue.severity]}>
                          {issue.severity}
                        </Badge>
                        {issue.location ? (
                          <span className="text-caption text-muted-foreground">
                            {issue.location}
                          </span>
                        ) : null}
                      </span>
                      <span>{issue.problem}</span>
                      {issue.requiredFix ? (
                        <span className="text-muted-foreground">
                          Fix: {issue.requiredFix}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {qa.strengths.length ? (
                <details className="text-small">
                  <summary className="cursor-pointer text-muted-foreground">
                    What works
                  </summary>
                  <ul className="mt-2 list-disc pl-5">
                    {qa.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {Object.keys(qa.gates).length || qa.score !== null ? (
                <details className="text-small">
                  <summary className="cursor-pointer text-muted-foreground">
                    Checks and score
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {QA_GATES.map((g) =>
                      qa.gates[g] ? (
                        <li key={g}>
                          {qa.gates[g] === "pass" ? "✓" : "✕"} {GATE_LABEL[g]}
                        </li>
                      ) : null,
                    )}
                  </ul>
                  {qa.score !== null ? (
                    <p className="mt-2 font-mono text-caption text-muted-foreground">
                      SCORE {qa.score}/100
                    </p>
                  ) : null}
                </details>
              ) : null}
            </>
          )}
        </aside>
      </div>

      <div className="flex flex-col gap-3">
        <p role="status" aria-live="polite" className="text-small text-muted-foreground">
          {message}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {editing ? (
            <>
              <Button
                variant="brand"
                disabled={busy || !text.trim()}
                onClick={saveEdit}
              >
                Save as version {edition.revision + 1} and check
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setText(shown);
                }}
              >
                Cancel
              </Button>
            </>
          ) : approved || published ? (
            <>
              <Button variant="brand" disabled={busy} onClick={() => copy(false)}>
                Copy text
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => copy(true)}>
                Export
              </Button>
              {canDraft && !published ? (
                <Button variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {qa?.decision === "replan" && canDraft ? (
                <Button variant="brand" disabled={busy} onClick={backToOutline}>
                  Back to outline
                </Button>
              ) : null}
              {canReview ? (
                <Button
                  variant={qa?.decision === "replan" ? "secondary" : "brand"}
                  disabled={busy || blocked}
                  onClick={() =>
                    transition("approve", `Version ${edition.revision} approved.`)
                  }
                >
                  Approve version {edition.revision}
                </Button>
              ) : null}
              {canReview && !rejected ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => transition("reject", "Edits requested.")}
                >
                  Request edits
                </Button>
              ) : null}
              {canDraft ? (
                <Button variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
            </>
          )}
        </div>
        <p className="text-caption text-muted-foreground">
          {approved || published
            ? `Virel does not send the newsletter. Editing withdraws approval of version ${edition.revision}.`
            : blocked && qa
              ? "Approval is switched off while QA reports a critical problem. Edit the text or go back to the outline."
              : "Editing saves a new version and clears approval of this one."}
        </p>
      </div>

      <details className="rounded-card border border-border-subtle bg-white p-4">
        <summary className="cursor-pointer text-small font-medium">
          Advanced
        </summary>
        <div className="mt-4 flex flex-col gap-6 text-small">
          {canDraft && !published ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" disabled={busy} onClick={backToOutline}>
                Back to outline
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={runQa}>
                Run QA again
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => transition("archive", "Edition archived.")}
              >
                Archive edition
              </Button>
            </div>
          ) : null}

          {approved && canPublish ? (
            <div className="flex flex-col gap-3">
              <h3 className="font-medium">I published it on LinkedIn</h3>
              <p className="text-muted-foreground">
                After you paste the approved text into LinkedIn, record where it
                went so the sources show as published.
              </p>
              <label className="flex flex-col gap-1.5 font-medium">
                LinkedIn edition URL
                <Input
                  type="url"
                  disabled={busy}
                  value={publication.url}
                  onChange={(e) =>
                    setPublication({ ...publication, url: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5 font-medium">
                Publication date
                <Input
                  type="date"
                  disabled={busy}
                  value={publication.date}
                  onChange={(e) =>
                    setPublication({ ...publication, date: e.target.value })
                  }
                />
              </label>
              <Button
                className="self-start"
                variant="secondary"
                disabled={busy || !publication.url}
                onClick={() => transition("publish", "Recorded as published.")}
              >
                Mark as published
              </Button>
            </div>
          ) : null}
          {published && edition.publication_url ? (
            <p>
              Published {edition.published_on}:{" "}
              <a
                href={edition.publication_url}
                rel="noopener noreferrer"
                target="_blank"
                className="break-all text-link underline"
              >
                Open the LinkedIn edition
              </a>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="font-medium">Sources and evidence</h3>
            {sources.map((s) => (
              <details key={s.source_id} className="rounded-control border border-border-subtle p-3">
                <summary className="cursor-pointer font-medium">
                  {String(s.snapshot.title ?? "Selected source")}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-caption">
                  {JSON.stringify(s.snapshot, null, 2)}
                </pre>
                {s.source_type === "research_finding" &&
                Array.isArray(s.snapshot.sources)
                  ? s.snapshot.sources.map((link, i) =>
                      typeof link?.url === "string" && isPublicWebUrl(link.url) ? (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block break-all text-caption text-link underline"
                        >
                          {String(link.title ?? link.url)}
                        </a>
                      ) : null,
                    )
                  : null}
                <p className="mt-2 text-caption text-muted-foreground">
                  Saved source hash: {s.content_hash}
                </p>
                <Link
                  className="text-caption text-link underline"
                  href={`/client/${clientId}/${s.source_type === "research_finding" ? "research?tab=briefings" : "content-bank"}`}
                >
                  Open source
                </Link>
              </details>
            ))}
          </div>

          {payload.plan?.factLedger?.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">Facts and claims</h3>
              <ul className="flex flex-col gap-2">
                {payload.plan.factLedger.map((f) => (
                  <li key={f.factId}>
                    <span className="font-mono text-caption text-muted-foreground">
                      {f.factId}
                    </span>{" "}
                    {f.claim}{" "}
                    <span className="text-caption text-muted-foreground">
                      ({f.sourceIds.map(titleOf).join(" + ")} ·{" "}
                      {f.writingPermission.replaceAll("_", " ")})
                    </span>
                  </li>
                ))}
              </ul>
              {payload.claims?.length ? (
                <p className="text-caption text-muted-foreground">
                  The writer mapped {payload.claims.length} claim
                  {payload.claims.length === 1 ? "" : "s"} in the text to these
                  facts. A manual edit clears that map.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="font-medium">Version history</h3>
            {versions.map((v) => (
              <details key={v.revision}>
                <summary className="cursor-pointer">
                  Version {v.revision} · {new Date(v.created_at).toLocaleString()}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-small">
                  {v.payload.article?.trim()
                    ? exportEdition(v.payload)
                    : "Outline only. No text yet."}
                </pre>
              </details>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
