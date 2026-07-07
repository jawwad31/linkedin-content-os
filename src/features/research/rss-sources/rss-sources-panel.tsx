import { Rss } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { RssSourceCard } from "./rss-source-card";
import { RssSourceForm } from "./rss-source-form";
import type { RssSource } from "./queries";

export function RssSourcesPanel({
  clientId,
  role,
  sources,
}: {
  clientId: string;
  role: ClientRole;
  sources: RssSource[];
}) {
  const canManage = role === "owner" || role === "editor";

  return (
    <div className="flex flex-col gap-4">
      {!canManage ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          Your role is view-only for this client.
        </p>
      ) : null}

      {canManage ? <RssSourceForm clientId={clientId} /> : null}

      {sources.length === 0 ? (
        <EmptyState
          icon={Rss}
          title="No RSS sources yet"
          description="Add trusted industry feeds so Research can collect articles for TrendCards later."
        />
      ) : (
        <div className="flex flex-col gap-3">
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
    </div>
  );
}
