import type { LucideIcon } from "lucide-react";
import { CalendarDays, FileText, Layers, Mail, Radar, Settings } from "lucide-react";

export type NavItem = {
  id: "content-bank" | "calendar" | "posts" | "newsletter" | "research" | "settings";
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for the sidebar and the phone menu. Six items: Content Bank,
 * Calendar, Posts, Newsletter, Research and Settings. Research is hidden from people
 * without the Research capability; everything else is shown to every member.
 */
export function getNavItems(
  clientId: string,
  options: { showResearch?: boolean } = {},
): NavItem[] {
  const { showResearch = true } = options;
  const base = `/client/${clientId}`;

  return [
    { id: "content-bank", label: "Content Bank", href: `${base}/content-bank`, icon: Layers },
    { id: "calendar", label: "Calendar", href: `${base}/calendar`, icon: CalendarDays },
    { id: "posts", label: "Posts", href: `${base}/posts`, icon: FileText },
    { id: "newsletter", label: "Newsletter", href: `${base}/newsletter`, icon: Mail },
    ...(showResearch ? [{ id: "research" as const, label: "Research", href: `${base}/research`, icon: Radar }] : []),
    { id: "settings", label: "Settings", href: `${base}/settings`, icon: Settings },
  ];
}

/** A nav item is active on its own page and on every page beneath it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
