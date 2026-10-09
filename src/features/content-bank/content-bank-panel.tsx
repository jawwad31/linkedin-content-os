"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, Pencil, Plus, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  canRoleManageClientSetup, canRoleManageFounderExperiences, canRoleContributeResearch,
  canRoleManageIdeas, canRoleDraftPosts,
  type EffectiveClientRole, type ClientPermission,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import {
  CONTENT_BANK_CATEGORIES, CONTENT_BANK_CATEGORY_LABELS, CONTENT_BANK_READINESS, USAGE_STATUSES,
  type ContentBankEntry, type SourceUsageRecord,
} from "./schemas";
import { toggleAllowReuseAction, archiveContentBankEntryAction, loadContentBankUsageAction } from "./actions";
import { ContentBankEntryForm } from "./content-bank-entry-form";

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
      {use.newsletterId ? <a href={`/client/${clientId}/newsletter?edition=${use.newsletterId}`} className="text-small text-brand-purple underline">Open newsletter edition</a>
        : use.postId ? <a href={`/client/${clientId}/posts/${use.postId}/review`} className="text-small text-brand-purple underline">Open post</a>
        : use.contentIdeaId ? <a href={`/client/${clientId}/ideas`} className="text-small text-brand-purple underline">Open Ideas</a>
          : use.channel === "newsletter" || use.channel === "calendar_slot" ? <a href={`/client/${clientId}/${use.channel === "newsletter" ? "newsletter" : "calendar"}`} className="text-small text-brand-purple underline">Open {use.channel === "newsletter" ? "Newsletter" : "Calendar"}</a>
            : <p className="text-caption text-muted-foreground">No linked output is available.</p>}
      <span className="text-caption text-muted-foreground">Updated {formatUtcDate(use.updatedAt)}</span>
    </div>)}
  </div>;
}

