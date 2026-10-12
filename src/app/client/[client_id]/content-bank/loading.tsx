import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";

const TABS = ["All", "Experiences", "Trend reactions", "Resources"];

export default function ContentBankLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Content Bank" />
      <div className="flex flex-wrap items-center gap-x-6 border-b border-border-subtle">
        {TABS.map((tab, index) => (
          <span
            key={tab}
            className={`-mb-px inline-flex h-[38px] items-center border-b-2 text-small ${
              index === 0 ? "border-cyan-500 font-medium text-near-black" : "border-transparent text-muted-foreground"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>
      <SkeletonRows label="Loading entries" />
    </div>
  );
}
