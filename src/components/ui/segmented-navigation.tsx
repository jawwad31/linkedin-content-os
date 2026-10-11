"use client";

import type { ElementType } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedNavigationItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ElementType;
  count?: number;
}

interface SegmentedNavigationProps<T extends string = string> {
  items: SegmentedNavigationItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
}

/**
 * Underline tabs (the design system's Tabs): a hairline under the row, the active tab
 * in primary text with a 2px cyan underline, counts in small monospace.
 */
export function SegmentedNavigation<T extends string = string>({
  items,
  activeId,
  onChange,
  className,
}: SegmentedNavigationProps<T>) {
  return (
    <div
      role="tablist"
      className={cn("flex flex-wrap items-center gap-x-6 border-b border-border-subtle", className)}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              "-mb-px inline-flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-px text-small transition-colors duration-[140ms] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              isActive
                ? "border-cyan-500 font-medium text-near-black"
                : "text-muted-foreground hover:text-near-black",
            )}
          >
            {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
            <span>{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span className="font-mono text-[11px] font-normal text-muted-foreground">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
