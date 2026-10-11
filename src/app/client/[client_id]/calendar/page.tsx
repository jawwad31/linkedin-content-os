import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CalendarEntryChoice } from "@/features/calendar/add-to-calendar-dialog";
import { CalendarDraftingPanel } from "@/features/calendar/calendar-drafting-panel";
import { CalendarView } from "@/features/calendar/calendar-view";
import { todayInTimezone } from "@/features/calendar/dates";
import { calendarDraftingEnabled, getLatestDraftJob, isCalendarDraftingAvailable } from "@/features/calendar/drafting-service";
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
  type CandidateEntry,
} from "@/features/calendar/queries";
import {
  canRoleManageClientSetup,
  hasClientPermission,
} from "@/lib/access/roles";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { getServerUser } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

function toChoice(entry: CandidateEntry): CalendarEntryChoice {
  return {
    sourceId: entry.id,
    sourceType: entry.sourceType,
    title: entry.title,
    typeLabel: entry.sourceType === "content_resource"
      ? "Resource"
      : entry.entryType === "trend_reaction" ? "Trend reaction" : "Experience",
    reuseLabel: entry.allowReuse ? "Reusable" : "Single-use",
  };
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client_id: clientId } = await params;
  const query = await searchParams;
  const month = typeof query.month === "string" ? query.month : undefined;
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
          description="A pending database update has to be applied before the calendar can be used. Nothing is wrong with your account."
        />
      </div>
    );
  }

  const defaults = await getCalendarDefaults(clientId);
  const timezone = defaults?.settings.timezone;
  const today = todayInTimezone(timezone);
  const monthKey = isValidMonthKey(month) ? month : currentMonthKey(timezone);

  const calendar = await getCalendarForMonth(clientId, monthKey);
  const slots = calendar ? await getCalendarSlots(clientId, calendar.id) : [];

  const canPlan = hasClientPermission(access.role, access.permissions, "ideas_manage");
  const canEditDefaults = canRoleManageClientSetup(access.role);
  const canDraft = canPlan && hasClientPermission(access.role, access.permissions, "posts_draft");

  // Entries that can still be added: ready, not held elsewhere, and not already in this month.
  const inventory = canPlan
    ? await getCandidateInventory(
        clientId,
        slots,
        calendar ? await getReplannableUsageIds(clientId, calendar.id) : new Set<string>(),
      )
    : { experience: [], asset: [] };
  const entries = [...inventory.experience, ...inventory.asset]
    .filter((entry) => !entry.inPlan)
    .map(toChoice);

  const draftJob = calendar && canDraft ? await getLatestDraftJob(clientId, calendar.id, user.id) : null;
  const draftingAvailable = calendar && canDraft && calendarDraftingEnabled()
    ? await isCalendarDraftingAvailable(clientId) : false;

  const monthHref = (key: string) => `/client/${clientId}/calendar?month=${key}`;
  const navClass = cn(buttonVariants({ variant: "outline", size: "sm" }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Entries reserved for a date. Add an entry from the Content Bank, or here, and pick the day to post it."
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

      <CalendarView
        key={`${monthKey}:${calendar?.planRevision ?? 0}`}
        clientId={clientId}
        monthKey={monthKey}
        monthLabel={formatMonthLabel(monthKey)}
        today={today}
        canPlan={canPlan}
        calendar={calendar ? { id: calendar.id, planRevision: calendar.planRevision } : null}
        slots={slots}
        entries={entries}
      />

      {calendar && canDraft ? <CalendarDraftingPanel key={calendar.id}
        clientId={clientId} calendarId={calendar.id} slots={slots} initialJob={draftJob}
        enabled={draftingAvailable} canCancelOthers={canEditDefaults} /> : null}
    </div>
  );
}
