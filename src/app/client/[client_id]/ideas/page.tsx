import { redirect } from "next/navigation";

/**
 * The Ideas page is retired: sources live in the Content Bank and posts start
 * from there. Content ideas stay in the database because drafting, calendar
 * entries and older posts still read them; only this screen is gone, so old
 * bookmarks and links land on the Content Bank.
 */
export default async function IdeasPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  redirect(`/client/${clientId}/content-bank`);
}
