"use client";

import { ListError } from "@/components/ui/list-error";
import { PageHeader } from "@/components/ui/page-header";

export default function ResearchError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Research" />
      <ListError onRetry={reset} />
    </div>
  );
}
