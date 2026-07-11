"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const [search, setSearch] = useState("");

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
    <div className="mt-6 flex flex-col gap-4">
      <div className="relative max-w-xs">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search workspaces..."
          aria-label="Search Client Workspaces"
          className="rounded-full pl-9"
        />
      </div>

      {filteredClients.length === 0 ? (
        <div className="rounded-card border border-border-grey bg-white p-8 text-center">
          <p className="text-body font-medium">
            No Client Workspaces match your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <Link
              key={client.id}
              href={`/client/${client.id}/dashboard`}
              className="hover-lift block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
            >
              <Card className="h-full transition-colors hover:border-brand-orange/50">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-soft-white text-near-black"
                    >
                      <Building2 className="h-5 w-5" />
                    </span>
                    <Badge variant="neutral">
                      {EFFECTIVE_ROLE_LABELS[client.role]}
                    </Badge>
                  </div>
                  <CardTitle className="mt-1">{client.name}</CardTitle>
                  <CardDescription>
                    {client.agencyName || client.founderName || client.industry
                      ? [client.agencyName, client.founderName, client.industry]
                          .filter(Boolean)
                          .join(" | ")
                      : "No business details yet"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <span className="font-mono text-caption text-muted-foreground">
                    Updated {formatUtcDate(client.updatedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-control border border-border-grey px-3 py-1.5 text-small font-medium text-near-black">
                    Open
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
