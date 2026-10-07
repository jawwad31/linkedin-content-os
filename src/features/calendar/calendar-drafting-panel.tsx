"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNNEL_STAGES, POST_TYPES } from "@/lib/ai/playbooks/taxonomies";
import { startCalendarDraftBatchAction, pumpCalendarDraftBatchAction, cancelCalendarDraftBatchAction } from "./actions";
import { DRAFT_ERROR_COPY, MAX_DRAFT_BATCH_SIZE, MAX_SLOT_DRAFT_ATTEMPTS, draftBriefSchema, type DraftBrief, type DraftJobSummary } from "./drafting-contracts";
import type { CalendarSlotRecord } from "./queries";

export function CalendarDraftingPanel({ clientId, calendarId, slots, initialJob, enabled, canCancelOthers }: {
  clientId: string; calendarId: string; slots: CalendarSlotRecord[];
  initialJob: DraftJobSummary | null; enabled: boolean; canCancelOthers: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [briefs, setBriefs] = useState<Record<string, DraftBrief>>({});
  const [jobOverride, setJob] = useState<DraftJobSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState("");
  const running = useRef(false);
  const requestKey = useRef<string | null>(null);
  useEffect(() => () => { running.current = false; }, []);
  const job = jobOverride ?? initialJob;
  const active = job?.status === "active";
  const eligible = slots.filter(slot => !slot.postId && ["planned", "reserved", "failed"].includes(slot.status)
    && (slot.draftAttempts ?? 0) < MAX_SLOT_DRAFT_ATTEMPTS);
  const briefFor = (slot: CalendarSlotRecord): DraftBrief => briefs[slot.id] ?? slot.draftBrief ?? {
    topic: slot.sourceTitle ?? "", postType: "framework", funnelStage: "Depth",
    contentPillar: "", intendedReader: "", primaryTakeaway: "",
  };
  function change(slot: CalendarSlotRecord, patch: Partial<DraftBrief>) {
    requestKey.current = null;
    setBriefs(current => ({ ...current, [slot.id]: { ...briefFor(slot), ...patch } }));
  }

  async function pump(jobId: string) {
    running.current = true; setBusy(true); setNotice("Drafting one selected slot at a time…");
    try {
      // A job contains at most ten slots. No automatic retry of a failed slot.
      for (let step = 0; step <= MAX_DRAFT_BATCH_SIZE && running.current; step++) {
        const result = await pumpCalendarDraftBatchAction(clientId, jobId);
        if (!result.ok) { setNotice(result.message); break; }
        if (result.data.job) setJob(result.data.job);
        router.refresh();
        if (result.data.step === "done" || result.data.job?.status !== "active") {
          setNotice(result.data.job?.status === "cancelled"
            ? "Batch cancelled. Saved drafts are kept; unfinished reservations were released."
            : "Batch finished. Saved drafts are ready for human review; failed slots can be retried."); break;
        }
        if (result.data.step === "busy") {
          setNotice("An attempt is still running. Resume after it finishes; interrupted attempts become available after their lease expires."); break;
        }
        if (result.data.step === "stopped") {
          setNotice(DRAFT_ERROR_COPY.LEASE_LOST); break;
        }
      }
    } catch { setNotice("The request was interrupted. Refresh and resume this batch; saved drafts are retained."); }
    finally { running.current = false; setBusy(false); router.refresh(); }
  }

  async function start() {
    const chosen = eligible.filter(slot => selected.includes(slot.id));
    if (!chosen.length || chosen.length > MAX_DRAFT_BATCH_SIZE || chosen.some(slot => !draftBriefSchema.safeParse(briefFor(slot)).success)) {
      setNotice("Choose one to ten unfinished slots and provide a topic of at least three characters for each."); return;
    }
    setBusy(true);
    requestKey.current ??= crypto.randomUUID();
    try {
      const result = await startCalendarDraftBatchAction(clientId, calendarId, {
        requestKey: requestKey.current, slots: chosen.map(slot => ({ slotId: slot.id, brief: briefFor(slot) })),
      });
      if (!result.ok) { setNotice(result.message); setBusy(false); router.refresh(); return; }
      requestKey.current = null; setSelected([]); router.refresh();
      await pump(result.data.jobId);
    } catch { setBusy(false); setNotice("The request was interrupted. Refresh to check for an existing batch before retrying."); }
  }

  async function cancel() {
    if (!job) return;
    running.current = false; setCancelling(true);
    try {
      const result = await cancelCalendarDraftBatchAction(clientId, job.id);
      if (result.ok) { setJob({ ...job, status: "cancelled", pending: 0 }); setNotice("Batch cancelled. Saved drafts are kept; unfinished reservations were released."); router.refresh(); }
      else setNotice(result.message);
    } catch { setNotice("Cancellation could not be confirmed. Refresh and try again."); }
    finally { setCancelling(false); }
  }

  return <Card>
    <CardHeader>
      <CardTitle>Draft selected slots</CardTitle>
      <CardDescription>Choose up to ten posts, confirm each brief, then generate. Each saved draft goes through the shared writing and QA services and still needs human approval.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {!enabled ? <p className="text-small text-muted-foreground">Calendar drafting is not enabled yet.</p> : null}
      <p className="text-caption text-muted-foreground">At most three attempts per slot. Each attempt may use planning, writing, and QA calls; provider charges depend on the selected model. Pausing stops the next request; an in-flight call may still finish.</p>
      {job ? <div aria-live="polite" className="flex flex-col gap-2">
        <p className="text-small">Batch {job.status}: {job.saved}/{job.total} saved, {job.failed} failed, {job.pending} pending. {job.attempts} attempts.</p>
        {active ? <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !enabled || !job.canResume} onClick={() => void pump(job.id)}>Resume batch</Button>
          {busy ? <Button type="button" variant="outline" onClick={() => { running.current = false; setNotice("Paused after the current attempt. Resume to continue."); }}>Pause after this attempt</Button> : null}
          {job.canResume || canCancelOthers ? <Button type="button" variant="outline" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? "Cancelling…" : "Cancel unfinished batch"}</Button> : null}
          {!job.canResume ? <p className="text-small text-muted-foreground">The user who started this batch can resume it. An administrator can cancel it.</p> : null}
        </div> : null}
      </div> : null}
      <div role="status" aria-live="polite" className="text-small">{notice}</div>
      {!active && enabled ? <>
        {eligible.length ? <div className="flex flex-col gap-3">
          {eligible.map(slot => {
            const chosen = selected.includes(slot.id); const brief = briefFor(slot);
            const locked = Boolean(slot.draftBrief && (slot.draftAttempts ?? 0) > 0);
            const prefix = `draft-${slot.id}`;
            return <div key={slot.id} className="rounded-card border border-border-grey p-4">
              <label className="flex min-h-11 items-center gap-3 text-small font-medium">
                <input type="checkbox" checked={chosen} disabled={busy || (!chosen && selected.length >= MAX_DRAFT_BATCH_SIZE)}
                  onChange={() => { requestKey.current = null; setSelected(current => chosen ? current.filter(id => id !== slot.id) : [...current, slot.id]); }} />
                Slot {slot.slotIndex}: {slot.sourceTitle ?? "Profile-led evergreen post"}{slot.status === "failed" ? " — retry" : ""}
              </label>
              {slot.draftErrorCode ? <p className="text-small text-warning-strong">{DRAFT_ERROR_COPY[slot.draftErrorCode] ?? DRAFT_ERROR_COPY.GENERATION_FAILED}</p> : null}
              {chosen ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label htmlFor={`${prefix}-topic`} className="text-small sm:col-span-2">Topic / instructions
                  <Input id={`${prefix}-topic`} value={brief.topic} maxLength={500} disabled={busy || locked} onChange={event => change(slot, { topic: event.target.value })} />
                </label>
                <label htmlFor={`${prefix}-pillar`} className="text-small">Pillar
                  <Input id={`${prefix}-pillar`} value={brief.contentPillar} maxLength={500} disabled={busy || locked} onChange={event => change(slot, { contentPillar: event.target.value })} />
                </label>
                <label htmlFor={`${prefix}-reader`} className="text-small">Intended reader (optional)
                  <Input id={`${prefix}-reader`} value={brief.intendedReader} maxLength={500} disabled={busy || locked} onChange={event => change(slot, { intendedReader: event.target.value })} />
                </label>
                <label htmlFor={`${prefix}-type`} className="text-small">Post type
                  <select id={`${prefix}-type`} className="mt-1 min-h-11 w-full rounded-control border p-2" value={brief.postType} disabled={busy || locked} onChange={event => change(slot, { postType: event.target.value as DraftBrief["postType"] })}>
                    {POST_TYPES.map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
                <label htmlFor={`${prefix}-stage`} className="text-small">Funnel stage
                  <select id={`${prefix}-stage`} className="mt-1 min-h-11 w-full rounded-control border p-2" value={brief.funnelStage} disabled={busy || locked} onChange={event => change(slot, { funnelStage: event.target.value as DraftBrief["funnelStage"] })}>
                    {FUNNEL_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                </label>
                <label htmlFor={`${prefix}-takeaway`} className="text-small sm:col-span-2">Primary takeaway (optional)
                  <Input id={`${prefix}-takeaway`} value={brief.primaryTakeaway} maxLength={700} disabled={busy || locked} onChange={event => change(slot, { primaryTakeaway: event.target.value })} />
                </label>
                {locked ? <p className="text-caption text-muted-foreground sm:col-span-2">Retries keep this brief and backing idea. Replan the unfinished slot to change its topic.</p> : null}
              </div> : null}
            </div>;
          })}
          <Button type="button" disabled={busy || selected.length === 0} onClick={() => void start()}>{busy ? "Drafting…" : `Generate ${selected.length} selected ${selected.length === 1 ? "post" : "posts"}`}</Button>
        </div> : <p className="text-small text-muted-foreground">No unfinished slots are available to draft. News placeholders need timely material before they can be drafted.</p>}
      </> : null}
      {slots.some(slot => slot.postId) ? <ul className="flex flex-col gap-2 text-small">
        {slots.filter(slot => slot.postId).map(slot => <li key={slot.id}><Link className="underline" href={`/client/${clientId}/posts/${slot.postId}/review`}>Review slot {slot.slotIndex}</Link></li>)}
      </ul> : null}
    </CardContent>
  </Card>;
}
