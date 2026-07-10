"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type AgencyNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const AGENCY_NAV_ITEMS: AgencyNavItem[] = [
  { label: "Overview", href: "/agency", icon: LayoutDashboard },
  { label: "Client Workspaces", href: "/agency/workspaces", icon: Building2 },
  { label: "Agency Team", href: "/agency/team", icon: Users },
];

export function AgencyNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
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
              isActive && "bg-gradient-brand font-semibold text-white shadow-sm",
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
