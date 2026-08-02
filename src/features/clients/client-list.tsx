"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Rocket, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { EFFECTIVE_ROLE_LABELS } from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import type { AccessibleClient } from "./queries";

export function ClientList({
  clients,
  emptyTitle = "You have no Client Workspaces yet.",
  emptyDescription = "Ask an administrator to add your Account access, or check back once an Account has been set up for you.",
}: {
  clients: AccessibleClient[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [search, setSearch] = useState("");

  if (clients.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest p-8 flex flex-col items-center justify-center text-center">
        <p className="text-body font-bold text-on-surface">
          {emptyTitle}
        </p>
        <p className="mt-2 text-small text-on-surface-variant max-w-md">
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
      {/* Functional Search Bar */}
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-on-surface-variant"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search workspaces..."
          aria-label="Search Client Workspaces"
          className="rounded-full pl-12 h-14 bg-surface-container-highest border-transparent hover:bg-surface-variant focus-visible:bg-surface-container-lowest focus-visible:border-primary text-body-lg placeholder:text-on-surface-variant transition-colors"
        />
      </div>

      {filteredClients.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest p-8 flex flex-col items-center justify-center text-center h-64">
          <p className="text-body text-on-surface-variant">
            No Client Workspaces match your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <Link
              key={client.id}
              href={`/client/${client.id}/dashboard`}
              className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-2xl"
            >
              <div className="workspace-card rounded-2xl p-6 border border-outline-variant flex flex-col justify-between h-64 bg-surface-container-lowest transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="h-14 w-14 bg-surface-container-high rounded-xl flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <Rocket className="w-8 h-8 fill-current opacity-80" />
                    </div>
                    <span className="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-full text-caption font-medium">
                      {EFFECTIVE_ROLE_LABELS[client.role]}
                    </span>
                  </div>
                  <h3 className="text-card-title text-on-surface group-hover:bg-gradient-brand group-hover:text-transparent group-hover:bg-clip-text transition-all font-bold">
                    {client.name}
                  </h3>
                  <p className="text-caption text-on-surface-variant mt-1 line-clamp-1">
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
                    <span className="text-caption font-medium">Updated {formatUtcDate(client.updatedAt)}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
