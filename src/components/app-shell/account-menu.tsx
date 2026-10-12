"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, KeyRound, LogOut, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logout } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "V";
}

type AccountMenuEntry = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
};

/**
 * The account at the foot of the rail. It shows only the company name; the account actions
 * (Change password, Log out) appear when it is clicked. More entries, such as profile
 * settings, belong in the `entries` list below.
 */
export function AccountMenu({
  clientName,
  className,
}: {
  clientName: string;
  className?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  const entries: AccountMenuEntry[] = [
    {
      label: "Change password",
      icon: KeyRound,
      onSelect: () => router.push("/account/password"),
    },
    {
      label: signingOut ? "Logging out…" : "Log out",
      icon: LogOut,
      onSelect: () => startSignOut(() => logout()),
    },
  ];

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account menu for ${clientName}`}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-control px-2 py-1.5 text-left text-small text-near-black transition-colors duration-[140ms] hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] data-[popup-open]:bg-surface-hover",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-700 text-[10px] font-semibold text-white"
        >
          {initials(clientName)}
        </span>
        <span className="min-w-0 flex-1 truncate" title={clientName}>
          {clientName}
        </span>
        <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6} className="z-[70]">
          <Menu.Popup className="flex w-[216px] flex-col gap-0.5 rounded-card border border-border-default bg-white p-1.5 shadow-md outline-none">
            {entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <Menu.Item
                  key={entry.label}
                  onClick={entry.onSelect}
                  className="flex cursor-default items-center gap-2.5 rounded-control px-2.5 py-2 text-small text-near-black outline-none data-[highlighted]:bg-surface-hover"
                >
                  <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                  {entry.label}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
