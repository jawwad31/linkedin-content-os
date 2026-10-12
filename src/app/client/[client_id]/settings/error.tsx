"use client";

import { ListError } from "@/components/ui/list-error";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <ListError onRetry={reset} />
    </div>
  );
}
