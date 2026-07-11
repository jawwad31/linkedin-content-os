"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { FileText, Menu, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoutButton } from "@/features/auth/logout-button";
import {
  EFFECTIVE_ROLE_LABELS,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { cn } from "@/lib/utils";

import { getNavItems, type NavItem } from "./nav-items";
import { WorkspaceSwitchLink } from "./workspace-switch-link";

export function MobileClientNav({
  clientId,
  clientName,
  agencyName,
  role,
  accessibleClientCount,
}: {
  clientId: string;
  clientName: string;
  agencyName: string | null;
  role: EffectiveClientRole;
  accessibleClientCount: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useParams<{ post_id?: string }>();
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const items: NavItem[] = getNavItems(clientId);
  if (params?.post_id) {
    items.push({ label: "Post Review", href: pathname, icon: FileText });
  }

  const activeItem = items.find((item) => item.href === pathname);
  const pageTitle = params?.post_id
    ? "Post Review"
    : (activeItem?.label ?? "Overview");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border-grey bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-caption font-mono text-muted-foreground">
              {agencyName ? `${agencyName} / ${clientName}` : clientName}
            </p>
            <h2 className="truncate font-heading text-body font-semibold text-near-black">
              {pageTitle}
            </h2>
          </div>
          <Button
            ref={triggerButtonRef}
            type="button"
            size="icon"
            variant="outline"
            aria-label="Open Client Workspace navigation"
            aria-expanded={open}
            aria-controls="mobile-client-navigation"
            onClick={() => setOpen(true)}
            className="shrink-0"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <Dialog.Root open={open} onOpenChange={setOpen} modal>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/50 lg:hidden" />
          <Dialog.Popup
            id="mobile-client-navigation"
            aria-label="Client Workspace navigation"
            initialFocus={closeButtonRef}
            finalFocus={triggerButtonRef}
            className="fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col gap-5 overflow-y-auto bg-near-black p-5 text-soft-white shadow-2xl lg:hidden"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-gradient-brand font-heading text-sm font-bold text-white shadow-sm"
                >
                  A
                </span>
                <span className="truncate text-small font-heading font-semibold">
                  AIXelerate Content OS
                </span>
              </div>
              <Dialog.Close
                ref={closeButtonRef}
                type="button"
                aria-label="Close navigation"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "shrink-0 text-soft-white hover:bg-white/10 hover:text-white",
                )}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <div className="flex flex-col gap-2 rounded-control border border-white/10 bg-white/5 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption font-mono uppercase tracking-wide text-soft-white/50">
                  Current workspace
                </span>
                <Badge variant="neutral">{EFFECTIVE_ROLE_LABELS[role]}</Badge>
              </div>
              <p className="break-words text-body font-medium">{clientName}</p>
              {agencyName ? (
                <p className="break-words text-caption text-soft-white/50">
                  Agency: {agencyName}
                </p>
              ) : null}
              <WorkspaceSwitchLink
                role={role}
                accessibleClientCount={accessibleClientCount}
                onClick={() => setOpen(false)}
              />
            </div>

            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-soft-white/40"
              />
              <Input
                type="search"
                disabled
                aria-label="Search coming later"
                placeholder="Search coming later"
                className="border-white/10 bg-white/5 pl-9 text-caption text-soft-white placeholder:text-soft-white/40"
              />
            </div>

            <nav aria-label="Client Workspace navigation" className="flex flex-col gap-1">
              {items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-control px-3.5 py-2.5 text-small font-medium text-soft-white/70 transition-colors hover:bg-white/10 hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-near-black",
                      isActive &&
                        "bg-gradient-brand font-semibold text-white shadow-sm",
                    )}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-white/10 pt-4">
              <LogoutButton className="w-full justify-start text-soft-white/70 hover:bg-white/10 hover:text-soft-white" />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
