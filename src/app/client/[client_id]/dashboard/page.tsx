import { redirect } from "next/navigation";

/** The Overview page was replaced by "Needs you" at the top of Posts; keep old links working. */
export default async function DashboardRedirect({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  redirect(`/client/${clientId}/posts`);
}
