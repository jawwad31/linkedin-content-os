"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, CalendarPlus, ChevronDown, FileText, FilePenLine, Lightbulb, Mail, Pencil, Plus, RefreshCw, Search, Trash2, TrendingUp, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedNavigation } from "@/components/ui/segmented-navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  canRoleManageClientSetup, canRoleManageFounderExperiences, canRoleContributeResearch,
  canRoleManageIdeas, canRoleDraftPosts,
  type EffectiveClientRole, type ClientPermission,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";
import { cannotReason, missingPermissions } from "@/lib/access/permission-copy";

import {
  CONTENT_BANK_CATEGORY_LABELS, CONTENT_BANK_READINESS, USAGE_STATUSES,
  type ContentBankEntry, type SourceUsageRecord,
} from "./schemas";
import { toggleAllowReuseAction, archiveContentBankEntryAction, deleteContentBankExperienceAction, loadContentBankUsageAction } from "./actions";
import { ContentBankEntryForm } from "./content-bank-entry-form";
import { AddToCalendarDialog, type CalendarEntryChoice } from "@/features/calendar/add-to-calendar-dialog";
import { getContentBankPostEligibility } from "./post-eligibility";

const selectClass = "h-10 rounded-control border border-border-grey bg-white px-3 text-small";

function Detail({ label, value }: { label: string; value?: string | null }) {
  return value ? <div className="min-w-0">
    <p className="text-caption font-medium text-muted-foreground">{label}</p>
    <p className="whitespace-pre-wrap break-words text-small">{value}</p>
  </div> : null;
}

function UsageHistory({ clientId, entry }: { clientId: string; entry: ContentBankEntry }) {
  const [history, setHistory] = useState<SourceUsageRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function load() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadContentBankUsageAction(clientId, entry.id, entry.sourceType);
        if (result.ok) setHistory(result.history);
        else setError(result.error);
      } catch { setError("Could not load usage history. Try again."); }
    });
  }
  return <div className="flex flex-col gap-2 border-t border-border-grey pt-3">
    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={load}>
      {isPending ? "Loading..." : history ? "Refresh usage history" : "View usage history"}
    </Button>
    {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
    {history?.length === 0 ? <p className="text-small text-muted-foreground">No recorded assignments or uses.</p> : null}
    {history?.map((use) => <div key={use.id} className="flex flex-col gap-1 rounded-control border border-border-grey p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{use.status}</Badge>
        <span className="text-caption">{use.channel.replaceAll("_", " ")} · {formatUtcDate(use.createdAt)}</span>
      </div>
      <Detail label="Angle" value={use.angle} />
      <Detail label="Takeaway" value={use.takeaway} />
      {use.newsletterId ? <a href={`/client/${clientId}/newsletter?edition=${use.newsletterId}`} className="text-small text-link underline">Open newsletter edition</a>
        : use.postId ? <a href={`/client/${clientId}/posts/${use.postId}/review`} className="text-small text-link underline">Open post</a>
        : use.channel === "newsletter" || use.channel === "calendar_slot" ? <a href={`/client/${clientId}/${use.channel === "newsletter" ? "newsletter" : "calendar"}`} className="text-small text-link underline">Open {use.channel === "newsletter" ? "Newsletter" : "Calendar"}</a>
            : <p className="text-caption text-muted-foreground">No linked output is available.</p>}
      <span className="text-caption text-muted-foreground">Updated {formatUtcDate(use.updatedAt)}</span>
    </div>)}
  </div>;
}

type TypeTab = "all" | "experience" | "trend" | "resource";

function entryType(entry: ContentBankEntry): Exclude<TypeTab, "all"> {
  return entry.sourceType === "content_resource" ? "resource" : entry.entryType === "trend_reaction" ? "trend" : "experience";
}

const TYPE_LABELS: Record<Exclude<TypeTab, "all">, string> = { experience: "Experience", trend: "Trend reaction", resource: "Resource" };
const TYPE_ICONS: Record<Exclude<TypeTab, "all">, LucideIcon> = { experience: Lightbulb, trend: TrendingUp, resource: FileText };

/** Readiness choices under Advanced: archived entries stay out of the list unless asked for. */
const READINESS_VIEWS = [
  { value: "active", label: "Draft and ready" },
  { value: "all", label: "Everything, including archived" },
  ...CONTENT_BANK_READINESS.map((value) => ({ value, label: value === "archived" ? "Archived only" : `${value[0].toUpperCase()}${value.slice(1)} only` })),
];

