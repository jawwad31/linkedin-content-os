"use client";

import { useParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  EFFECTIVE_ROLE_LABELS,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { cn } from "@/lib/utils";

import { getNavItems } from "./nav-items";
import { WorkspaceSwitchLink } from "./workspace-switch-link";

export function AppHeader({
  clientId,
  clientName,
  agencyName,
  role,
  accessibleClientCount,
  className,
}: {
  clientId: string;
  clientName: string;
  agencyName: string | null;
  role: EffectiveClientRole;
  accessibleClientCount: number;
  className?: string;
}) {
  const pathname = usePathname();
  const params = useParams<{ post_id?: string }>();

  const activeItem = getNavItems(clientId).find(
    (item) => item.href === pathname,
  );
  const pageTitle = params?.post_id
    ? "Post Review"
    : (activeItem?.label ?? "Overview");

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border-grey bg-surface-container-low/90 px-6 py-4 backdrop-blur-md lg:px-8",
        className,
      )}
    >
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
            {agencyName ? `${agencyName} | ${clientName}` : clientName}
          </span>
          <Badge variant="neutral">{EFFECTIVE_ROLE_LABELS[role]}</Badge>
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
        <WorkspaceSwitchLink
          role={role}
          accessibleClientCount={accessibleClientCount}
          variant="light"
        />
      </div>
    </header>
  );
}
