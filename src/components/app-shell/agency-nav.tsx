"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type AgencyNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const AGENCY_NAV_ITEMS: AgencyNavItem[] = [
  { label: "Overview", href: "/agency", icon: LayoutDashboard },
  { label: "Client Workspaces", href: "/agency/workspaces", icon: Building2 },
  { label: "Agency Settings", href: "/agency/settings", icon: Settings },
];

export function AgencyNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {AGENCY_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-small font-medium text-soft-white/60 transition-colors hover:bg-white/10 hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-near-black",
              isActive && "bg-secondary-dark font-semibold text-white shadow-sm",
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
