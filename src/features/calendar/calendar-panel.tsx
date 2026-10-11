"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ALLOCATION_BUCKETS } from "@/lib/ai/playbooks/taxonomies";

import {
  cancelCalendarSlotsAction,
  checkCalendarSourceAssignmentAction,
  commitCalendarPlanAction,
  previewCalendarPlanAction,
  resetMonthToDefaultsAction,
  saveAccountDefaultsAction,
  saveMonthSettingsAction,
} from "./actions";
import {
  computeTargetCounts,
  settingsEqual,
  type CalendarSettings,
} from "./allocation";
import {
  AllocationTable,
  PlanNotes,
  SlotCard,
} from "./calendar-plan-view";
import type {
  CalendarDefaultsRecord,
  CalendarRecord,
  CalendarSlotRecord,
  CandidateEntry,
  CandidateInventory,
} from "./queries";
import {
  BUCKET_LABELS,
  parseCalendarSettings,
  type CalendarIncomingSource,
} from "./schemas";
import type { PlanPreview } from "./service";

type Notice = { kind: "success" | "error"; text: string };

/**
 * Failures that mean the month, its plan or an entry changed after the preview was
 * built. The preview is discarded and the page data is reloaded rather than leaving
 * the user to retry against what they were shown.
 */
const STALE_PLAN_CODES = new Set([
  "PLAN_REVISION_CONFLICT",
  "PLAN_REVISION_REQUIRED",
  "SOURCE_UNAVAILABLE",
  "SOURCE_CAPACITY",
  "PLAN_EXISTS",
  "REPLAN_CONFIRMATION_REQUIRED",
  "COMMIT_UNCONFIRMED",
]);

type FormState = {
  timezone: string;
  postCount: string;
  experience: string;
  asset: string;
  evergreen: string;
  news: string;
  newsCap: string;
};

const BLANK_FORM: FormState = {
  timezone: "",
  postCount: "",
  experience: "",
  asset: "",
  evergreen: "",
  news: "",
  newsCap: "",
};

function toForm(settings: CalendarSettings | null): FormState {
  if (!settings) return BLANK_FORM;
  return {
    timezone: settings.timezone,
    postCount: String(settings.postCount),
    experience: String(settings.shares.experience),
    asset: String(settings.shares.asset),
    evergreen: String(settings.shares.evergreen),
    news: String(settings.shares.news),
    newsCap: String(settings.newsCapPercent),
  };
}

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

function toRaw(form: FormState) {
  return {
    timezone: form.timezone.trim(),
    postCount: toNumber(form.postCount),
    shares: {
      experience: toNumber(form.experience),
      asset: toNumber(form.asset),
      evergreen: toNumber(form.evergreen),
      news: toNumber(form.news),
    },
    newsCapPercent: toNumber(form.newsCap),
  };
}

type PanelProps = {
  clientId: string;
  monthKey: string;
  monthLabel: string;
  canPlan: boolean;
  canEditDefaults: boolean;
  defaults: CalendarDefaultsRecord | null;
  calendar: CalendarRecord | null;
  slots: CalendarSlotRecord[];
  candidates: CandidateInventory;
  incomingSource: CalendarIncomingSource | null;
  incomingSourceError: string | null;
};

function initialCandidateSelection(
  entries: CandidateEntry[],
  incomingSource: CalendarIncomingSource | null,
  bucket: "experience" | "asset",
): string[] {
  const inPlan = entries.filter((entry) => entry.inPlan).map((entry) => entry.id);
  if (
    incomingSource?.state !== "eligible" ||
    incomingSource.bucket !== bucket ||
    !entries.some((entry) => entry.id === incomingSource.sourceId)
  ) {
    return inPlan;
  }
  return [incomingSource.sourceId, ...inPlan.filter((id) => id !== incomingSource.sourceId)]
    .slice(0, 60);
}

