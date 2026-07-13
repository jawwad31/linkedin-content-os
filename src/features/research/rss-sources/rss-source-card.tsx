"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">{source.sourceName}</CardTitle>
            <Badge variant={source.active ? "success" : "neutral"}>
              {source.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="break-all text-small text-muted-foreground">
            {source.feedUrl}
          </p>

          {source.category ? (
            <Badge variant="outline" className="w-fit">
              {source.category}
            </Badge>
          ) : null}

          <Badge variant="outline" className="w-fit">
            Last {source.recencyDays} day{source.recencyDays === 1 ? "" : "s"}
          </Badge>

          {source.lastError ? (
            <p className="text-small text-danger">{source.lastError}</p>
          ) : null}

          {source.lastCheckedAt ? (
            <span className="font-mono text-caption text-muted-foreground">
              Last checked {formatUtcDateTime(source.lastCheckedAt)}
              {source.lastSuccessAt
                ? ` · Last success ${formatUtcDateTime(source.lastSuccessAt)}`
                : ""}
            </span>
          ) : null}

          {toggleState.error ? (
            <p role="alert" className="text-small text-danger">
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
                className="text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
