import { redirect } from "next/navigation";

import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  const { user } = await getServerUser();

  if (user) {
    redirect(await resolveAuthenticatedDestination(user.id));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 m3-pattern z-0 opacity-50 pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-orange/10 rounded-full blur-[120px] z-0 pointer-events-none"></div>
      <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-brand-purple/10 rounded-full blur-[100px] z-0 pointer-events-none"></div>

      {/* Login Card */}
      <div className="z-10 w-full max-w-[448px] px-4 md:px-0">
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm md:shadow-md border border-outline-variant p-8 md:p-10 flex flex-col gap-8 transition-all duration-300 hover:shadow-lg">
          
          {/* Branding Header */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 bg-gradient-brand rounded-xl flex items-center justify-center shadow-lg" aria-hidden="true">
              <span className="text-4xl font-bold text-white leading-none tracking-tighter">A</span>
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-section-title font-bold tracking-tight text-on-surface">AIXelerate</h1>
              <p className="text-small text-on-surface-variant">The Operating System for Content</p>
            </div>
          </div>
          
          {/* Form Container */}
          <LoginForm />
          
        </div>
        

      </div>
    </main>
  );
}
