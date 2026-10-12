"use client";

import { useState, type ReactNode } from "react";

import { SegmentedNavigation } from "@/components/ui/segmented-navigation";

export type SettingsTabId = "business" | "documents" | "team" | "logs";

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  /** Rendered on the server; only the open tab is visible. */
  content: ReactNode;
};

/**
 * Settings sections as tabs instead of one long page. Every panel stays mounted (just hidden),
 * so a half-filled form survives switching tabs.
 */
export function SettingsTabs({
  tabs,
  initialTab,
}: {
  tabs: SettingsTab[];
  initialTab?: string;
}) {
  const [active, setActive] = useState<SettingsTabId>(
    tabs.find((tab) => tab.id === initialTab)?.id ?? tabs[0]?.id ?? "business",
  );

  return (
    <div className="flex flex-col gap-6">
      <SegmentedNavigation
        items={tabs.map(({ id, label }) => ({ id, label }))}
        activeId={active}
        onChange={setActive}
      />
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" aria-label={tab.label} hidden={tab.id !== active}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
