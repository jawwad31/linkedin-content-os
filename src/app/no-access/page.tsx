import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

import { LogoutButton } from "@/features/auth/logout-button";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";

export default async function NoAccessPage() {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const destination = await resolveAuthenticatedDestination(user.id);

  if (destination !== "/no-access") {
    redirect(destination);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 m3-pattern z-0 opacity-50 pointer-events-none"></div>
      
      {/* No Access Card */}
      <div className="z-10 w-full max-w-[448px] px-4 md:px-0">
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm md:shadow-md border border-outline-variant p-8 md:p-10 flex flex-col gap-8 transition-all duration-300">
          
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center text-on-surface-variant">
              <Lock className="w-8 h-8" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-section-title font-bold tracking-tight text-on-surface">Access Unavailable</h1>
              <p className="text-small text-on-surface-variant">
                You do not currently have access to an Agency or Client Workspace. Contact your administrator to request access.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col gap-4">
            <LogoutButton className="w-full h-12 rounded-full font-bold border border-outline hover:bg-surface-container-low" />
          </div>
          
        </div>
      </div>
    </main>
  );
}
