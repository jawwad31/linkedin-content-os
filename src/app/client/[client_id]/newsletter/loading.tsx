import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";

export default function NewsletterLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Newsletter" description="Your newsletter editions and where each one stands." />
      <SkeletonRows label="Loading editions" />
    </div>
  );
}
