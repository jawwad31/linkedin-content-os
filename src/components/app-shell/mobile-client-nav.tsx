"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/logout-button";
import type { EffectiveClientRole } from "@/lib/access/roles";
import { cn } from "@/lib/utils";

import { getNavItems, isNavItemActive } from "./nav-items";
import { WorkspaceSwitchLink } from "./workspace-switch-link";

/** On a phone the sidebar becomes a menu: a slim header with the page name, and a drawer. */
export function MobileClientNav({
  clientId,
  clientName,
  role,
  accessibleClientCount,
  showResearch,
}: {
  clientId: string;
  clientName: string;
  role: EffectiveClientRole;
  accessibleClientCount: number;
  showResearch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const items = getNavItems(clientId, { showResearch });
  const activeItem = items.find((item) => isNavItemActive(pathname, item.href));
  const pageTitle = activeItem?.label ?? "Virel";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-border-subtle bg-white px-4 lg:hidden">
        <div className="min-w-0">
          <p className="truncate text-caption text-muted-foreground">{clientName}</p>
          <h2 className="truncate font-heading text-body-lg font-semibold leading-tight text-near-black">
            {pageTitle}
          </h2>
        </div>
        <Button
          ref={triggerButtonRef}
          type="button"
          size="icon"
          variant="outline"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="mobile-client-navigation"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </Button>
      </header>

      <Dialog.Root open={open} onOpenChange={setOpen} modal>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/55 backdrop-blur-[6px] lg:hidden" />
          <Dialog.Popup
            id="mobile-client-navigation"
            aria-label="Navigation"
            initialFocus={closeButtonRef}
            finalFocus={triggerButtonRef}
            className="fixed inset-y-0 left-0 z-50 flex w-full max-w-[320px] flex-col gap-4 overflow-y-auto bg-white p-5 shadow-2xl lg:hidden"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-heading text-[24px] font-semibold leading-none tracking-[-0.018em] text-near-black">
                Virel
              </span>
              <Dialog.Close
                ref={closeButtonRef}
                type="button"
                aria-label="Close navigation"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <nav aria-label="Main" className="flex flex-col gap-0.5">
              {items.map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-control px-3 text-body transition-colors duration-[140ms] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                      isActive
                        ? "bg-accent-primary-soft font-medium text-near-black"
                        : "text-muted-foreground hover:bg-surface-hover hover:text-near-black",
                    )}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col gap-2 border-t border-border-subtle pt-4">
              <p className="break-words text-small text-muted-foreground">{clientName}</p>
              <WorkspaceSwitchLink
                role={role}
                accessibleClientCount={accessibleClientCount}
                variant="light"
                onClick={() => setOpen(false)}
              />
              <LogoutButton className="w-full justify-start text-muted-foreground" />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
