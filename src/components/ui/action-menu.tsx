"use client";

import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionMenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  /** Set when the person may not use this action: the item stays visible, disabled, with this reason. */
  disabledReason?: string | null;
};

/**
 * The "..." menu at the end of a list row: the design system's overflow menu, a 210px
 * raised card with 5px-radius items. Keyboard and screen-reader behavior come from base-ui.
 */
export function ActionMenu({
  label,
  items,
  disabled = false,
}: {
  label: string;
  items: ActionMenuItem[];
  disabled?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        disabled={disabled}
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "sm:h-[30px] sm:w-[30px]")}
      >
        <MoreHorizontal aria-hidden="true" className="h-[18px] w-[18px]" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="flex w-[210px] flex-col gap-0.5 rounded-card border border-border-default bg-white p-1.5 shadow-md outline-none">
            {items.map((item) => {
              const Icon = item.icon;
              const disabled = Boolean(item.disabledReason);
              return (
                <Menu.Item
                  key={item.label}
                  disabled={disabled}
                  onClick={disabled ? undefined : item.onSelect}
                  className={cn(
                    "flex cursor-default flex-col gap-0.5 rounded-control px-2.5 py-2 text-small outline-none data-[highlighted]:bg-surface-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
                    item.destructive ? "text-danger-strong" : "text-near-black",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    {Icon ? <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" /> : null}
                    {item.label}
                  </span>
                  {disabled ? <span className="text-caption text-muted-foreground">{item.disabledReason}</span> : null}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
