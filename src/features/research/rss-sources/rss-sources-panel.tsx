"use client";

import { Plus, Rss } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  canRoleManageResearchSources,
  type EffectiveClientRole,
} from "@/lib/access/roles";

import { RssSourceCard } from "./rss-source-card";
import { RssSourceForm } from "./rss-source-form";
import type { RssSource } from "./queries";

export function RssSourcesPanel({
  clientId,
  role,
  sources,
}: {
  clientId: string;
  role: EffectiveClientRole;
  sources: RssSource[];
}) {
  const canManage = canRoleManageResearchSources(role);
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {!canManage ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          Account Users cannot manage RSS sources.
        </p>
      ) : null}

      {sources.length === 0 ? (
        <EmptyState
          icon={Rss}
          title="No RSS sources yet"
          description="Add trusted industry feeds so Research can collect articles for TrendCards later."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sources.map((source) => (
            <RssSourceCard
              key={source.id}
              clientId={clientId}
              role={role}
              source={source}
            />
          ))}
        </div>
      )}

      {canManage ? (
        isAddOpen ? (
          <RssSourceForm
            clientId={clientId}
            onCancel={() => setIsAddOpen(false)}
            onSaved={() => setIsAddOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 self-start rounded-control px-1 py-1 text-small font-medium text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add RSS source
          </button>
        )
      ) : null}
    </div>
  );
}
