"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Rocket } from "lucide-react";

import { EFFECTIVE_ROLE_LABELS } from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import type { AccessibleClient } from "./queries";

export function ClientList({
  clients,
  emptyTitle = "You have no Client Workspaces yet.",
  emptyDescription = "Ask an admin to invite you, or check back once a Client Workspace has been set up for you.",
}: {
  clients: AccessibleClient[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [search] = useState("");

  if (clients.length === 0) {
    return (
      <div className="mt-6 rounded-card border border-border-grey bg-white p-8 text-center">
        <p className="text-body font-medium">
          {emptyTitle}
        </p>
        <p className="mt-1 text-small text-muted-foreground">
          {emptyDescription}
        </p>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filteredClients = query
    ? clients.filter((client) =>
        [client.name, client.agencyName, client.founderName, client.industry]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query)),
      )
    : clients;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* Bento Grid Contextual Filter Chips - Visual Only */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button className="bg-primary text-on-primary rounded-full px-4 py-2 font-label-md text-label-md shadow-md">All Clients</button>
        <button className="bg-surface-container-highest text-on-surface-variant hover:bg-surface-variant transition-colors rounded-full px-4 py-2 font-label-md text-label-md pointer-events-none opacity-60">Recent</button>
        <button className="bg-surface-container-highest text-on-surface-variant hover:bg-surface-variant transition-colors rounded-full px-4 py-2 font-label-md text-label-md pointer-events-none opacity-60">Favorites</button>
        <button className="bg-surface-container-highest text-on-surface-variant hover:bg-surface-variant transition-colors rounded-full px-4 py-2 font-label-md text-label-md pointer-events-none opacity-60">Owned by Me</button>
      </div>

      {filteredClients.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest p-8 flex flex-col items-center justify-center text-center h-64">
          <p className="text-title-md text-on-surface-variant">
            No Client Workspaces match your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <Link
              key={client.id}
              href={`/client/${client.id}/dashboard`}
              className="workspace-card rounded-2xl p-6 border border-outline-variant flex flex-col justify-between h-64 group cursor-pointer bg-surface-container-lowest transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="h-14 w-14 bg-surface-container-high rounded-xl flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                    <Rocket className="w-8 h-8 fill-current opacity-80" />
                  </div>
                  <span className="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-full font-label-sm text-label-sm">
                    {EFFECTIVE_ROLE_LABELS[client.role]}
                  </span>
                </div>
                <h3 className="font-title-lg text-title-lg text-on-surface group-hover:bg-gradient-brand group-hover:text-transparent group-hover:bg-clip-text transition-all font-bold">
                  {client.name}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-1">
                  {client.agencyName || client.founderName || client.industry
                    ? [client.agencyName, client.founderName, client.industry]
                        .filter(Boolean)
                        .join(" | ")
                    : "No business details yet"}
                </p>
              </div>
              
              <div className="flex items-center justify-between border-t border-outline-variant pt-4 mt-auto">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <History className="w-4 h-4" />
                  <span className="font-label-sm text-label-sm">Updated {formatUtcDate(client.updatedAt)}</span>
                </div>
              </div>
            </Link>
          ))}
          
          {/* Add New Client Empty State / Card (For visual parity, non-functional if not agency admin, handled by role if needed. We'll render it as a visual placeholder that redirects or just informative) */}
        </div>
      )}
    </div>
  );
}
