"use client";

import { ListError } from "@/components/ui/list-error";
import { PageHeader } from "@/components/ui/page-header";

export default function CalendarError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calendar" />
      <ListError onRetry={reset} />
    </div>
  );
}
