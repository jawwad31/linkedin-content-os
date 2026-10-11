import { redirect } from "next/navigation";

/** Content Resources are managed in the Content Bank; keep old links working. */
export default async function ResourcesRedirect({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  redirect(`/client/${clientId}/content-bank`);
}