/**
 * The notice lives here, outside the keyed workspace, so a success message survives
 * the refresh that follows a save (which remounts the workspace with fresh data).
 */
export function CalendarPanel(props: PanelProps) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const workspaceKey = [
    props.calendar?.id ?? "new",
    props.calendar?.settingsRevision ?? 0,
    props.calendar?.planRevision ?? 0,
    props.defaults?.version ?? 0,
  ].join(":");

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" role="status">
        {notice ? (
          <p
            className={cn(
              "rounded-control border px-4 py-3 text-small",
              notice.kind === "success"
                ? "border-success/30 bg-success/10 text-success-strong"
                : "border-danger/30 bg-danger/10 text-danger-strong",
            )}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
      <CalendarWorkspace key={workspaceKey} {...props} onNotice={setNotice} />
    </div>
  );
}

function CalendarWorkspace({
  clientId,
  monthKey,
  monthLabel,
  canPlan,
  canEditDefaults,
  defaults,
  calendar,
  slots,
  candidates,
  incomingSource,
  incomingSourceError,
  onNotice,
}: PanelProps & { onNotice: (notice: Notice | null) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const idPrefix = useId();

  const [form, setForm] = useState<FormState>(() =>
    toForm(calendar?.settings ?? defaults?.settings ?? null),
  );
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [experienceIds, setExperienceIds] = useState<string[]>(() =>
    initialCandidateSelection(candidates.experience, incomingSource, "experience"),
  );
  const [assetIds, setAssetIds] = useState<string[]>(() =>
    initialCandidateSelection(candidates.asset, incomingSource, "asset"),
  );
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);

  const parsed = useMemo(() => parseCalendarSettings(toRaw(form)), [form]);
  const issues = useMemo(() => {
    const byField = new Map<string, string>();
    if (!parsed.ok) {
      for (const issue of parsed.issues) {
        if (!byField.has(issue.field)) byField.set(issue.field, issue.message);
      }
    }
    return byField;
  }, [parsed]);

  const shareTotal = ALLOCATION_BUCKETS.reduce((sum, bucket) => {
    const value = toNumber(form[bucket]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const savedSettings = calendar?.settings ?? null;
  const dirty = !savedSettings || !parsed.ok || !settingsEqual(parsed.settings, savedSettings);
  const matchesDefaults =
    calendar && defaults ? settingsEqual(calendar.settings, defaults.settings) : null;

  const requested = savedSettings ? computeTargetCounts(savedSettings) : null;
  const lockedSlots = slots.filter((slot) => slot.postId || slot.status === "queued" || slot.status === "drafting");
  const replannableSlots = slots.filter((slot) => !lockedSlots.includes(slot));

  // Only an eligible selection is sent; an assigned or unavailable one is display-only.
  const eligibleIncoming = incomingSource?.state === "eligible" ? incomingSource : null;
  const requiredSource = eligibleIncoming
    ? { sourceId: eligibleIncoming.sourceId, sourceType: eligibleIncoming.sourceType }
    : null;
  const planSelection = {
    experienceIds,
    assetIds,
    ...(requiredSource ? { requiredSource } : {}),
  };

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of [...candidates.experience, ...candidates.asset]) {
      map.set(entry.id, entry.title);
    }
    return map;
  }, [candidates]);

  function showFieldError(field: string) {
    return submitAttempted || touched.has(field) ? issues.get(field) : undefined;
  }

  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setPreview(null);
  }

  function markTouched(field: string) {
    setTouched((current) => new Set(current).add(field));
  }

  function fillBrowserTimeZone() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) setField("timezone", zone);
  }

  function run(action: () => Promise<{ ok: boolean; message?: string } & Record<string, unknown>>, success: string) {
    onNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        onNotice({ kind: "success", text: success });
        router.refresh();
      } else {
        onNotice({ kind: "error", text: result.message ?? "Something went wrong." });
      }
    });
  }

  function saveForMonth() {
    setSubmitAttempted(true);
    if (!parsed.ok) {
      onNotice({ kind: "error", text: "Fix the highlighted settings before saving." });
      return;
    }
    run(
      () => saveMonthSettingsAction(clientId, monthKey, parsed.settings, calendar?.settingsRevision ?? null),
      `Saved settings for ${monthLabel}. Account defaults were not changed.`,
    );
  }

  function saveAsDefault() {
    setSubmitAttempted(true);
    if (!parsed.ok) {
      onNotice({ kind: "error", text: "Fix the highlighted settings before saving." });
      return;
    }
    run(
      () => saveAccountDefaultsAction(clientId, parsed.settings, defaults?.version ?? null),
      "Saved as the account default. Existing months and their plans were not changed.",
    );
  }

  function resetToDefaults() {
    if (!calendar) return;
    run(
      () => resetMonthToDefaultsAction(clientId, monthKey, calendar.settingsRevision),
      `${monthLabel} now uses the current account defaults.`,
    );
  }

  function toggle(
    id: string,
    selected: string[],
    setSelected: (ids: string[]) => void,
  ) {
    setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
    setPreview(null);
    setUnavailable([]);
  }

  function dropUnavailableSelections(lost: Set<string>) {
    setExperienceIds((ids) => ids.filter((id) => !lost.has(id)));
    setAssetIds((ids) => ids.filter((id) => !lost.has(id)));
  }

  /** Discards the preview and reloads data after a failure that made it stale. */
  function recoverFromStalePlan(result: {
    code: string;
    unavailable?: { sourceId: string }[];
  }) {
    setPreview(null);
    if (!STALE_PLAN_CODES.has(result.code)) {
      setUnavailable((result.unavailable ?? []).map((entry) => entry.sourceId));
      return;
    }
    const lost = new Set((result.unavailable ?? []).map((entry) => entry.sourceId));
    if (result.code === "SOURCE_UNAVAILABLE" && requiredSource && lost.size === 0) {
      lost.add(requiredSource.sourceId);
    }
    setUnavailable([...lost]);
    dropUnavailableSelections(lost);
    router.refresh();
  }

  function previewPlan() {
    onNotice(null);
    setUnavailable([]);
    startTransition(async () => {
      const result = await previewCalendarPlanAction(clientId, monthKey, planSelection);
      if (result.ok) {
        setPreview(result.data);
        return;
      }
      recoverFromStalePlan(result);
      onNotice({ kind: "error", text: result.message });
    });
  }

  /**
   * The commit response never arrived, so its outcome is unknown. Ask the server
   * (read-only) whether this entry now holds a confirmed reservation instead of
   * guessing, and never send a second reservation from here.
   */
  async function resolveLostCommit() {
    setPreview(null);
    router.refresh();
    if (!eligibleIncoming || !requiredSource) {
      onNotice({
        kind: "error",
        text: "The connection was interrupted, so the result is unknown. The month was reloaded; check the plan below before trying again.",
      });
      return;
    }
    try {
      const check = await checkCalendarSourceAssignmentAction(clientId, monthKey, requiredSource);
      if (!check.ok) throw new Error(check.message);
      if (check.data.assignment) {
        onNotice({
          kind: "success",
          text: `“${eligibleIncoming.title}” is assigned to ${monthLabel} with a confirmed reservation. The earlier request did succeed; nothing was reserved a second time.`,
        });
      } else {
        onNotice({
          kind: "error",
          text: `The request was interrupted and “${eligibleIncoming.title}” is not assigned to ${monthLabel}. Preview the plan again to retry; a retry cannot create a duplicate reservation.`,
        });
      }
    } catch {
      onNotice({
        kind: "error",
        text: "The connection was interrupted and the result could not be checked. The month was reloaded; look for this entry in the plan before trying again.",
      });
    }
  }

  function commitPlan() {
    if (!preview) return;
    onNotice(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof commitCalendarPlanAction>>;
      try {
        result = await commitCalendarPlanAction(
          clientId,
          monthKey,
          planSelection,
          preview.hasExistingPlan,
          preview.planRevision,
        );
      } catch {
        await resolveLostCommit();
        return;
      }
      if (result.ok) {
        const confirmed = eligibleIncoming &&
          result.data.selectedSource?.sourceId === eligibleIncoming.sourceId &&
          result.data.selectedSource.sourceType === eligibleIncoming.sourceType &&
          result.data.selectedSource.state === "reserved"
          ? eligibleIncoming
          : null;
        const replaced = `${result.data.released} unfinished ${result.data.released === 1 ? "slot was" : "slots were"} replaced.`;
        onNotice({
          kind: "success",
          text: confirmed
            ? `Added “${confirmed.title}” to ${monthLabel} and confirmed its reservation.${preview.hasExistingPlan ? ` ${replaced}` : ""}`
            : preview.hasExistingPlan
              ? `Replanned ${monthLabel}. ${replaced}`
              : `Saved the plan for ${monthLabel} and reserved the selected entries.`,
        });
        setPreview(null);
        router.refresh();
        return;
      }
      recoverFromStalePlan(result);
      onNotice({ kind: "error", text: result.message });
    });
  }

  function cancelSlots(slotIds?: string[]) {
    setConfirmCancelAll(false);
    run(
      () => cancelCalendarSlotsAction(clientId, monthKey, slotIds),
      slotIds
        ? "Cancelled the slot and released its reservation."
        : "Cancelled the unfinished slots and released their reservations.",
    );
  }

  const planBlocked = dirty
    ? "Save this month's settings first. The plan is built from the saved settings."
    : null;

  return (
    <>
      {incomingSourceError ? (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/5 p-4 text-small text-danger-strong">
          {incomingSourceError}
        </p>
      ) : null}
      {incomingSource ? (
        <Card className="border-brand-purple/30 bg-brand-purple/5">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent-purple">Selected from Content Bank</Badge>
              <Badge variant="outline">
                {incomingSource.sourceType === "founder_experience" ? "Founder experience" : "Content resource"}
              </Badge>
              <Badge variant="outline">{BUCKET_LABELS[incomingSource.bucket]}</Badge>
              <Badge variant={incomingSource.state === "eligible" ? "success" : incomingSource.state === "already_in_month" ? "info" : "warning"}>
                {incomingSource.state === "eligible" ? "Eligible" : incomingSource.state === "already_in_month" ? "Already assigned" : "Unavailable"}
              </Badge>
            </div>
            <CardTitle>{incomingSource.title}</CardTitle>
            <CardDescription>{incomingSource.message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Settings for {monthLabel}</CardTitle>
          <CardDescription>
            {calendar
              ? matchesDefaults === null
                ? "No account defaults have been saved yet."
                : matchesDefaults
                  ? `This month matches the account defaults (version ${defaults?.version}).`
                  : `This month differs from the account defaults (version ${defaults?.version}).`
              : defaults
                ? `Not saved yet. Started from the account defaults (version ${defaults.version}).`
                : "Not saved yet. Enter the settings for this month."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField
              id={`${idPrefix}-count`}
              label="Posts this month"
              hint="1 to 60"
              value={form.postCount}
              error={showFieldError("postCount")}
              disabled={!canPlan}
              onChange={(value) => setField("postCount", value)}
              onBlur={() => markTouched("postCount")}
            />
            <div className="flex flex-col gap-1.5 sm:col-span-1 lg:col-span-2">
              <label htmlFor={`${idPrefix}-tz`} className="text-small font-medium text-near-black">
                Timezone
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`${idPrefix}-tz`}
                  value={form.timezone}
                  placeholder="e.g. Asia/Karachi"
                  disabled={!canPlan}
                  aria-invalid={Boolean(showFieldError("timezone"))}
                  aria-describedby={showFieldError("timezone") ? `${idPrefix}-tz-error` : undefined}
                  onChange={(event) => setField("timezone", event.target.value)}
                  onBlur={() => markTouched("timezone")}
                />
                {canPlan ? (
                  <Button type="button" variant="outline" onClick={fillBrowserTimeZone}>
                    Use my timezone
                  </Button>
                ) : null}
              </div>
              {showFieldError("timezone") ? (
                <p id={`${idPrefix}-tz-error`} className="text-caption text-danger-strong">
                  {showFieldError("timezone")}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-small font-medium text-near-black">
              Where posts come from
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ALLOCATION_BUCKETS.map((bucket) => (
                <NumberField
                  key={bucket}
                  id={`${idPrefix}-${bucket}`}
                  label={BUCKET_LABELS[bucket]}
                  suffix="%"
                  value={form[bucket]}
                  error={showFieldError(`shares.${bucket}`)}
                  disabled={!canPlan}
                  onChange={(value) => setField(bucket, value)}
                  onBlur={() => markTouched(`shares.${bucket}`)}
                />
              ))}
            </div>
            <p
              className={cn(
                "text-small",
                shareTotal === 100 ? "text-success-strong" : "text-warning-strong",
              )}
            >
              Total: {shareTotal}% {shareTotal === 100 ? "" : "(must be 100%)"}
            </p>
            {showFieldError("shares") ? (
              <p className="text-caption text-danger-strong">{showFieldError("shares")}</p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField
              id={`${idPrefix}-cap`}
              label="News cap"
              suffix="%"
              hint="The most news posts allowed. A maximum, not a target."
              value={form.newsCap}
              error={showFieldError("newsCapPercent")}
              disabled={!canPlan}
              onChange={(value) => setField("newsCap", value)}
              onBlur={() => markTouched("newsCapPercent")}
            />
          </div>

          {parsed.ok ? (
            <div className="rounded-control bg-soft-white p-4">
              <p className="mb-2 text-small font-medium text-near-black">
                These settings ask for
              </p>
              <p className="text-small text-muted-foreground">
                {ALLOCATION_BUCKETS.map((bucket) => {
                  const counts = computeTargetCounts(parsed.settings);
                  return `${counts[bucket]} ${BUCKET_LABELS[bucket].split(" ")[0].toLowerCase()}`;
                }).join(" · ")}{" "}
                (news up to {Math.floor((parsed.settings.postCount * parsed.settings.newsCapPercent) / 100)})
              </p>
            </div>
          ) : null}

          {canPlan ? (
            <div className="grid gap-4 border-t border-border-grey pt-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="brand"
                  disabled={pending}
                  onClick={saveForMonth}
                  className="w-full sm:w-fit"
                >
                  Save for this month
                </Button>
                <p className="text-caption text-muted-foreground">
                  Applies to {monthLabel} only. Account defaults stay as they are.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || !canEditDefaults}
                  onClick={saveAsDefault}
                  className="w-full sm:w-fit"
                >
                  Save as default
                </Button>
                <p className="text-caption text-muted-foreground">
                  {canEditDefaults
                    ? "Applies to months you create from now on. Existing months and plans are not changed."
                    : "Only Account and Agency Admins can change the account defaults."}
                </p>
              </div>
              {calendar && defaults && matchesDefaults === false ? (
                <div className="md:col-span-2">
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={resetToDefaults}>
                    Reset this month to the current defaults
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-small text-muted-foreground">
              You can view this calendar. Planning requires the Idea Creator permission.
            </p>
          )}
        </CardContent>
      </Card>

      {calendar && canPlan ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose Content Bank entries</CardTitle>
            <CardDescription>
              Nothing is reserved until you save the plan. Entries marked reusable are
              suggested, never selected automatically.
              {eligibleIncoming
                ? " The Content Bank entry you chose is deliberately preselected and must appear in the preview before it can be committed."
                : ""}
              {requested
                ? ` This month asks for ${requested.experience} experience and ${requested.asset} asset ${requested.asset === 1 ? "post" : "posts"}.`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <CandidateList
                title={BUCKET_LABELS.experience}
                target={requested?.experience ?? 0}
                entries={candidates.experience}
                selected={experienceIds}
                unavailable={unavailable}
                pinnedId={eligibleIncoming?.bucket === "experience" ? eligibleIncoming.sourceId : null}
                disabled={pending}
                onToggle={(id) => toggle(id, experienceIds, setExperienceIds)}
              />
              <CandidateList
                title={BUCKET_LABELS.asset}
                target={requested?.asset ?? 0}
                entries={candidates.asset}
                selected={assetIds}
                unavailable={unavailable}
                pinnedId={eligibleIncoming?.bucket === "asset" ? eligibleIncoming.sourceId : null}
                disabled={pending}
                onToggle={(id) => toggle(id, assetIds, setAssetIds)}
              />
            </div>

            {unavailable.length > 0 ? (
              <p className="text-small text-danger-strong">
                No longer available:{" "}
                {unavailable.map((id) => titleById.get(id) ?? "an entry").join(", ")}.
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending || Boolean(planBlocked)}
                onClick={previewPlan}
                className="w-full sm:w-fit"
              >
                {slots.length > 0 ? "Preview replan" : "Preview plan"}
              </Button>
              {planBlocked ? (
                <p className="text-caption text-muted-foreground">{planBlocked}</p>
              ) : null}
            </div>

            {preview ? (
              <div className="flex flex-col gap-4 rounded-card border border-border-grey bg-soft-white p-4">
                <h3 className="text-card-title font-heading font-semibold text-near-black">
                  {preview.hasExistingPlan ? "Replan preview" : "Plan preview"}
                </h3>
                <AllocationTable
                  requested={preview.plan.requested}
                  actual={preview.plan.actual}
                  newsMax={preview.plan.newsMax}
                  shortages={preview.plan.shortages}
                />
                <PlanNotes plan={preview.plan} />
                {preview.releasedReservations.length > 0 ? (
                  <div role="alert" className="flex flex-col gap-2 rounded-control border border-warning/40 bg-warning/10 p-3 text-small text-warning-strong">
                    <p className="font-medium">
                      {preview.releasedReservations.length === 1
                        ? "This replan releases one entry already reserved for this month:"
                        : `This replan releases ${preview.releasedReservations.length} entries already reserved for this month:`}
                    </p>
                    <ul className="list-disc pl-5">
                      {preview.releasedReservations.map((entry) => (
                        <li key={`${entry.sourceType}:${entry.sourceId}`}>
                          “{entry.title}” (slot {entry.slotIndex}) —{" "}
                          {entry.reason === "beyond_capacity"
                            ? "still selected, but this month has no open allocation left for it"
                            : "no longer selected"}
                        </li>
                      ))}
                    </ul>
                    <p>
                      {eligibleIncoming
                        ? `Adding “${eligibleIncoming.title}” takes the place of ${preview.releasedReservations.length === 1 ? "that entry" : "those entries"}. `
                        : ""}
                      Released entries return to Content Bank and are no longer held for this
                      month. Monthly counts and percentages are not changed; adjust them first
                      if you want to keep every entry.
                    </p>
                  </div>
                ) : null}
                {preview.hasExistingPlan ? (
                  <p className="text-small text-near-black">
                    Confirming cancels {preview.replannableSlots} unfinished{" "}
                    {preview.replannableSlots === 1 ? "slot" : "slots"} and releases their
                    reservations.{" "}
                    {preview.preservedSlots > 0
                      ? `${preview.preservedSlots} ${preview.preservedSlots === 1 ? "slot" : "slots"} with saved, queued or drafting posts stay untouched.`
                      : "No slot has a post yet."}
                  </p>
                ) : null}
                <div>
                  <Button
                    type="button"
                    variant="brand"
                    disabled={pending}
                    onClick={commitPlan}
                    className="w-full sm:w-fit"
                  >
                    {preview.hasExistingPlan
                      ? "Confirm replan"
                      : "Reserve selected entries and save plan"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {calendar ? (
        <Card>
          <CardHeader>
            <CardTitle>Plan for {monthLabel}</CardTitle>
            <CardDescription>
              {slots.length > 0
                ? `${slots.length} of ${calendar.settings.postCount} slots planned. Drafts are not written yet.`
                : "No plan has been saved for this month."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {slots.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No plan yet"
                description={
                  canPlan
                    ? "Choose entries above and preview the plan to create this month's slots."
                    : "A plan has not been created for this month."
                }
              />
            ) : (
              <>
                {canPlan && replannableSlots.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {confirmCancelAll ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={pending}
                          onClick={() => cancelSlots()}
                        >
                          Confirm: cancel {replannableSlots.length} unfinished{" "}
                          {replannableSlots.length === 1 ? "slot" : "slots"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmCancelAll(false)}
                        >
                          Keep plan
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => setConfirmCancelAll(true)}
                      >
                        Cancel unfinished slots
                      </Button>
                    )}
                    {lockedSlots.length > 0 ? (
                      <Badge variant="info">
                        {lockedSlots.length} with saved or pending drafts are kept
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {slots.map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      canCancel={canPlan}
                      busy={pending}
                      onCancel={(slotId) => cancelSlots([slotId])}
                    />
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function NumberField({
  id,
  label,
  value,
  hint,
  suffix,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  suffix?: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-near-black">
        {label}
        {suffix ? <span className="text-muted-foreground"> ({suffix})</span> : null}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {error ? (
        <p id={`${id}-error`} className="text-caption text-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CandidateList({
  title,
  target,
  entries,
  selected,
  unavailable,
  pinnedId,
  disabled,
  onToggle,
}: {
  title: string;
  target: number;
  entries: CandidateEntry[];
  selected: string[];
  unavailable: string[];
  pinnedId: string | null;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const over = selected.length > target;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="text-small font-medium text-near-black">{title}</legend>
      <p className={cn("text-caption", over ? "text-warning-strong" : "text-muted-foreground")}>
        {selected.length} selected of {target} needed
        {over ? `. ${selected.length - target} extra will not be reserved.` : "."}
        {entries.length === 0
          ? " No eligible entries. Evergreen posts will fill these slots."
          : ""}
      </p>
      {entries.length > 0 ? (
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const checked = selected.includes(entry.id);
            const lost = unavailable.includes(entry.id);
            const pinned = entry.id === pinnedId;
            return (
              <li key={entry.id}>
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 text-small",
                    checked ? "border-secondary-dark bg-brand-purple/5" : "border-border-grey bg-white",
                    lost && "border-danger/40",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#9600C7]"
                    checked={checked}
                    disabled={disabled || pinned}
                    onChange={() => onToggle(entry.id)}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium text-near-black [overflow-wrap:anywhere]">
                      {entry.title}
                    </span>
                    {entry.summary ? (
                      <span className="line-clamp-2 text-caption text-muted-foreground">
                        {entry.summary}
                      </span>
                    ) : null}
                    <span className="flex flex-wrap gap-1.5">
                      {entry.allowReuse ? <Badge variant="accent-purple">Reusable</Badge> : null}
                      {entry.usageCount > 0 ? (
                        <Badge variant="neutral">Used {entry.usageCount}x before</Badge>
                      ) : (
                        <Badge variant="neutral">Unused</Badge>
                      )}
                      {entry.inPlan ? <Badge variant="info">In current plan</Badge> : null}
                      {pinned ? <Badge variant="accent-purple">Selected from Content Bank</Badge> : null}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </fieldset>
  );
}
