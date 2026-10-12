import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Entries reserved for a date. Add an entry from the Content Bank, or here, and pick the day to post it."
      />
      <SkeletonRows rows={5} label="Loading calendar" />
    </div>
  );
}
