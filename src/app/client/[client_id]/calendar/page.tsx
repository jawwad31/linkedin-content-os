import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarPanel } from "@/features/calendar/calendar-panel";
import {
  currentMonthKey,
  formatMonthLabel,
  isValidMonthKey,
  shiftMonthKey,
} from "@/features/calendar/months";
import {
  getCalendarDefaults,
  getCalendarForMonth,
  getCalendarSlots,
  getCandidateInventory,
  getReplannableUsageIds,
  isCalendarAvailable,
} from "@/features/calendar/queries";
import {
  canRoleManageClientSetup,
  hasClientPermission,
} from "@/lib/access/roles";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { getServerUser } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { client_id: clientId } = await params;
  const { month } = await searchParams;
  const { user } = await getServerUser();

  if (!user) redirect("/login");

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) redirect("/clients");

  if (!(await isCalendarAvailable(clientId))) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Calendar" />
        <EmptyState
          icon={CalendarDays}
          title="Calendar is not available yet"
          description="A pending database update has to be applied before monthly planning can be used. Nothing is wrong with your account."
        />
      </div>
    );
  }

  const defaults = await getCalendarDefaults(clientId);
  const monthKey = isValidMonthKey(month)
    ? month
    : currentMonthKey(defaults?.settings.timezone);

  const calendar = await getCalendarForMonth(clientId, monthKey);
  const slots = calendar ? await getCalendarSlots(clientId, calendar.id) : [];
  const candidates = calendar
    ? await getCandidateInventory(
        clientId,
        slots,
        await getReplannableUsageIds(clientId, calendar.id),
      )
    : { experience: [], asset: [] };

  const canPlan = hasClientPermission(access.role, access.permissions, "ideas_manage");
  const canEditDefaults = canRoleManageClientSetup(access.role);

  const monthHref = (key: string) => `/client/${clientId}/calendar?month=${key}`;
  const navClass = cn(buttonVariants({ variant: "outline", size: "sm" }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Plan a month of posts. Choose how many posts and where they come from, pick the Content Bank entries to use, and review the plan before anything is drafted."
        action={
          <nav aria-label="Choose month" className="flex items-center gap-2">
            <Link
              href={monthHref(shiftMonthKey(monthKey, -1))}
              className={navClass}
              aria-label={`Previous month, ${formatMonthLabel(shiftMonthKey(monthKey, -1))}`}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span
              className="min-w-36 text-center text-body font-semibold text-near-black"
              aria-live="polite"
            >
              {formatMonthLabel(monthKey)}
            </span>
            <Link
              href={monthHref(shiftMonthKey(monthKey, 1))}
              className={navClass}
              aria-label={`Next month, ${formatMonthLabel(shiftMonthKey(monthKey, 1))}`}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        }
      />

      <CalendarPanel
        key={monthKey}
        clientId={clientId}
        monthKey={monthKey}
        monthLabel={formatMonthLabel(monthKey)}
        canPlan={canPlan}
        canEditDefaults={canEditDefaults}
        defaults={defaults}
        calendar={calendar}
        slots={slots}
        candidates={candidates}
      />
    </div>
  );
}
