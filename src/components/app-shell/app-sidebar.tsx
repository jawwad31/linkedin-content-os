import { LogoutButton } from "@/features/auth/logout-button";

import { AppNav } from "./app-nav";

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "V";
}

/**
 * The 248px app rail: the Virel wordmark, six links, and the company name at the foot.
 * Light surface with a hairline edge, as in the design system's SideNav.
 */
export function AppSidebar({
  clientId,
  clientName,
  showResearch,
  postsNeedingYou,
}: {
  clientId: string;
  clientName: string;
  showResearch: boolean;
  postsNeedingYou: number;
}) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-border-subtle bg-white lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="px-5 pb-4 pt-5">
        <span className="font-heading text-[24px] font-semibold leading-none tracking-[-0.018em] text-near-black">
          Virel
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pt-1">
        <AppNav clientId={clientId} showResearch={showResearch} postsNeedingYou={postsNeedingYou} />
      </div>

      <div className="flex flex-col gap-2 border-t border-border-subtle p-4">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-700 text-[10px] font-semibold text-white"
          >
            {initials(clientName)}
          </span>
          <span className="truncate" title={clientName}>
            {clientName}
          </span>
        </div>
        <LogoutButton className="w-full justify-start text-muted-foreground" />
      </div>
    </aside>
  );
}
