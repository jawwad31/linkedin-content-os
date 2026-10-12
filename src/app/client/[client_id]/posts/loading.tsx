import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";

export default function PostsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Posts"
        description="What needs you first: posts to review, posts ready to publish by hand, and drafts in progress."
      />
      <SkeletonRows label="Loading posts" />
    </div>
  );
}