export function ContentBankPanel({ clientId, role, permissions, entries }: {
  clientId: string; role: EffectiveClientRole; permissions: ClientPermission[]; entries: ContentBankEntry[];
}) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedReadiness, setSelectedReadiness] = useState("all");
  const [selectedUsage, setSelectedUsage] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editor, setEditor] = useState<ContentBankEntry | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = canRoleManageClientSetup(role);
  const canManageExperiences = canRoleManageFounderExperiences(role, permissions);
  const canManageReactions = canRoleContributeResearch(role, permissions);
  const canManageIdeas = canRoleManageIdeas(role, permissions);
  const canUseNewsletter = canManageIdeas && canRoleDraftPosts(role, permissions);
  function canEdit(entry: ContentBankEntry) {
    return entry.sourceType === "content_resource" ? isAdmin
      : entry.entryType === "trend_reaction" ? canManageReactions : canManageExperiences;
  }
  const filteredEntries = entries.filter((entry) => {
    if (selectedCategory !== "all" && entry.category !== selectedCategory) return false;
    if (selectedReadiness !== "all" && entry.readiness !== selectedReadiness) return false;
    if (selectedUsage !== "all" && entry.usageStatus !== selectedUsage) return false;
    const query = searchQuery.trim().toLowerCase();
    return !query || [entry.title, entry.rawNotes, entry.takeaway, entry.whatHappened,
      entry.whatWasLearned, entry.whatChanged, entry.whyItMatters, entry.description,
      entry.problemSolved, entry.targetUseCase, entry.keyword].some((value) => value?.toLowerCase().includes(query));
  });

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
    <div className="flex flex-wrap items-center gap-3">
      {canManageExperiences || isAdmin ? <Button type="button" variant="brand" disabled={isPending || editor !== null} onClick={() => { setEditor("new"); setError(null); setSuccess(null); }}>
        <Plus className="h-4 w-4" /> Capture entry
      </Button> : null}
      <span className="text-small text-muted-foreground">{entries.length} entries · reuse is always deliberate</span>
      <a href={`/client/${clientId}/founder-experiences`} className="text-small text-brand-purple underline">Founder Experiences</a>
      <a href={`/client/${clientId}/resources`} className="text-small text-brand-purple underline">Content Resources</a>
    </div>
    {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
    {success ? <p role="status" className="text-small text-success-strong">{success}</p> : null}
    {editor ? <ContentBankEntryForm key={editor === "new" ? "new" : `${editor.sourceType}:${editor.id}`}
      clientId={clientId} entry={editor === "new" ? undefined : editor}
      canManageExperiences={canManageExperiences} canManageResources={isAdmin}
      onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); setError(null); setSuccess("Entry saved."); router.refresh(); }}
    /> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1.5 text-small">Search
        <span className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search notes, details, keywords" className="pl-9" />
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-small">Category
        <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className={selectClass}>
          <option value="all">All categories</option>
          {CONTENT_BANK_CATEGORIES.map((value) => <option key={value} value={value}>{CONTENT_BANK_CATEGORY_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-small">Readiness
        <select value={selectedReadiness} onChange={(event) => setSelectedReadiness(event.target.value)} className={selectClass}>
          <option value="all">All readiness</option>
          {CONTENT_BANK_READINESS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-small">Usage
        <select value={selectedUsage} onChange={(event) => setSelectedUsage(event.target.value)} className={selectClass}>
          <option value="all">All usage</option>
          {USAGE_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
    {filteredEntries.length === 0 ? <EmptyState icon={BookOpen} title="No Content Bank entries found" description="Capture an experience or resource, or change your filters." />
      : <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filteredEntries.map((entry) => {
          const isResource = entry.sourceType === "content_resource";
          const editable = canEdit(entry);
          const available = entry.readiness === "ready" && (!isResource || entry.active);
          return <Card key={`${entry.sourceType}:${entry.id}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={isResource ? "accent-purple" : "neutral"}>{CONTENT_BANK_CATEGORY_LABELS[entry.category]}</Badge>
                <Badge variant="outline">{entry.readiness}</Badge>
                <Badge variant={entry.usageStatus === "published" ? "success" : "neutral"}>{entry.usageStatus}</Badge>
                {entry.entryType === "trend_reaction" ? <Badge variant="info">Trend reaction</Badge> : null}
              </div>
              <CardTitle className="mt-2 leading-snug">{entry.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Detail label={isResource ? "Problem solved" : "Takeaway"} value={isResource ? entry.problemSolved : entry.takeaway} />
              {isResource ? <div className="flex flex-wrap gap-2">
                <Badge variant={entry.active ? "success" : "neutral"}>{entry.active ? "Active" : "Inactive"}</Badge>
                <Badge variant={entry.commentGateApproved ? "success" : "neutral"}>{entry.commentGateApproved ? "Comment CTA approved" : "Comment CTA not approved"}</Badge>
                {entry.keyword ? <Badge variant="outline">Keyword: {entry.keyword}</Badge> : null}
              </div> : null}
              <details className="rounded-control border border-border-grey p-3">
                <summary className="cursor-pointer text-small font-medium">View complete entry</summary>
                <div className="mt-3 flex flex-col gap-3">
                  <Detail label="Raw notes" value={entry.rawNotes} />
                  {isResource ? <>
                    <Detail label="Resource type" value={entry.resourceType} />
                    <Detail label="Resource description" value={entry.description} />
                    <Detail label="Target use case" value={entry.targetUseCase} />
                    <Detail label="Delivery URL" value={entry.deliveryUrl} />
                    {entry.deliveryUrl && /^https?:\/\//i.test(entry.deliveryUrl) ? <a href={entry.deliveryUrl} target="_blank" rel="noreferrer" className="text-small text-brand-purple underline">Open delivery link</a> : null}
                    <Detail label="Manual delivery instructions" value={entry.deliveryInstructions} />
                  </> : <>
                    <Detail label="What happened / proof" value={entry.whatHappened} />
                    <Detail label={entry.entryType === "trend_reaction" ? "Your take" : "What was learned"} value={entry.whatWasLearned} />
                    <Detail label="What changed" value={entry.whatChanged} />
                    <Detail label="Why it matters" value={entry.whyItMatters} />
                    <Detail label="Reaction type" value={entry.reactionType} />
                    {entry.sourceTrendCardId ? <a href={`/client/${clientId}/research`} className="text-small text-brand-purple underline">Open Research</a> : null}
                  </>}
                  <p className="text-caption text-muted-foreground">Created {formatUtcDate(entry.createdAt)} · Updated {formatUtcDate(entry.updatedAt)} · {entry.usageCount} recorded successful uses</p>
                  <UsageHistory clientId={clientId} entry={entry} />
                </div>
              </details>
              <div className="flex flex-wrap items-center gap-2 border-t border-border-grey pt-3">
                {editable ? <Button type="button" size="sm" variant="outline" disabled={isPending || editor !== null} onClick={() => { setEditor(entry); setError(null); setSuccess(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil className="h-4 w-4" /> Edit</Button> : null}
                <Button type="button" size="sm" variant="ghost" disabled={!editable || isPending || editor !== null} onClick={() => mutate(entry, "reuse")}><RefreshCw className="h-4 w-4" />{entry.allowReuse ? "Reusable" : "Single-use"}</Button>
                {editable && entry.readiness !== "archived" ? <Button type="button" size="sm" variant="ghost" disabled={isPending || editor !== null} onClick={() => mutate(entry, "archive")}><Archive className="h-4 w-4" /> Archive</Button> : null}
                {available && canUseNewsletter ? <a href={`/client/${clientId}/newsletter?new=true&sources=${entry.id}`} className="text-small text-brand-purple underline">Use in newsletter</a> : null}
                {available && canManageIdeas ? <a href={`/client/${clientId}/ideas`} className="text-small text-brand-purple underline">Open Ideas</a> : null}
              </div>
            </CardContent>
          </Card>;
        })}
      </div>}
  </div>;
}
