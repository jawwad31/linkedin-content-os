import { redirect } from "next/navigation";

export default async function ClientRootPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;

  redirect(`/client/${clientId}/posts`);
}
