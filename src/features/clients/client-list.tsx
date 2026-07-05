"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { AccessibleClient } from "./queries";

const ROLE_LABELS: Record<AccessibleClient["role"], string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ClientList({ clients }: { clients: AccessibleClient[] }) {
  const [search, setSearch] = useState("");

  if (clients.length === 0) {
    return (
      <div className="mt-6 rounded-card border border-border-grey bg-white p-8 text-center">
        <p className="text-body font-medium">You have no clients yet.</p>
        <p className="mt-1 text-small text-muted-foreground">
          Ask an owner to invite you, or check back once a client has been
          set up for you.
        </p>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filteredClients = query
    ? clients.filter((client) =>
        [client.name, client.founderName, client.industry]
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
          placeholder="Search clients..."
          aria-label="Search clients"
          className="pl-9"
        />
      </div>

      {filteredClients.length === 0 ? (
        <div className="rounded-card border border-border-grey bg-white p-8 text-center">
          <p className="text-body font-medium">No clients match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <Link
              key={client.id}
              href={`/client/${client.id}/dashboard`}
              className="block h-full rounded-card transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
            >
              <Card className="h-full transition-colors hover:border-brand-orange/50">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{client.name}</CardTitle>
                    <Badge variant="neutral">{ROLE_LABELS[client.role]}</Badge>
                  </div>
                  <CardDescription>
                    {client.founderName || client.industry
                      ? [client.founderName, client.industry]
                          .filter(Boolean)
                          .join(" · ")
                      : "No business details yet"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <span className="font-mono text-caption text-muted-foreground">
                    Updated {formatUpdatedAt(client.updatedAt)}
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
