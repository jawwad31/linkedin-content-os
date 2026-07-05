"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { getNavItems } from "./nav-items";

const ROLE_LABELS: Record<ClientRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export function AppHeader({
  clientId,
  clientName,
  role,
}: {
  clientId: string;
  clientName: string;
  role: ClientRole;
}) {
  const pathname = usePathname();
  const params = useParams<{ post_id?: string }>();

  const activeItem = getNavItems(clientId).find(
    (item) => item.href === pathname,
  );
  const pageTitle = params?.post_id ? "Post Review" : (activeItem?.label ?? "Dashboard");

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border-grey bg-white/90 px-6 py-4 backdrop-blur-md lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="truncate text-card-title font-heading font-semibold">
          {pageTitle}
        </h2>
        <span aria-hidden="true" className="hidden text-border-grey sm:inline">
          |
        </span>
        <div className="hidden min-w-0 items-center gap-2 rounded-control border border-border-grey bg-soft-white px-3 py-1 sm:flex">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange"
          />
          <span className="truncate text-caption font-mono font-medium">
            {clientName}
          </span>
          <Badge variant="neutral">{ROLE_LABELS[role]}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <Input
            type="search"
            disabled
            aria-label="Search coming later"
            placeholder="Search coming later"
            className="w-48 rounded-full pl-9 text-caption"
          />
        </div>
        <Link
          href="/clients"
          className="rounded-full border border-border-grey px-4 py-2 text-small font-medium text-near-black transition-colors hover:bg-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
        >
          Switch workspace
        </Link>
      </div>
    </header>
  );
}
