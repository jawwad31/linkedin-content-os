import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Lightbulb,
  Radar,
  Send,
  SlidersHorizontal,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for sidebar nav links and the header's
 * current-page title lookup. Route hrefs stay on their existing paths
 * (e.g. "Setup" still points at /settings) — only the user-facing label
 * changes here.
 */
export function getNavItems(clientId: string): NavItem[] {
  return [
    {
      label: "Dashboard",
      href: `/client/${clientId}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      label: "Setup",
      href: `/client/${clientId}/settings`,
      icon: SlidersHorizontal,
    },
    {
      label: "Research",
      href: `/client/${clientId}/research`,
      icon: Radar,
    },
    {
      label: "Ideas",
      href: `/client/${clientId}/ideas`,
      icon: Lightbulb,
    },
    {
      label: "Publish",
      href: `/client/${clientId}/publish`,
      icon: Send,
    },
  ];
}
