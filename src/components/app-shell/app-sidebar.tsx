import { AccountMenu } from "./account-menu";
import { AppNav } from "./app-nav";

/**
 * The 248px app rail: the Virel wordmark, six links, and the account menu (the company name) at the foot.
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

      <div className="border-t border-border-subtle p-3">
        <AccountMenu clientName={clientName} />
      </div>
    </aside>
  );
}
