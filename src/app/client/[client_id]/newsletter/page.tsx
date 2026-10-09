import { redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { getServerUser } from "@/lib/supabase/session";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import {
  getNewsletterData,
  getNewsletterOptions,
} from "@/features/newsletter/queries";
import { NewsletterPanel } from "@/features/newsletter/newsletter-panel";

export default async function NewsletterPage({
  params,
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<{ edition?: string; new?: string; sources?: string }>;
}) {
  const { client_id: clientId } = await params;
  const query = await searchParams;
  const { user } = await getServerUser();
  if (!user) redirect("/login");
  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) redirect("/clients");
  const can = (
    permission:
      "ideas_manage" | "posts_draft" | "posts_review" | "posts_publish",
  ) => access.role !== "client_user" || access.permissions.includes(permission);
  const editionId = z.string().uuid().safeParse(query.edition);
  const loaded = await Promise.all([
    getNewsletterData(clientId, editionId.success ? editionId.data : undefined),
    can("ideas_manage") && can("posts_draft")
      ? getNewsletterOptions(clientId)
      : Promise.resolve([]),
  ]).catch(() => null);
  if (loaded) {
    const [data, options] = loaded;
    const isNew = query.new === "true";
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Newsletter"
          description="Plan, draft and review independent weekly editions from research and your Content Bank."
        />
        <NewsletterPanel
          key={
            isNew
              ? `new:${query.sources ?? ""}`
              : `${data.edition?.id}:${data.edition?.revision}:${data.edition?.status}:${data.edition?.outline_revision}:${data.versions[0]?.qa ? "qa" : "pending"}`
          }
          clientId={clientId}
          {...data}
          edition={isNew ? null : data.edition}
          versions={isNew ? [] : data.versions}
          sources={isNew ? [] : data.sources}
          options={options}
          initialSourceIds={(query.sources ?? "")
            .split(",")
            .filter((id) => z.string().uuid().safeParse(id).success)
            .slice(0, 8)}
          canSelect={can("ideas_manage")}
          canDraft={can("posts_draft")}
          canReview={can("posts_review")}
          canPublish={can("posts_publish")}
        />
      </div>
    );
  } else {
    return (
      <div className="space-y-4">
        <PageHeader title="Newsletter" description="Weekly editions" />
        <p role="alert" className="text-small">
          Newsletter data is unavailable. Please try again after the schema is
          ready.
        </p>
      </div>
    );
  }
}
