import { redirect } from "next/navigation";
import { z } from "zod";
import { ListError } from "@/components/ui/list-error";
import { PageHeader } from "@/components/ui/page-header";
import { getServerUser } from "@/lib/supabase/session";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import {
  getNewsletterData,
  getNewsletterOptions,
} from "@/features/newsletter/queries";
import { NewsletterPanel } from "@/features/newsletter/newsletter-panel";
import { createClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/features/posts/generate/service";

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
  const profile = await getBusinessContext(await createClient(), clientId).catch(
    () => null,
  );
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
      <NewsletterPanel
        key={
          isNew
            ? `new:${query.sources ?? ""}`
            : `${data.edition?.id ?? "list"}:${data.edition?.revision}:${data.edition?.status}`
        }
        clientId={clientId}
        {...data}
        creating={isNew}
        edition={isNew ? null : data.edition}
        versions={isNew ? [] : data.versions}
        sources={isNew ? [] : data.sources}
        options={options}
        initialSourceIds={(query.sources ?? "")
          .split(",")
          .filter((id) => z.string().uuid().safeParse(id).success)
          .slice(0, 8)}
        hasIcp={!!profile?.primaryIcp?.trim()}
        hasPersonalReaders={!!profile?.personalReaders?.trim()}
        canSelect={can("ideas_manage")}
        canDraft={can("posts_draft")}
        canReview={can("posts_review")}
        canPublish={can("posts_publish")}
      />
    );
  } else {
    return (
      <div className="space-y-4">
        <PageHeader title="Newsletter" description="Weekly editions" />
        <ListError />
      </div>
    );
  }
}
