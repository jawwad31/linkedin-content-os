import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  LayoutDashboard,
  Lightbulb,
  Radar,
  Send,
  Settings,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for sidebar nav links and the header's
 * current-page title lookup. Route hrefs stay on their existing paths
 * (e.g. "Settings" still points at /settings) — only the user-facing label
 * changes here.
 */
export function getNavItems(clientId: string): NavItem[] {
  return [
    {
      label: "Overview",
      href: `/client/${clientId}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      label: "Research",
      href: `/client/${clientId}/research`,
      icon: Radar,
    },
    {
      label: "Founder Knowledge",
      href: `/client/${clientId}/founder-experiences`,
      icon: BookOpen,
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
    {
      label: "Settings",
      href: `/client/${clientId}/settings`,
      icon: Settings,
    },
  ];
}
