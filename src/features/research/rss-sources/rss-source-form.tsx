"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  createRssSourceAction,
  updateRssSourceAction,
  type RssSourceFormState,
} from "./actions";
import type { RssSource } from "./queries";

const initialState: RssSourceFormState = { error: null, success: null };

export function RssSourceForm({
  clientId,
  source,
  onCancel,
  onSaved,
}: {
  clientId: string;
  source?: RssSource;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const action = source
    ? updateRssSourceAction.bind(null, clientId, source.id)
    : createRssSourceAction.bind(null, clientId);

  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Multiple RssSourceForm instances can be mounted at once (the
  // permanently-visible top entry form plus a card's inline edit form), so
  // field ids must be unique per instance to avoid duplicate-id/label
  // mismatches. `name` stays a plain field name — that's what the server
  // action reads from FormData.
  const idPrefix = useId();
  const sourceNameId = `${idPrefix}-sourceName`;
  const feedUrlId = `${idPrefix}-feedUrl`;
  const categoryId = `${idPrefix}-category`;
  const recencyDaysId = `${idPrefix}-recencyDays`;

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      onSaved?.();
    }
  }, [state.success, onSaved]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-control border border-border-grey bg-soft-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={sourceNameId} className="text-small font-medium">
          Source name
        </label>
        <Input
          id={sourceNameId}
          name="sourceName"
          defaultValue={source?.sourceName ?? ""}
          required
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={feedUrlId} className="text-small font-medium">
          Feed URL
        </label>
        <Input
          id={feedUrlId}
          name="feedUrl"
          type="text"
          inputMode="url"
          placeholder="https://example.com/feed.xml"
          defaultValue={source?.feedUrl ?? ""}
          required
          maxLength={2000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={categoryId} className="text-small font-medium">
          Category
        </label>
        <Input
          id={categoryId}
          name="category"
          placeholder="e.g. Industry news"
          defaultValue={source?.category ?? ""}
          maxLength={100}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={recencyDaysId} className="text-small font-medium">
          Recency window
        </label>
        <Input
          id={recencyDaysId}
          name="recencyDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          step={1}
          defaultValue={source?.recencyDays ?? 30}
          required
        />
        <p className="text-caption text-muted-foreground">
          Collect entries published within this many days.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-control bg-danger/10 px-3 py-2 text-small font-medium text-danger-strong"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-control bg-success/10 px-3 py-2 text-small font-medium text-success-strong">
          {state.success}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="gradient" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : source ? "Save changes" : "Add RSS source"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
