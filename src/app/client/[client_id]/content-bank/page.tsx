import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { ContentBankPanel } from "@/features/content-bank/content-bank-panel";
import { getContentBankEntries } from "@/features/content-bank/queries";
import { getServerUser } from "@/lib/supabase/session";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";

export default async function ContentBankPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) {
    redirect("/clients");
  }

  const result = await getContentBankEntries(clientId);

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Content Bank" />
        <p className="text-small text-danger-strong">
          We could not load the Content Bank. Please try again.
        </p>
      </div>
    );
  }

  return (
    <ContentBankPanel
      clientId={clientId}
      role={access.role}
      permissions={access.permissions}
      entries={result.entries}
    />
  );
}
