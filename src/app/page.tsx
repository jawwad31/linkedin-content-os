import { redirect } from "next/navigation";

import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";

export default async function HomePage() {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  redirect(await resolveAuthenticatedDestination(user.id));
}
