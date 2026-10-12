import { Button } from "@/components/ui/button";
import { SkeletonBar } from "@/components/ui/skeleton";

/** Post edit while the post loads: the Save button is present but disabled. */
export default function PostEditLoading() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SkeletonBar className="h-6 w-2/5" />
      <SkeletonBar className="h-48 w-full" />
      <div>
        <Button type="button" variant="brand" disabled>Save</Button>
      </div>
    </div>
  );
}
