"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CONNECTION_ERROR =
  "The connection was interrupted, so the result is unknown. Reload the post to see whether it was marked as published before trying again.";

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Manual publication in three steps. Virel never posts for you: copy the approved
 * text, post it on LinkedIn yourself, then record where and when.
 */
export function PublishHandoff({
  clientId,
  postId,
  text,
  version,
  canPublish,
}: {
  clientId: string;
  postId: string;
  text: string;
  version: number;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [url, setUrl] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(null);
    } catch {
      setError("Could not copy the text. Select it in the post above and copy it yourself.");
    }
  }

  async function markPublished() {
    if (pending || !canPublish) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/client/${clientId}/posts/${postId}/mark-published`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishedOn: date, linkedinUrl: url.trim() }),
      });
      const payload = await response.json();
      if (!payload.success) {
        setError(typeof payload?.error?.message === "string" ? payload.error.message : "Could not mark this post as published.");
        return;
      }
      router.refresh();
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  const stepClass = "flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4";

  return (
    <section aria-labelledby="publish-handoff" className="flex flex-col gap-3">
      <div>
        <h2 id="publish-handoff" className="text-body font-semibold text-near-black">Publish version {version} on LinkedIn</h2>
        <p className="text-small text-muted-foreground">Manual. Virel does not post for you. Three steps.</p>
      </div>

      <div className={stepClass}>
        <p className="text-small font-medium text-near-black">1. Copy the approved text</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant={copied ? "outline" : "brand"} size="sm" onClick={copy}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy text"}
          </Button>
          <span className="text-caption text-muted-foreground">Version {version} · approved</span>
        </div>
      </div>

      <div className={stepClass}>
        <p className="text-small font-medium text-near-black">2. Post it on LinkedIn</p>
        <div>
          <a
            href="https://www.linkedin.com/feed/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened(true)}
            className="inline-flex h-9 items-center gap-2 rounded-control border border-border-grey bg-white px-4 text-small font-medium text-near-black hover:bg-soft-white"
          >
            Open LinkedIn <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className={stepClass}>
        <p className="text-small font-medium text-near-black">3. Record the post</p>
        <label className="flex flex-col gap-1 text-small text-near-black">
          LinkedIn URL (optional)
          <Input
            type="url"
            inputMode="url"
            placeholder="https://www.linkedin.com/posts/..."
            value={url}
            maxLength={2000}
            disabled={pending || !canPublish}
            onChange={(event) => { setUrl(event.target.value); setError(null); }}
          />
        </label>
        <label className="flex flex-col gap-1 text-small text-near-black">
          Date published
          <Input
            type="date"
            value={date}
            max={todayLocal()}
            disabled={pending || !canPublish}
            onChange={(event) => { setDate(event.target.value); setError(null); }}
          />
        </label>
        {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
        <div className="flex flex-col gap-1">
          <div>
            <Button
              type="button"
              variant={copied || opened ? "brand" : "outline"}
              disabled={!canPublish || pending || !date}
              onClick={markPublished}
            >
              {pending ? "Marking..." : "Mark as published"}
            </Button>
          </div>
          {!canPublish ? (
            <p className="text-caption text-muted-foreground">
              You cannot mark posts as published. Ask an account admin to add the Publish capability.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
