import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  LayoutDashboard,
  Lightbulb,
  Quote,
  Radar,
  Send,
  Settings,
  FileText,
  Library,
  Layers,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  accent: "orange" | "purple";
};

/**
 * Single source of truth for sidebar nav links and the header's
 * current-page title lookup. Route hrefs stay on their existing paths
 * (e.g. "Settings" still points at /settings) — only the user-facing label
 * changes here. `accent` drives the active-pill color per design.md §9.1:
 * orange for operational sections, purple for intelligence/distribution.
 */
export function getNavItems(clientId: string): NavItem[] {
  return [
    {
      label: "Overview",
      href: `/client/${clientId}/dashboard`,
      icon: LayoutDashboard,
      accent: "orange",
    },
    {
      label: "Content Bank",
      href: `/client/${clientId}/content-bank`,
      icon: Layers,
      accent: "purple",
    },
    {
      label: "Research",
      href: `/client/${clientId}/research`,
      icon: Radar,
      accent: "purple",
    },
    {
      label: "Calendar",
      href: `/client/${clientId}/calendar`,
      icon: CalendarDays,
      accent: "orange",
    },
    {
      label: "Founder Experiences",
      href: `/client/${clientId}/founder-experiences`,
      icon: Quote,
      accent: "purple",
    },
    {
      label: "Ideas",
      href: `/client/${clientId}/ideas`,
      icon: Lightbulb,
      accent: "purple",
    },
    {
      label: "Resources",
      href: `/client/${clientId}/resources`,
      icon: Library,
      accent: "purple",
    },
    {
      label: "Posts",
      href: `/client/${clientId}/posts`,
      icon: FileText,
      accent: "orange",
    },
    {
      label: "Publish",
      href: `/client/${clientId}/publish`,
      icon: Send,
      accent: "purple",
    },
    {
      label: "Newsletter",
      href: `/client/${clientId}/newsletter`,
      icon: FileText,
      accent: "purple",
    },
    {
      label: "Settings",
      href: `/client/${clientId}/settings`,
      icon: Settings,
      accent: "orange",
    },
  ];
}
