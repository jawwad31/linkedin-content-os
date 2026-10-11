"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { getNavItems, isNavItemActive } from "./nav-items";

/** The sidebar links: 34px rows, a soft cyan wash on the current page. */
export function AppNav({
  clientId,
  showResearch,
  postsNeedingYou = 0,
}: {
  clientId: string;
  showResearch: boolean;
  postsNeedingYou?: number;
}) {
  const pathname = usePathname();
  const items = getNavItems(clientId, { showResearch });

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {items.map((item) => {
        const isActive = isNavItemActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-[34px] items-center gap-2.5 rounded-control px-2.5 text-small transition-colors duration-[140ms] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              isActive
                ? "bg-accent-primary-soft font-medium text-near-black"
                : "text-muted-foreground hover:bg-surface-hover hover:text-near-black",
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
            {item.id === "posts" && postsNeedingYou > 0 ? (
              <span
                className="ml-auto rounded-full bg-violet-700 px-1.5 font-mono text-caption font-medium leading-5 text-white"
                aria-label={`${postsNeedingYou} ${postsNeedingYou === 1 ? "post needs" : "posts need"} you`}
              >
                {postsNeedingYou}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
