import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarPanel } from "@/features/calendar/calendar-panel";
import { CalendarDraftingPanel } from "@/features/calendar/calendar-drafting-panel";
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
} from "@/features/calendar/queries";
import {
  canRoleManageClientSetup,
  hasClientPermission,
} from "@/lib/access/roles";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { getServerUser } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";
import { getContentBankEntry } from "@/features/content-bank/queries";
import { getContentBankPostEligibility } from "@/features/content-bank/post-eligibility";
import {
  calendarSourceHintSchema,
  type CalendarIncomingSource,
} from "@/features/calendar/schemas";

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
          description="A pending database update has to be applied before monthly planning can be used. Nothing is wrong with your account."
        />
      </div>
    );
  }

  const defaults = await getCalendarDefaults(clientId);
  const monthKey = isValidMonthKey(month)
    ? month
    : currentMonthKey(defaults?.settings.timezone);
  const hasSourceHint = query.sourceId !== undefined || query.sourceType !== undefined;
  const parsedSourceHint = calendarSourceHintSchema.safeParse({
    sourceId: typeof query.sourceId === "string" ? query.sourceId : "",
    sourceType: typeof query.sourceType === "string" ? query.sourceType : "",
  });
  const sourceHint = hasSourceHint && parsedSourceHint.success
    ? parsedSourceHint.data
    : null;
  let incomingSourceError = hasSourceHint && !parsedSourceHint.success
    ? "This Content Bank selection is invalid. Return to Content Bank and choose the entry again."
    : null;

  const calendar = await getCalendarForMonth(clientId, monthKey);
  const slots = calendar ? await getCalendarSlots(clientId, calendar.id) : [];
  const canPlan = hasClientPermission(access.role, access.permissions, "ideas_manage");
  const canEditDefaults = canRoleManageClientSetup(access.role);
  const canDraft = canPlan && hasClientPermission(access.role, access.permissions, "posts_draft");
  const candidates = calendar || sourceHint
    ? await getCandidateInventory(
        clientId,
        slots,
        calendar ? await getReplannableUsageIds(clientId, calendar.id) : new Set<string>(),
      )
    : { experience: [], asset: [] };
  let incomingSource: CalendarIncomingSource | null = null;
  if (sourceHint) {
    const selected = await getContentBankEntry(clientId, sourceHint.sourceId, sourceHint.sourceType);
    if (!selected) {
      incomingSourceError = "This Content Bank entry is no longer available in this workspace.";
    } else {
      const entry = selected.entry;
      const bucket = sourceHint.sourceType === "founder_experience" ? "experience" : "asset";
      const existingSlot = slots.find((slot) =>
        slot.sourceId === sourceHint.sourceId && slot.sourceType === sourceHint.sourceType);
      const eligibleCandidate = candidates[bucket].some((candidate) => candidate.id === sourceHint.sourceId);
      const baseEligibility = getContentBankPostEligibility(entry, "calendar");

      if (!canPlan) {
        incomingSource = {
          ...sourceHint,
          title: entry.title,
          bucket,
          state: "unavailable",
          message: "You need the Idea Creator permission to add this entry to a calendar.",
          slotId: null,
        };
      } else if (existingSlot) {
        incomingSource = {
          ...sourceHint,
          title: entry.title,
          bucket,
          state: "already_in_month",
          message: `Already assigned to slot ${existingSlot.slotIndex} for this month. No additional reservation will be created.`,
          slotId: existingSlot.id,
        };
      } else if (eligibleCandidate) {
        incomingSource = {
          ...sourceHint,
          title: entry.title,
          bucket,
          state: "eligible",
          message: calendar
            ? "Selected for this month. Preview the plan before reserving it."
            : "Save this month's settings first. This selection will remain while you set up the month.",
          slotId: null,
        };
      } else {
        incomingSource = {
          ...sourceHint,
          title: entry.title,
          bucket,
          state: "unavailable",
          message: baseEligibility.eligible
            ? "This entry is not available for this month because another active assignment already holds it."
            : baseEligibility.message,
          slotId: null,
        };
      }
    }
  }
  const draftJob = calendar && canDraft ? await getLatestDraftJob(clientId, calendar.id, user.id) : null;
  const draftingAvailable = calendar && canDraft && calendarDraftingEnabled()
    ? await isCalendarDraftingAvailable(clientId) : false;

  const monthHref = (key: string) => {
    const nextQuery = new URLSearchParams({ month: key });
    if (sourceHint) {
      nextQuery.set("sourceType", sourceHint.sourceType);
      nextQuery.set("sourceId", sourceHint.sourceId);
    }
    return `/client/${clientId}/calendar?${nextQuery.toString()}`;
  };
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
        key={`${monthKey}:${sourceHint ? `${sourceHint.sourceType}:${sourceHint.sourceId}` : "no-source"}`}
        clientId={clientId}
        monthKey={monthKey}
        monthLabel={formatMonthLabel(monthKey)}
        canPlan={canPlan}
        canEditDefaults={canEditDefaults}
        defaults={defaults}
        calendar={calendar}
        slots={slots}
        candidates={candidates}
        incomingSource={incomingSource}
        incomingSourceError={incomingSourceError}
      />
      {calendar && canDraft ? <CalendarDraftingPanel key={calendar.id}
        clientId={clientId} calendarId={calendar.id} slots={slots} initialJob={draftJob}
        enabled={draftingAvailable} canCancelOthers={canEditDefaults} /> : null}
    </div>
  );
}
