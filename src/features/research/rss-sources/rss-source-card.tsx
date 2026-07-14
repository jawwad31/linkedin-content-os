"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import {
  canRoleManageResearchSources,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDateTime } from "@/lib/format/date";

import {
  toggleRssSourceActiveAction,
  type ToggleRssSourceState,
} from "./actions";
import { RssSourceForm } from "./rss-source-form";
import type { RssSource } from "./queries";

const toggleInitialState: ToggleRssSourceState = { error: null };

export function RssSourceCard({
  clientId,
  role,
  source,
}: {
  clientId: string;
  role: EffectiveClientRole;
  source: RssSource;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [toggleState, toggleAction, isToggling] = useActionState(
    toggleRssSourceActiveAction.bind(null, clientId, source.id),
    toggleInitialState,
  );

  const canManage = canRoleManageResearchSources(role);

  if (mode === "edit") {
    return (
      <RssSourceForm
        clientId={clientId}
        source={source}
        onCancel={() => setMode("view")}
        onSaved={() => setMode("view")}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-near-black">
              {source.sourceName}
            </p>
            <p
              className="truncate text-small text-muted-foreground"
              title={source.feedUrl}
            >
              {source.feedUrl}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {source.category ? (
              <Badge variant="outline" className="w-fit">
                {source.category}
              </Badge>
            ) : null}
            <Badge variant="outline" className="w-fit">
              Last {source.recencyDays} day{source.recencyDays === 1 ? "" : "s"}
            </Badge>
            <Badge variant={source.active ? "success" : "neutral"} className="w-fit">
              {source.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        {source.lastCheckedAt ? (
          <span className="break-words font-mono text-caption text-muted-foreground">
            Last checked {formatUtcDateTime(source.lastCheckedAt)}
            {source.lastSuccessAt
              ? ` · Last success ${formatUtcDateTime(source.lastSuccessAt)}`
              : ""}
          </span>
        ) : null}

        {source.lastError ? (
          <p className="break-words text-small text-danger-strong">{source.lastError}</p>
        ) : null}

        {toggleState.error ? (
          <p role="alert" className="text-small text-danger-strong">
            {toggleState.error}
          </p>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode("edit")}
            >
              Edit
            </Button>
            <form action={toggleAction}>
              <Button type="submit" variant="outline" size="sm" disabled={isToggling}>
                {isToggling ? "Updating..." : source.active ? "Deactivate" : "Activate"}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger-strong hover:bg-danger/10 hover:text-danger-strong"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <DestructiveConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        recordType="RSS Source"
        recordTitle={source.sourceName}
        onConfirm={async () => {
          const res = await fetch(`/api/client/${clientId}/rss-sources/${source.id}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = await res.json();
            return {
              ok: false,
              error: data.error?.message || "Failed to delete RSS source.",
            };
          }
          return { ok: true };
        }}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}
