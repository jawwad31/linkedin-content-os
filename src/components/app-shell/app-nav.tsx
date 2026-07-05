"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

import { getNavItems, type NavItem } from "./nav-items";

export function AppNav({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const params = useParams<{ post_id?: string }>();

  const items: NavItem[] = getNavItems(clientId);

  if (params?.post_id) {
    items.push({ label: "Post Review", href: pathname, icon: FileText });
  }

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-control border-l-2 border-transparent px-3 py-2 text-small font-medium text-soft-white/60 transition-colors hover:bg-white/5 hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-near-black",
              isActive && "border-brand-orange bg-white/10 text-soft-white",
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
