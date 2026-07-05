"use client";

import { type ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

type SetupTabId = "business-context" | "founder-experiences" | "team-access";

export function SetupTabs({
  businessContext,
  founderExperiences,
  teamAccess,
}: {
  businessContext: ReactNode;
  founderExperiences: ReactNode;
  teamAccess: ReactNode | null;
}) {
  const [activeTab, setActiveTab] = useState<SetupTabId>("business-context");

  const tabs: { id: SetupTabId; label: string }[] = [
    { id: "business-context", label: "Business Context" },
    { id: "founder-experiences", label: "Founder Experiences" },
    ...(teamAccess
      ? [{ id: "team-access" as const, label: "Team Access" }]
      : []),
  ];

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap gap-1.5 rounded-full bg-soft-white p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-small font-medium text-muted-foreground transition-colors hover:text-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2",
              activeTab === tab.id && "bg-white text-near-black shadow-sm",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div hidden={activeTab !== "business-context"}>{businessContext}</div>
      <div hidden={activeTab !== "founder-experiences"}>
        {founderExperiences}
      </div>
      {teamAccess ? (
        <div hidden={activeTab !== "team-access"}>{teamAccess}</div>
      ) : null}
    </div>
  );
}
