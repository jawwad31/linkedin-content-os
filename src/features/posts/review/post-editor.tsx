"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const CONNECTION_ERROR =
  "The connection was interrupted, so the result is unknown. Reload the post to see whether the new version was saved before trying again.";

/**
 * Plain text editing. Saving creates the next version and clears approval of the
 * current one; the editor names the version it opened so it cannot overwrite a newer one.
 */
export function PostEditor({
  clientId,
  postId,
  initialText,
  version,
  approved,
}: {
  clientId: string;
  postId: string;
  initialText: string;
  version: number;
  approved: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const reviewHref = `/client/${clientId}/posts/${postId}/review`;
  const unchanged = text.trim() === initialText.trim();

  async function save() {
    if (pending || unchanged || text.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/client/${clientId}/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalPost: text, expectedVersion: version }),
      });
      const payload = await response.json();
      if (!payload.success) {
        setStale(payload?.error?.code === "STALE_VERSION");
        setError(typeof payload?.error?.message === "string" ? payload.error.message : "Could not save. Nothing was changed.");
        return;
      }
      router.push(reviewHref);
      router.refresh();
    } catch {
      setStale(true);
      setError(CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="note" className="flex items-start gap-2 rounded-control border border-warning/40 bg-warning/10 p-3 text-small text-warning-strong">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>Approval.</strong> Saving creates version {version + 1}. Approval applies to one version only
          {approved ? `, so the approval of version ${version} is withdrawn and version ${version + 1} needs approving again` : ", so version " + (version + 1) + " will need approving"}.
        </p>
      </div>

      <label htmlFor={`post-text-${postId}`} className="text-small font-medium text-near-black">
        Post text
      </label>
      <Textarea
        id={`post-text-${postId}`}
        value={text}
        onChange={(event) => { setText(event.target.value); setError(null); }}
        rows={16}
        maxLength={10_000}
        disabled={pending}
        className="font-body leading-relaxed"
      />
      <p className="font-mono text-caption text-muted-foreground">{text.length}/10000</p>

      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-small text-danger-strong">{error}</p>
          {stale ? (
            <Link href={reviewHref} className="text-small text-link underline">Reload the post</Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="brand" disabled={pending || unchanged || text.trim().length === 0} onClick={save}>
          {pending ? "Saving..." : `Save version ${version + 1}`}
        </Button>
        <Link
          href={reviewHref}
          className="inline-flex h-10 items-center rounded-control px-4 text-small font-medium text-near-black hover:bg-soft-white"
        >
          Discard
        </Link>
      </div>
    </div>
  );
}
