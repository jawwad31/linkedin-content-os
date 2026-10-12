"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  AddToCalendarDialog,
  type CalendarEntryChoice,
} from "@/features/calendar/add-to-calendar-dialog";

const GENERIC_ERROR_COPY = "Could not save this article. Nothing was changed.";

/**
 * Save one collected article to the Content Bank as a trend reaction. Once saved it
 * shows the same next steps as a saved finding: Create post, Add to Calendar, Open
 * Content Bank. A control the person lacks the capability for is shown disabled with
 * the reason, never hidden.
 */
export function SaveArticleButton({
  clientId,
  articleId,
  articleTitle,
  savedEntryId,
  canSave,
  saveReason,
  canCreatePosts,
  createPostsReason,
  canAddToCalendar,
  addToCalendarReason,
}: {
  clientId: string;
  articleId: string;
  articleTitle: string;
  savedEntryId: string | null;
  canSave: boolean;
  saveReason?: string | null;
  canCreatePosts: boolean;
  createPostsReason?: string | null;
  canAddToCalendar: boolean;
  addToCalendarReason?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(savedEntryId);
  const [error, setError] = useState<string | null>(null);
  const [calendarEntry, setCalendarEntry] = useState<CalendarEntryChoice | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/client/${clientId}/market-items/${articleId}/save-to-content-bank`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!body.success) {
        setError(
          typeof body?.error?.message === "string" ? body.error.message : GENERIC_ERROR_COPY,
        );
        return;
      }
      setEntryId(body.data.entryId as string);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_COPY);
    } finally {
      setPending(false);
    }
  }

  if (!entryId) {
    return (
      <div className="flex flex-col gap-1">
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !canSave}
            onClick={save}
            className="max-sm:flex-1"
          >
            {pending ? "Saving..." : "Save to Content Bank"}
          </Button>
        </div>
        {!canSave && saveReason ? (
          <p className="text-caption text-muted-foreground">{saveReason}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-small text-danger-strong">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const choice: CalendarEntryChoice = {
    sourceId: entryId,
    sourceType: "founder_experience",
    title: articleTitle,
    typeLabel: "Trend reaction",
    reuseLabel: "Reusable",
  };

  return (
    <div role="status" className="w-full space-y-2 rounded-control bg-surface-sunken p-3">
      <p className="text-small">
        This article is in the Content Bank as a trend reaction. Reusable, unused.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canCreatePosts ? (
          <Link
            href={`/client/${clientId}/posts/new?sourceType=founder_experience&sourceId=${encodeURIComponent(entryId)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
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
        <Link href={`/client/${clientId}/content-bank`} className="text-small text-link underline">
          Open Content Bank
        </Link>
      </div>
      {!canCreatePosts && createPostsReason ? (
        <p className="text-caption text-muted-foreground">{createPostsReason}</p>
      ) : null}
      {!canAddToCalendar && addToCalendarReason ? (
        <p className="text-caption text-muted-foreground">{addToCalendarReason}</p>
      ) : null}
      <AddToCalendarDialog
        clientId={clientId}
        entry={calendarEntry}
        onClose={() => setCalendarEntry(null)}
      />
    </div>
  );
}
