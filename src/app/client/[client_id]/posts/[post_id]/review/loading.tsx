import { Button } from "@/components/ui/button";
import { SkeletonBar, SkeletonRows } from "@/components/ui/skeleton";

/** Post review while the post loads: the decision buttons are present but disabled. */
export default function PostReviewLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonBar className="h-6 w-2/5" />
      <SkeletonRows rows={3} label="Loading post" />
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="brand" size="sm" disabled>Approve</Button>
        <Button type="button" variant="outline" size="sm" disabled>Request edits</Button>
        <Button type="button" variant="ghost" size="sm" disabled>Reject</Button>
      </div>
    </div>
  );
}
