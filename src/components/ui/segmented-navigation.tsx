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

export function SegmentedNavigation<T extends string = string>({
  items,
  activeId,
  onChange,
  className,
}: SegmentedNavigationProps<T>) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 rounded-2xl bg-soft-white p-1.5",
        className
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-small font-medium text-muted-foreground transition-colors hover:text-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2",
              isActive && "bg-white text-near-black shadow-sm font-semibold"
            )}
          >
            {Icon && (
              <Icon
                aria-hidden="true"
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-near-black" : "text-muted-foreground"
                )}
              />
            )}
            <span>{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-caption font-mono font-medium transition-colors",
                  isActive
                    ? "bg-soft-white text-near-black"
                    : "bg-soft-white/60 text-muted-foreground"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
