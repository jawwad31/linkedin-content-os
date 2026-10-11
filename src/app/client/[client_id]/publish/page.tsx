import { redirect } from "next/navigation";

/** Publishing is the last step of a post, on its review page; keep old links working. */
export default async function PublishRedirect({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  redirect(`/client/${clientId}/posts`);
}
