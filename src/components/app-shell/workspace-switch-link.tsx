import Link from "next/link";

import type { EffectiveClientRole } from "@/lib/access/roles";

export function WorkspaceSwitchLink({
  role,
  accessibleClientCount,
  variant = "dark",
}: {
  role: EffectiveClientRole;
  accessibleClientCount: number;
  variant?: "dark" | "light";
}) {
  const isAgencyAdmin = role === "agency_admin";
  const shouldShow = isAgencyAdmin || accessibleClientCount > 1;

  if (!shouldShow) {
    return null;
  }

  const href = isAgencyAdmin ? "/agency/workspaces" : "/clients";
  const label = isAgencyAdmin ? "Agency workspaces" : "Switch workspace";
  const className =
    variant === "dark"
      ? "mt-1 rounded-full border border-white/10 px-3 py-1.5 text-center text-small font-medium text-soft-white/70 transition-colors hover:bg-white/10 hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-near-black"
      : "rounded-full border border-border-grey px-4 py-2 text-small font-medium text-near-black transition-colors hover:bg-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2";

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
