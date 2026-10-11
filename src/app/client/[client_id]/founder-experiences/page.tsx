import { redirect } from "next/navigation";

/** The Founder Experiences screen was replaced by the Content Bank; keep old links working. */
export default async function FounderExperiencesRedirect({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  redirect(`/client/${clientId}/content-bank`);
}
