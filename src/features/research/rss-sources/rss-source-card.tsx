"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canRoleManageResearchSources,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDateTime } from "@/lib/format/date";

import {
  archiveRssSourceAction,
  toggleRssSourceActiveAction,
  type ArchiveRssSourceState,
  type ToggleRssSourceState,
} from "./actions";
import { RssSourceForm } from "./rss-source-form";
import type { RssSource } from "./queries";

const archiveInitialState: ArchiveRssSourceState = { error: null };
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
  const [mode, setMode] = useState<"view" | "edit" | "confirm-archive">("view");
  const [archiveState, archiveAction, isArchiving] = useActionState(
    archiveRssSourceAction.bind(null, clientId, source.id),
    archiveInitialState,
  );
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
          mode === "confirm-archive" ? (
            <form
              action={archiveAction}
              className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3"
            >
              <p className="text-small font-medium">
                Archive this RSS source? It will be hidden from the list but
                not deleted.
              </p>
              {archiveState.error ? (
                <p role="alert" className="text-small text-danger">
                  {archiveState.error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={isArchiving}
                >
                  {isArchiving ? "Archiving..." : "Confirm archive"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode("view")}
                  disabled={isArchiving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
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
                onClick={() => setMode("confirm-archive")}
              >
                Archive
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
