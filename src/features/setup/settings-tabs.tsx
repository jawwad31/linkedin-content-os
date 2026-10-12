"use client";

import { useState, type ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { SegmentedNavigation } from "@/components/ui/segmented-navigation";

export type SettingsTabId = "business" | "documents" | "team" | "logs";

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  /** Rendered on the server; only the open tab is visible. */
  content: ReactNode;
  /** The page's one primary action while this tab is open, shown in the top bar. */
  action?: ReactNode;
};

/**
 * Settings sections as tabs instead of one long page. Every panel stays mounted (just hidden),
 * so a half-filled form survives switching tabs. The top bar belongs to the tabs so that a
 * tab's action (for example Invite member on Team access) shows only while that tab is open.
 */
export function SettingsTabs({
  title,
  description,
  tabs,
  initialTab,
}: {
  title: string;
  description?: string;
  tabs: SettingsTab[];
  initialTab?: string;
}) {
  const [active, setActive] = useState<SettingsTabId>(
    tabs.find((tab) => tab.id === initialTab)?.id ?? tabs[0]?.id ?? "business",
  );
  const activeAction = tabs.find((tab) => tab.id === active)?.action;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} action={activeAction} />
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
