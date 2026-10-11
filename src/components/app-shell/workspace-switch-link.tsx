import Link from "next/link";

import type { EffectiveClientRole } from "@/lib/access/roles";

export function WorkspaceSwitchLink({
  role,
  accessibleClientCount,
  variant = "dark",
  onClick,
}: {
  role: EffectiveClientRole;
  accessibleClientCount: number;
  variant?: "dark" | "light";
  onClick?: () => void;
}) {
  const isAgencyAdmin = role === "agency_admin";
  const shouldShow = isAgencyAdmin || accessibleClientCount > 1;

  if (!shouldShow) {
    return null;
  }

  const href = isAgencyAdmin ? "/agency/workspaces" : "/clients";
  const label = "Switch workspace";
  const className =
    variant === "dark"
      ? "mt-1 rounded-btn border border-white/10 px-3 py-1.5 text-center text-small font-medium text-soft-white/70 transition-colors hover:bg-white/10 hover:text-soft-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      : "rounded-btn border border-border-default px-3 py-1.5 text-center text-small font-medium text-near-black transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

  return (
    <Link href={href} className={className} onClick={onClick}>
      {label}
    </Link>
  );
}