export function ContentBankPanel({ clientId, role, permissions, entries }: {
  clientId: string; role: EffectiveClientRole; permissions: ClientPermission[]; entries: ContentBankEntry[];
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<TypeTab>("all");
  const [selectedReadiness, setSelectedReadiness] = useState("active");
  const [selectedUsage, setSelectedUsage] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<ContentBankEntry | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentBankEntry | null>(null);
  const [calendarEntry, setCalendarEntry] = useState<CalendarEntryChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = canRoleManageClientSetup(role);
  const canManageExperiences = canRoleManageFounderExperiences(role, permissions);
  const canManageReactions = canRoleContributeResearch(role, permissions);
  const canManageIdeas = canRoleManageIdeas(role, permissions);
  const canDraftPosts = canRoleDraftPosts(role, permissions);
  const canCreatePost = canManageIdeas && canDraftPosts;
  const canUseNewsletter = canCreatePost;
  // One-line reasons for disabled controls. Capability gaps are disabled with a reason;
  // resource management is admin-only, so it is hidden for everyone else.
  const createPostMissing = missingPermissions(role, permissions, ["ideas_manage", "posts_draft"]);
  const createPostReason = cannotReason("create posts", createPostMissing);
  const calendarReason = canManageIdeas ? null : cannotReason("add entries to the calendar", ["ideas_manage"]);
  const newsletterReason = canUseNewsletter ? null : cannotReason("use entries in a newsletter", createPostMissing);
  function canEdit(entry: ContentBankEntry) {
    return entry.sourceType === "content_resource" ? isAdmin
      : entry.entryType === "trend_reaction" ? canManageReactions : canManageExperiences;
  }
  const query = searchQuery.trim().toLowerCase();
  // Everything except the type tab, so each tab can show how many entries it holds.
  const matchingEntries = entries.filter((entry) => {
    if (selectedReadiness === "active" ? entry.readiness === "archived"
      : selectedReadiness !== "all" && entry.readiness !== selectedReadiness) return false;
    if (selectedUsage !== "all" && entry.usageStatus !== selectedUsage) return false;
    return !query || [entry.title, entry.rawNotes, entry.takeaway, entry.whatHappened,
      entry.whatWasLearned, entry.whatChanged, entry.whyItMatters, entry.description,
      entry.problemSolved, entry.targetUseCase, entry.keyword].some((value) => value?.toLowerCase().includes(query));
  });
  const filteredEntries = selectedType === "all" ? matchingEntries : matchingEntries.filter((entry) => entryType(entry) === selectedType);
  const typeCount = (type: Exclude<TypeTab, "all">) => matchingEntries.filter((entry) => entryType(entry) === type).length;
  const canCapture = canManageExperiences || isAdmin;
  const captureReason = canCapture ? null : cannotReason("add entries", ["founder_experience_manage"]);

  function mutate(entry: ContentBankEntry, action: "reuse" | "archive") {
    if (action === "archive" && !window.confirm(`Mark "${entry.title}" archived? Its record and usage history will be retained.`)) return;
    setError(null); setSuccess(null);
    startTransition(async () => {
      try {
        const result = action === "reuse"
          ? await toggleAllowReuseAction(clientId, entry.id, entry.sourceType, !entry.allowReuse)
          : await archiveContentBankEntryAction(clientId, entry.id, entry.sourceType);
        if (result.error) setError(result.error);
        else { setSuccess(result.success); router.refresh(); }
      } catch { setError("Could not update this entry. Refresh and try again."); }
    });
  }

  return <div className="flex flex-col gap-4">
    <PageHeader
      title="Content Bank"
      action={<div className="flex flex-wrap items-center gap-3">
        <span className="relative w-full sm:w-[260px]">
          <Search aria-hidden="true" className="absolute left-3 top-[11px] h-4 w-4 text-muted-foreground sm:top-[7px]" />
          <Input aria-label="Search entries" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search entries" className="h-[38px] w-full pl-9 sm:h-[30px]" />
        </span>
        {entries.length > 0 ? <Button type="button" variant="brand" disabled={isPending || editor !== null || !canCapture} onClick={() => { setEditor("new"); setError(null); setSuccess(null); }}>
          <Plus className="h-4 w-4" /> New entry
        </Button> : null}
      </div>}
    />
    {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
    {success ? <p role="status" className="text-small text-success-strong">{success}</p> : null}
    {captureReason ? <p className="text-small text-muted-foreground">{captureReason}</p> : null}
    {createPostReason ? <p className="text-small text-muted-foreground">{createPostReason}</p> : null}
    {editor ? <ContentBankEntryForm key={editor === "new" ? "new" : `${editor.sourceType}:${editor.id}`}
      clientId={clientId} entry={editor === "new" ? undefined : editor}
      canManageExperiences={canManageExperiences} canManageResources={isAdmin}
      onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); setError(null); setSuccess("Entry saved."); router.refresh(); }}
    /> : null}
    <SegmentedNavigation
      items={[
        { id: "all" as TypeTab, label: "All", count: matchingEntries.length },
        { id: "experience" as TypeTab, label: "Experiences", count: typeCount("experience") },
        { id: "trend" as TypeTab, label: "Trend reactions", count: typeCount("trend") },
        { id: "resource" as TypeTab, label: "Resources", count: typeCount("resource") },
      ]}
      activeId={selectedType}
      onChange={setSelectedType}
    />
    {entries.length === 0 ? <EmptyState icon={BookOpen} title="No entries yet"
      description="Entries are the source material for posts. Add an experience, a trend reaction or a resource."
      action={<Button type="button" variant="brand" disabled={isPending || editor !== null || !canCapture} onClick={() => { setEditor("new"); setError(null); setSuccess(null); }}>
        <Plus className="h-4 w-4" /> New entry
      </Button>} />
      : filteredEntries.length === 0 ? <EmptyState icon={BookOpen} title="No Content Bank entries found" description="Capture an experience or resource, or change your search." />
      : <ul className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-xs">
        {filteredEntries.map((entry) => {
          const key = `${entry.sourceType}:${entry.id}`;
          const type = entryType(entry);
          const TypeIcon = TYPE_ICONS[type];
          const isResource = entry.sourceType === "content_resource";
          const editable = canEdit(entry);
          const available = entry.readiness === "ready" && (!isResource || entry.active);
          const expanded = expandedKey === key;
          const postEligibility = getContentBankPostEligibility(entry);
          const calendarEligibility = getContentBankPostEligibility(entry, "calendar");
          const createPostHref = `/client/${clientId}/posts/new?sourceType=${encodeURIComponent(entry.sourceType)}&sourceId=${encodeURIComponent(entry.id)}`;
          const calendarChoice: CalendarEntryChoice = {
            sourceId: entry.id,
            sourceType: entry.sourceType,
            title: entry.title,
            typeLabel: isResource ? "Resource" : entry.entryType === "trend_reaction" ? "Trend reaction" : "Experience",
            reuseLabel: entry.allowReuse ? "Reusable" : "Single-use",
          };
          const busy = isPending || editor !== null;
          // Resource management is admin-only: those items are hidden for everyone else.
          const resourceHidden = isResource && !isAdmin;
          const editReason = editable ? null : cannotReason("change this entry", [entry.entryType === "trend_reaction" ? "research_contribute" : "founder_experience_manage"]);
          const menuItems: ActionMenuItem[] = [
            ...(calendarEligibility.eligible ? [{ label: "Add to Calendar", icon: CalendarPlus, onSelect: () => setCalendarEntry(calendarChoice), disabledReason: calendarReason }] : []),
            { label: expanded ? "Hide details" : "View details", icon: ChevronDown, onSelect: () => setExpandedKey(expanded ? null : key) },
            ...(!resourceHidden && !busy ? [{ label: "Edit", icon: Pencil, disabledReason: editReason, onSelect: () => { setEditor(entry); setError(null); setSuccess(null); window.scrollTo({ top: 0, behavior: "smooth" }); } }] : []),
            ...(!resourceHidden && !busy ? [{ label: entry.allowReuse ? "Make single-use" : "Make reusable", icon: RefreshCw, disabledReason: editReason, onSelect: () => mutate(entry, "reuse") }] : []),
            ...(available ? [{ label: "Use in newsletter", icon: Mail, disabledReason: newsletterReason, onSelect: () => router.push(`/client/${clientId}/newsletter?new=true&sources=${entry.id}`) }] : []),
            ...(!resourceHidden && entry.readiness !== "archived" && !busy ? [{ label: "Archive", icon: Archive, disabledReason: editReason, onSelect: () => mutate(entry, "archive") }] : []),
            ...(isAdmin && entry.sourceType === "founder_experience" && !busy ? [{ label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(entry) }] : []),
          ];
          return <li key={key} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-t border-border-subtle px-5 py-4 first:border-t-0 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
            <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary-soft text-link">
              <TypeIcon className="h-5 w-5" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="break-words text-small font-medium text-near-black">{entry.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  {TYPE_LABELS[type]} · {CONTENT_BANK_CATEGORY_LABELS[entry.category]}
                </span>
                <Badge variant={entry.allowReuse ? "accent-purple" : "neutral"}>{entry.allowReuse ? "Reusable" : "Single-use"}</Badge>
                <Badge variant={entry.usageStatus === "published" ? "success" : "neutral"}>{`${entry.usageStatus[0].toUpperCase()}${entry.usageStatus.slice(1)}`}</Badge>
                {entry.readiness !== "ready" ? <Badge variant="outline">{entry.readiness}</Badge> : null}
                {isResource && !entry.active ? <Badge variant="neutral">Inactive</Badge> : null}
              </div>
              {canCreatePost && !postEligibility.eligible ? <p className="text-caption text-muted-foreground">Create post unavailable: {postEligibility.message}</p> : null}
              {canManageIdeas && !calendarEligibility.eligible && (!canCreatePost || calendarEligibility.message !== postEligibility.message) ? <p className="text-caption text-muted-foreground">Add to Calendar unavailable: {calendarEligibility.message}</p> : null}
            </div>
            <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
              {!canCreatePost ? <Button type="button" variant="outline" size="sm" disabled>
                <FilePenLine className="h-4 w-4" /> Create post
              </Button> : postEligibility.eligible ? <Link href={createPostHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <FilePenLine className="h-4 w-4" /> Create post
              </Link> : null}
              <ActionMenu label={`More actions for ${entry.title}`} items={menuItems} />
            </div>
            {expanded ? <div className="col-span-full flex flex-col gap-3 rounded-control bg-surface-sunken p-4">
              <Detail label={isResource ? "Problem solved" : "Takeaway"} value={isResource ? entry.problemSolved : entry.takeaway} />
              {isResource ? <div className="flex flex-wrap gap-2">
                <Badge variant={entry.commentGateApproved ? "success" : "neutral"}>{entry.commentGateApproved ? "Comment CTA approved" : "Comment CTA not approved"}</Badge>
                {entry.keyword ? <Badge variant="outline">Keyword: {entry.keyword}</Badge> : null}
              </div> : null}
              <Detail label="Raw notes" value={entry.rawNotes} />
              {isResource ? <>
                <Detail label="Resource type" value={entry.resourceType} />
                <Detail label="Resource description" value={entry.description} />
                <Detail label="Target use case" value={entry.targetUseCase} />
                <Detail label="Delivery URL" value={entry.deliveryUrl} />
                {entry.deliveryUrl && /^https?:\/\//i.test(entry.deliveryUrl) ? <a href={entry.deliveryUrl} target="_blank" rel="noreferrer" className="text-small text-link underline">Open delivery link</a> : null}
                <Detail label="Manual delivery instructions" value={entry.deliveryInstructions} />
              </> : <>
                <Detail label="What happened / proof" value={entry.whatHappened} />
                <Detail label={entry.entryType === "trend_reaction" ? "Your take" : "What was learned"} value={entry.whatWasLearned} />
                <Detail label="What changed" value={entry.whatChanged} />
                <Detail label="Why it matters" value={entry.whyItMatters} />
                <Detail label="Reaction type" value={entry.reactionType} />
                {entry.sourceTrendCardId || entry.sourceResearchFindingId ? <a href={`/client/${clientId}/research`} className="text-small text-link underline">Open Research</a> : null}
              </>}
              <p className="text-caption text-muted-foreground">Created {formatUtcDate(entry.createdAt)} · Updated {formatUtcDate(entry.updatedAt)} · {entry.usageCount} recorded successful uses</p>
              <UsageHistory clientId={clientId} entry={entry} />
            </div> : null}
          </li>;
        })}
      </ul>}
    <details className="text-small">
      <summary className="cursor-pointer text-link underline">Advanced</summary>
      <p className="mt-2 text-caption text-muted-foreground">Archived entries are hidden from the list above. Show them, or narrow by usage, here.</p>
      <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">Show
          <select value={selectedReadiness} onChange={(event) => setSelectedReadiness(event.target.value)} className={selectClass}>
            {READINESS_VIEWS.map((view) => <option key={view.value} value={view.value}>{view.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">Usage
          <select value={selectedUsage} onChange={(event) => setSelectedUsage(event.target.value)} className={selectClass}>
            <option value="all">All usage</option>
            {USAGE_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
    </details>
    <AddToCalendarDialog clientId={clientId} entry={calendarEntry} onClose={() => setCalendarEntry(null)} />
    <DestructiveConfirmDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      recordType={deleteTarget?.entryType === "trend_reaction" ? "Trend Reaction" : "Experience"}
      recordTitle={deleteTarget?.title ?? ""}
      description="This permanently deletes the entry. It is refused while an idea, calendar slot or saved content depends on it. Archive the entry instead to keep its history."
      onConfirm={async () => {
        if (!deleteTarget) return { ok: false, error: "No entry selected." };
        const result = await deleteContentBankExperienceAction(clientId, deleteTarget.id);
        return result.ok ? { ok: true } : { ok: false, error: result.error ?? "Failed to delete entry." };
      }}
      onSuccess={() => { setDeleteTarget(null); setSuccess("Entry deleted."); router.refresh(); }}
    />
  </div>;
}
