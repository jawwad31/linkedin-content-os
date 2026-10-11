"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FUNNEL_STAGES, POST_TYPES } from "@/lib/ai/playbooks/taxonomies";
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

export function StandalonePostForm({
  clientId,
  documents,
  documentsUnavailable,
  canUpload,
  initialContentBankSource,
  initialSourceError,
}: {
  clientId: string;
  documents: StandaloneDocumentOption[];
  documentsUnavailable: boolean;
  canUpload: boolean;
  initialContentBankSource: StandaloneContentBankOption | null;
  initialSourceError: string | null;
}) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(Boolean(initialContentBankSource || initialSourceError));
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
  const [takeaway, setTakeaway] = useState("");
  const [pillar, setPillar] = useState("");
  const [postType, setPostType] = useState<"" | StandaloneBriefInput["postType"]>("");
  const [stage, setStage] = useState<"" | StandaloneBriefInput["funnelStage"]>("");
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceCanGenerate = mode !== "content_bank" || Boolean(initialContentBankSource?.eligible);

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
    if (inFlight.current || readingFile) return;
    setError(null);
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
    setPending(true);
    try {
      let savedIdeaId = ideaId;
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
      // Reuse the normal, rate-limited planner/writer/reviewer and existing-post
      // recovery. A failed paid stage leaves the same saved idea available.
      const response = await fetch(`/api/client/${clientId}/ideas/${savedIdeaId}/generate-post`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const payload = await response.json();
      if (!payload.success || typeof payload.data?.postId !== "string") {
        setError(payload.error?.message ?? "Could not draft the saved brief. Please retry.");
        return;
      }
      router.push(`/client/${clientId}/posts/${payload.data.postId}/review`);
      router.refresh();
    } catch {
      setError("Could not finish creating this draft. Retry with the same brief.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Create a standalone post</CardTitle>
          <p className="mt-1 text-small text-muted-foreground">Start with a selected Content Bank entry, your notes, or a source document, then review the draft.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="standalone-post-form">
          {open ? "Hide brief" : "Create post"}
        </Button>
      </CardHeader>
      {open ? <CardContent id="standalone-post-form">
        <form onSubmit={createDraft} className="flex flex-col gap-4">
          {initialSourceError ? <p role="alert" className="rounded-control border border-danger/30 bg-danger/5 p-3 text-small text-danger-strong">{initialSourceError}</p> : null}
          <fieldset disabled={pending || readingFile || !!ideaId} className="flex min-w-0 flex-col gap-4">
            <legend className="sr-only">Source and post brief</legend>
            <label className="flex flex-col gap-1 text-small font-medium">
              Source
              <select value={mode} onChange={(event) => changeMode(event.target.value as typeof mode)} className={selectClass}>
                {initialContentBankSource ? <option value="content_bank">Selected Content Bank entry</option> : null}
                <option value="note">Pasted note or transcript</option>
                <option value="document">Saved source document</option>
                {canUpload ? <option value="upload">Upload .md or .txt</option> : null}
              </select>
            </label>
            {mode === "content_bank" && initialContentBankSource ? <section aria-labelledby="selected-content-bank-source" className="flex flex-col gap-3 rounded-card border border-brand-purple/30 bg-brand-purple/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent-purple">{initialContentBankSource.sourceType === "content_resource" ? "Content resource" : initialContentBankSource.entryType === "trend_reaction" ? "Trend reaction" : "Founder experience"}</Badge>
                <Badge variant="outline">{initialContentBankSource.categoryLabel}</Badge>
                <Badge variant="outline">{initialContentBankSource.readiness}</Badge>
                <Badge variant="neutral">{initialContentBankSource.usageStatus}</Badge>
                <Badge variant="neutral">{initialContentBankSource.allowReuse ? "Reusable" : "Single-use"}</Badge>
                {initialContentBankSource.canOffer ? <Badge variant="success">Comment CTA approved</Badge> : null}
              </div>
              <div>
                <h3 id="selected-content-bank-source" className="text-body font-semibold">{initialContentBankSource.title}</h3>
                <p className="text-caption text-muted-foreground">This exact workspace source will be verified again before the assignment is saved.</p>
              </div>
              {initialContentBankSource.details.length ? <details className="rounded-control border border-border-grey bg-white p-3" open>
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
            </section> : mode === "note" ? <label className="flex flex-col gap-1 text-small font-medium">
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
            <label className="flex flex-col gap-1 text-small font-medium">
              Topic / angle
              <Input value={topic} onChange={(event) => setTopic(event.target.value)} minLength={3} maxLength={500} required placeholder="What should this post explain?" />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium">
              Instructions (optional)
              <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="Your perspective, points to include, and facts to keep private." />
              <span className="text-caption font-normal text-muted-foreground">{instructions.length.toLocaleString()} / 4,000 characters.</span>
            </label>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <label className="flex flex-col gap-1 text-small font-medium">Intended reader (optional)<Input value={reader} onChange={(event) => setReader(event.target.value)} maxLength={500} placeholder="Auto when blank" /></label>
              <label className="flex flex-col gap-1 text-small font-medium">Content pillar (optional)<Input value={pillar} onChange={(event) => setPillar(event.target.value)} maxLength={500} placeholder="Auto when blank" /></label>
            </div>
            <label className="flex flex-col gap-1 text-small font-medium">Main takeaway (optional)<Input value={takeaway} onChange={(event) => setTakeaway(event.target.value)} maxLength={700} placeholder="What should the reader understand or do?" /></label>
            {mode !== "content_bank" || initialContentBankSource?.sourceType !== "content_resource" ? <p className="text-caption text-muted-foreground">For a lead magnet offer, select the approved resource in Content Bank.</p> : null}
          </fieldset>
          {ideaId ? <p role="status" className="text-small">Your brief is saved. Retry uses this same brief. You can also find it in <Link href={`/client/${clientId}/ideas`} className="font-medium text-brand-orange underline">Ideas</Link>.</p> : null}
          {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="brand" disabled={pending || readingFile || !sourceCanGenerate}>{pending ? "Creating draft..." : ideaId ? "Retry draft" : "Create draft"}</Button>
            {(ideaId || error) && mode !== "content_bank" ? <Button type="button" variant="outline" disabled={pending || readingFile} onClick={() => { requestId.current = null; setIdeaId(null); setError(null); }}>Start a new brief</Button> : null}
          </div>
          <p className="text-caption text-muted-foreground">Creating a draft uses your configured AI models. Human approval and manual publishing follow review.</p>
        </form>
      </CardContent> : null}
    </Card>
  );
}
