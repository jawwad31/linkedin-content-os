"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FUNNEL_STAGES, POST_TYPES } from "@/lib/ai/playbooks/taxonomies";
import { draftFailureCopy, formatElapsed, reuseNotice } from "./drafting-copy";
import {
  STANDALONE_SOURCE_MAX_BYTES,
  type StandaloneBriefInput,
  type StandaloneContentBankOption,
  type StandaloneDocumentOption,
} from "./standalone-brief-schema";

const POST_LABELS: Record<(typeof POST_TYPES)[number], string> = {
  framework: "Explainer", case_study: "Case study", contrarian_take: "Opinion / analysis",
  how_to: "Tutorial / walkthrough", teardown: "Comparison / decision guide",
  listicle: "Checklist / curated list", story: "Story / lesson", lead_magnet_offer: "Resource offer",
};
const selectClass = "rounded-control border border-border-grey bg-white px-3 py-2 text-small";

type Step = "saving" | "writing";

/**
 * The Create post screen (wireframes a2, s7, s8). The source sits on top with a Change
 * link and its reuse notice, then the seven editable fields, then one Draft post button.
 * Drafting is one request, so the progress view names only what is really known: the
 * brief is saved, then the draft is written and checked in a single step.
 */
export function StandalonePostForm({
  clientId,
  documents,
  documentsUnavailable,
  canUpload,
  initialContentBankSource,
  initialSourceError,
  draftBlockedReason,
}: {
  clientId: string;
  documents: StandaloneDocumentOption[];
  documentsUnavailable: boolean;
  canUpload: boolean;
  initialContentBankSource: StandaloneContentBankOption | null;
  initialSourceError: string | null;
  /** Set when the person cannot draft: the form stays visible and Draft post is disabled with this line. */
  draftBlockedReason: string | null;
}) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [mode, setMode] = useState<"note" | "document" | "upload" | "content_bank">(
    initialContentBankSource ? "content_bank" : "note",
  );
  const [notes, setNotes] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [file, setFile] = useState<{ filename: string; contentText: string } | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [topic, setTopic] = useState(initialContentBankSource?.title ?? "");
  const [instructions, setInstructions] = useState("");
  const [reader, setReader] = useState("");
  const [takeaway, setTakeaway] = useState(initialContentBankSource?.suggestedTakeaway ?? "");
  const [pillar, setPillar] = useState("");
  const [postType, setPostType] = useState<"" | StandaloneBriefInput["postType"]>("");
  const [stage, setStage] = useState<"" | StandaloneBriefInput["funnelStage"]>("");
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<Step>("saving");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // True once the brief is saved but drafting did not finish (wireframe s7).
  const [draftStopped, setDraftStopped] = useState(false);
  const sourceCanGenerate = mode !== "content_bank" || Boolean(initialContentBankSource?.eligible);
  const blocked = draftBlockedReason !== null;

  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  function changeMode(nextMode: typeof mode) {
    setMode(nextMode);
    if (
      postType === "lead_magnet_offer" &&
      !(nextMode === "content_bank" && initialContentBankSource?.canOffer)
    ) {
      setPostType("");
    }
  }

  async function readFile(selected?: File) {
    setFile(null);
    setError(null);
    if (!selected) return;
    if (!/\.(md|txt)$/.test(selected.name) || selected.size > STANDALONE_SOURCE_MAX_BYTES || !selected.size) {
      setError("Choose a nonempty .md or .txt file, up to 128 KB.");
      return;
    }
    setReadingFile(true);
    try {
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await selected.arrayBuffer());
      if (!text.trim() || text.includes("\0")) throw new Error("Invalid text");
      setFile({ filename: selected.name, contentText: text });
    } catch {
      setError("We could not read this UTF-8 text file. Choose a .md or .txt source.");
    } finally {
      setReadingFile(false);
    }
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || readingFile || blocked) return;
    setError(null);
    setDraftStopped(false);
    if (!ideaId && ((mode === "note" && notes.length > 4000) || instructions.length > 4000)) {
      setError("Notes and instructions each support 4,000 characters. Use a document for a longer source; your text has not been shortened.");
      return;
    }
    if (!ideaId && mode === "content_bank" && (!initialContentBankSource || !initialContentBankSource.eligible)) {
      setError(initialContentBankSource?.eligibilityMessage ?? "Choose an eligible Content Bank entry.");
      return;
    }
    if (!ideaId && ((mode === "note" && !notes.trim()) || (mode === "document" && !documentId) || (mode === "upload" && !file))) {
      setError("Add a note or choose a source document.");
      return;
    }
    inFlight.current = true;
    setStep("saving");
    setElapsed(0);
    setPending(true);
    let savedIdeaId = ideaId;
    try {
      if (!savedIdeaId) {
        requestId.current ??= crypto.randomUUID();
        const source: StandaloneBriefInput["source"] = mode === "note" ? { mode, notes }
          : mode === "document" ? { mode, documentId }
          : mode === "upload" ? { mode: "upload", ...file! }
          : {
              mode: "content_bank",
              sourceId: initialContentBankSource!.id,
              sourceType: initialContentBankSource!.sourceType,
            };
        const input: StandaloneBriefInput = {
          requestId: requestId.current, source, topic, instructions,
          intendedReader: reader, primaryTakeaway: takeaway, contentPillar: pillar,
          ...(postType ? { postType } : {}), ...(stage ? { funnelStage: stage } : {}),
        };
        const response = await fetch(`/api/client/${clientId}/posts/standalone`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
        });
        const payload = await response.json();
        if (!payload.success || typeof payload.data?.ideaId !== "string") {
          setError(payload.error?.message ?? "Could not save the brief. Please try again.");
          return;
        }
        savedIdeaId = payload.data.ideaId;
        setIdeaId(savedIdeaId);
      }
      setStep("writing");
      // Reuse the normal, rate-limited planner/writer/reviewer and existing-post
      // recovery. A failed paid stage leaves the same saved idea available.
      const response = await fetch(`/api/client/${clientId}/ideas/${savedIdeaId}/generate-post`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const payload = await response.json();
      if (!payload.success || typeof payload.data?.postId !== "string") {
        setError(payload.error?.message ?? "Could not draft the saved brief.");
        setDraftStopped(true);
        return;
      }
      router.push(`/client/${clientId}/posts/${payload.data.postId}/review`);
      router.refresh();
    } catch {
      setError("The connection was interrupted, so the result is not known.");
      setDraftStopped(Boolean(savedIdeaId));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function editFields() {
    requestId.current = null;
    setIdeaId(null);
    setError(null);
    setDraftStopped(false);
  }

  const fromBank = mode === "content_bank" && Boolean(initialContentBankSource);

  if (pending) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Drafting your post</CardTitle>
          <span className="font-mono text-small text-muted-foreground" aria-hidden="true">{formatElapsed(elapsed)}</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4" role="status" aria-live="polite">
          <ol className="flex flex-col gap-2 text-small">
            <li className="flex items-center gap-2">
              <span aria-hidden="true">{step === "saving" ? "◔" : "✓"}</span>
              {step === "saving" ? "Saving your source and fields" : "Source and fields saved"}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true">{step === "writing" ? "◔" : "○"}</span>
              <span className={step === "writing" ? undefined : "text-muted-foreground"}>Writing the draft and running QA checks</span>
            </li>
          </ol>
          <p className="text-caption text-muted-foreground">
            Usually 20 to 60 seconds. Keep this page open: when the draft is ready you go straight to it for review.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (draftStopped && ideaId) {
    const copy = draftFailureCopy(fromBank);
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="danger">Stopped</Badge>
            <CardTitle>Drafting stopped</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div role="alert" className="flex flex-col gap-1 text-small">
            <p>{copy.headline}</p>
            <p className="text-muted-foreground">{copy.detail}</p>
            {error ? <p className="text-caption text-muted-foreground">{error}</p> : null}
          </div>
          <form onSubmit={createDraft} className="flex flex-wrap gap-3">
            <Button type="submit" variant="brand" disabled={blocked}>Try again</Button>
            {fromBank ? null : <Button type="button" variant="outline" onClick={editFields}>Edit fields</Button>}
            {fromBank ? <Link href={`/client/${clientId}/content-bank`} className="inline-flex h-9 items-center text-small text-link underline">Back to Content Bank</Link> : null}
          </form>
          {blocked ? <p className="text-small text-muted-foreground">{draftBlockedReason}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={createDraft} className="flex flex-col gap-5">
          {initialSourceError ? <p role="alert" className="rounded-control border border-danger/30 bg-danger/5 p-3 text-small text-danger-strong">{initialSourceError}</p> : null}
          <fieldset disabled={readingFile || blocked} className="flex min-w-0 flex-col gap-5">
            <legend className="sr-only">Source and post brief</legend>

            <section aria-labelledby="create-post-source" className="flex flex-col gap-3">
              <h2 id="create-post-source" className="text-card-title font-medium text-near-black">Source</h2>
              {fromBank && initialContentBankSource ? (
                <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-sunken p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-caption text-muted-foreground">Content Bank entry</p>
                      <p id="selected-content-bank-source" className="break-words text-body font-medium text-near-black">{initialContentBankSource.title}</p>
                    </div>
                    <Link href={`/client/${clientId}/content-bank`} className="inline-flex min-h-[38px] items-center text-small text-link underline sm:min-h-0">Change</Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="accent-purple">{initialContentBankSource.sourceType === "content_resource" ? "Resource" : initialContentBankSource.entryType === "trend_reaction" ? "Trend reaction" : "Experience"}</Badge>
                    <Badge variant="neutral">{initialContentBankSource.allowReuse ? "Reusable" : "Single-use"}</Badge>
                    <Badge variant="neutral">{`${initialContentBankSource.usageStatus[0].toUpperCase()}${initialContentBankSource.usageStatus.slice(1)}`}</Badge>
                    {initialContentBankSource.canOffer ? <Badge variant="success">Comment CTA approved</Badge> : null}
                  </div>
                  <p className="text-small text-muted-foreground">{reuseNotice(initialContentBankSource.allowReuse)}</p>
                  {initialContentBankSource.details.length ? <details className="rounded-control border border-border-grey bg-white p-3">
                    <summary className="cursor-pointer text-small font-medium">Review source details</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {initialContentBankSource.details.map((detail) => <div key={detail.label} className="min-w-0">
                        <p className="text-caption font-medium text-muted-foreground">{detail.label}</p>
                        <p className="whitespace-pre-wrap break-words text-small">{detail.value}</p>
                      </div>)}
                    </div>
                  </details> : null}
                  {!initialContentBankSource.eligible ? <p role="alert" className="text-small text-danger-strong">{initialContentBankSource.eligibilityMessage}</p> : null}
                  {initialContentBankSource.sourceType === "content_resource" && !initialContentBankSource.canOffer ? <p className="text-caption text-muted-foreground">This resource can inform an educational post. A Resource offer remains unavailable until its comment CTA and delivery details are approved.</p> : null}
                </div>
              ) : <>
                <label className="flex flex-col gap-1 text-small font-medium">
                  Source
                  <select value={mode} onChange={(event) => changeMode(event.target.value as typeof mode)} className={selectClass}>
                    <option value="note">Pasted note or transcript</option>
                    <option value="document">Saved source document</option>
                    {canUpload ? <option value="upload">Upload .md or .txt</option> : null}
                  </select>
                </label>
                <p className="text-caption text-muted-foreground">
                  To write from an experience, trend reaction or resource, choose it in{" "}
                  <Link href={`/client/${clientId}/content-bank`} className="text-link underline">Content Bank</Link> and press Create post.
                </p>
                {mode === "note" ? <label className="flex flex-col gap-1 text-small font-medium">
                  Source notes
                  <Textarea rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} required placeholder="Paste what happened, what you learned, or the material this post should use." />
                  <span className="text-caption font-normal text-muted-foreground">{notes.length.toLocaleString()} / 4,000 characters. For longer sources, use a document.</span>
                </label> : mode === "document" ? <label className="flex flex-col gap-1 text-small font-medium">
                  Ready source document
                  <select className={selectClass} value={documentId} onChange={(event) => setDocumentId(event.target.value)} required>
                    <option value="">Choose a document</option>
                    {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.filename} (v{doc.version})</option>)}
                  </select>
                  {documentsUnavailable ? <span role="alert" className="text-caption font-normal text-danger-strong">Source documents could not be loaded. Refresh the page, paste a note or upload a file.</span>
                    : !documents.length ? <span className="text-caption font-normal text-muted-foreground">No ready source documents. Paste a note or upload a file.</span> : null}
                </label> : <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-small font-medium">
                    Source file (.md / .txt)
                    <Input type="file" accept=".md,.txt" onChange={(event) => { void readFile(event.target.files?.[0]); }} required={!file} />
                  </label>
                  {readingFile ? <p role="status" className="text-small">Reading file...</p> : null}
                  {file ? <><p className="break-words text-small">{file.filename}</p><Textarea aria-label="Source file preview" value={file.contentText} rows={6} readOnly /></> : null}
                </div>}
                {mode === "document" || mode === "upload" ? <p className="text-caption text-muted-foreground">UTF-8 source files up to 128 KB are used in full and kept private. Larger originals remain in your document library; supply a smaller file or a relevant note for this draft.</p> : null}
              </>}
            </section>

            <section aria-labelledby="create-post-fields" className="flex flex-col gap-4">
              <h2 id="create-post-fields" className="text-card-title font-medium text-near-black">Post</h2>
              <label className="flex flex-col gap-1 text-small font-medium">
                Topic
                <Input value={topic} onChange={(event) => setTopic(event.target.value)} minLength={3} maxLength={500} required placeholder="What should this post explain?" />
              </label>
              <label className="flex flex-col gap-1 text-small font-medium">
                Instructions (optional)
                <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="Your perspective, points to include, and facts to keep private." />
                <span className="text-caption font-normal text-muted-foreground">{instructions.length.toLocaleString()} / 4,000 characters.</span>
              </label>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-small font-medium">Intended reader (optional)<Input value={reader} onChange={(event) => setReader(event.target.value)} maxLength={500} placeholder="Auto when blank" /></label>
                <label className="flex flex-col gap-1 text-small font-medium">Takeaway (optional)<Input value={takeaway} onChange={(event) => setTakeaway(event.target.value)} maxLength={700} placeholder="What should the reader understand or do?" /></label>
                <label className="flex flex-col gap-1 text-small font-medium">Pillar (optional)<Input value={pillar} onChange={(event) => setPillar(event.target.value)} maxLength={500} placeholder="Auto when blank" /></label>
                <label className="flex flex-col gap-1 text-small font-medium">Post type
                  <select className={selectClass} value={postType} onChange={(event) => setPostType(event.target.value as typeof postType)}>
                    <option value="">Auto</option>
                    {POST_TYPES.filter((type) => type !== "lead_magnet_offer" || (mode === "content_bank" && initialContentBankSource?.canOffer)).map((type) => <option key={type} value={type}>{POST_LABELS[type]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-small font-medium">Funnel stage
                  <select className={selectClass} value={stage} onChange={(event) => setStage(event.target.value as typeof stage)}>
                    <option value="">Auto</option>{FUNNEL_STAGES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-caption text-muted-foreground">
                {fromBank ? "Topic and takeaway start from the entry. " : ""}Anything left blank or on Auto is chosen for you.
                {mode !== "content_bank" || initialContentBankSource?.sourceType !== "content_resource" ? " For a lead magnet offer, select the approved resource in Content Bank." : ""}
              </p>
            </section>
          </fieldset>
          {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="brand" disabled={readingFile || blocked || !sourceCanGenerate}>Draft post</Button>
              <Link href={`/client/${clientId}/posts`} className="inline-flex min-h-[38px] items-center text-small text-link underline sm:min-h-0">Cancel</Link>
            </div>
            {blocked ? <p className="text-small text-muted-foreground">{draftBlockedReason}</p> : null}
            <p className="text-caption text-muted-foreground">Drafting uses your configured AI models. A person still reviews and approves the draft before anything is published by hand.</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
