"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { EFFECTIVE_ROLE_LABELS } from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import type { AccessibleClient } from "./queries";

/** The Companies list: one row per company this person can open. Read-only; there is no create or delete here. */
export function ClientList({ clients }: { clients: AccessibleClient[] }) {
  const [search, setSearch] = useState("");

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No companies yet"
        description="Ask an administrator to add you to a company, or check back once one has been set up."
      />
    );
  }

  const query = search.trim().toLowerCase();
  const filtered = query
    ? clients.filter((client) =>
        [client.name, client.founderName, client.industry]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query)),
      )
    : clients;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search companies"
          aria-label="Search companies"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="No companies match your search" description="Try a different name." />
      ) : (
        <ul className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-xs">
          {filtered.map((client) => (
            <li key={client.id} className="border-t border-border-subtle first:border-t-0">
              <Link
                href={`/client/${client.id}/posts`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-primary-soft text-link">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="break-words text-small font-medium text-near-black">{client.name}</span>
                  <span className="text-caption text-muted-foreground">
                    {[client.founderName, client.industry].filter(Boolean).join(" · ") || "No business details yet"}
                    {" · "}Updated {formatUtcDate(client.updatedAt)}
                  </span>
                </span>
                <Badge variant="neutral">{EFFECTIVE_ROLE_LABELS[client.role]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
