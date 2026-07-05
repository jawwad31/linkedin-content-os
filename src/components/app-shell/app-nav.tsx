"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
};

export function AppNav({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const params = useParams<{ post_id?: string }>();

  const items: NavItem[] = [
    { label: "Dashboard", href: `/client/${clientId}/dashboard` },
    { label: "Settings", href: `/client/${clientId}/settings` },
    { label: "Research", href: `/client/${clientId}/research` },
    { label: "Ideas", href: `/client/${clientId}/ideas` },
    { label: "Publish", href: `/client/${clientId}/publish` },
  ];

  if (params?.post_id) {
    items.push({ label: "Post Review", href: pathname });
  }

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-control border-l-2 border-transparent px-3 py-2 text-small font-medium text-soft-white/60 transition-colors hover:bg-white/5 hover:text-soft-white",
              isActive &&
                "border-brand-orange bg-white/10 text-soft-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
