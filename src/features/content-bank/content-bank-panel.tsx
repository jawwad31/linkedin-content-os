"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  BookOpen,
  CheckCircle,
  Clock,
  ExternalLink,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EffectiveClientRole, ClientPermission } from "@/lib/access/roles";
import {
  canRoleManageClientSetup,
  canRoleManageFounderExperiences,
} from "@/lib/access/roles";

import {
  CONTENT_BANK_CATEGORIES,
  CONTENT_BANK_CATEGORY_LABELS,
  type ContentBankCategory,
  type ContentBankEntry,
  type ContentBankReadiness,
  type LeadMagnetType,
} from "./schemas";
import {
  createContentBankEntryAction,
  toggleAllowReuseAction,
  archiveContentBankEntryAction,
} from "./actions";

interface ContentBankPanelProps {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  entries: ContentBankEntry[];
}

export function ContentBankPanel({
  clientId,
  role,
  permissions,
  entries: initialEntries,
}: ContentBankPanelProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedReadiness, setSelectedReadiness] = useState<string>("all");
  const [selectedUsage, setSelectedUsage] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);

  const [isPending, startTransition] = useTransition();

  const isAdmin = canRoleManageClientSetup(role);
  const canManageExperiences = canRoleManageFounderExperiences(role, permissions);

  // Capture Form State
  const [formCategory, setFormCategory] =
    useState<ContentBankCategory>("observation");
  const [formTitle, setFormTitle] = useState("");
  const [formRawNotes, setFormRawNotes] = useState("");
  const [formTakeaway, setFormTakeaway] = useState("");
  const [formResourceType, setFormResourceType] =
    useState<LeadMagnetType>("guide");
  const [formKeyword, setFormKeyword] = useState("");
  const [formDeliveryUrl, setFormDeliveryUrl] = useState("");
  const [formAllowReuse, setFormAllowReuse] = useState(false);
  const [formReadiness, setFormReadiness] =
    useState<ContentBankReadiness>("ready");
  const [formError, setFormError] = useState<string | null>(null);

  // Filter entries
  const filteredEntries = entries.filter((e) => {
    if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
    if (selectedReadiness !== "all" && e.readiness !== selectedReadiness) return false;
    if (selectedUsage !== "all" && e.usageStatus !== selectedUsage) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        e.title.toLowerCase().includes(q) ||
        (e.rawNotes && e.rawNotes.toLowerCase().includes(q)) ||
        (e.takeaway && e.takeaway.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const handleToggleReuse = (entry: ContentBankEntry) => {
    const nextVal = !entry.allowReuse;
    // Optimistic update
    setEntries((prev) =>
      prev.map((item) =>
        item.id === entry.id ? { ...item, allowReuse: nextVal } : item,
      ),
    );

    startTransition(async () => {
      const res = await toggleAllowReuseAction(
        clientId,
        entry.id,
        entry.sourceType,
        nextVal,
      );
      if (res.error) {
        // Rollback on error
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entry.id ? { ...item, allowReuse: entry.allowReuse } : item,
          ),
        );
      }
    });
  };

  const handleArchive = (entry: ContentBankEntry) => {
    if (!confirm("Are you sure you want to archive this entry?")) return;

    setEntries((prev) =>
      prev.map((item) =>
        item.id === entry.id ? { ...item, readiness: "archived" } : item,
      ),
    );

    startTransition(async () => {
      await archiveContentBankEntryAction(clientId, entry.id, entry.sourceType);
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError("Title is required.");
      return;
    }

    startTransition(async () => {
      const res = await createContentBankEntryAction(clientId, {
        category: formCategory,
        title: formTitle.trim(),
        rawNotes: formRawNotes.trim() || undefined,
        takeaway: formTakeaway.trim() || undefined,
        resourceType: formCategory === "lead_magnet" ? formResourceType : undefined,
        keyword: formCategory === "lead_magnet" ? formKeyword.trim() || undefined : undefined,
        deliveryUrl: formCategory === "lead_magnet" ? formDeliveryUrl.trim() || undefined : undefined,
        allowReuse: formAllowReuse,
        readiness: formReadiness,
      });

      if (res.error) {
        setFormError(res.error);
      } else {
        setIsCaptureOpen(false);
        // Reset form
        setFormTitle("");
        setFormRawNotes("");
        setFormTakeaway("");
        setFormKeyword("");
        setFormDeliveryUrl("");
        setFormAllowReuse(false);
        window.location.reload();
      }
    });
  };

  const getCategoryBadgeVariant = (
    category: ContentBankCategory,
  ): "neutral" | "accent-orange" | "accent-purple" | "info" | "success" | "warning" => {
    switch (category) {
      case "lead_magnet":
        return "accent-purple";
      case "problem_solved":
        return "accent-orange";
      case "case_study":
        return "info";
      case "experiment":
        return "accent-purple";
      case "achievement":
        return "success";
      case "lesson":
        return "warning";
      default:
        return "neutral";
    }
  };

  const getUsageBadge = (entry: ContentBankEntry) => {
    switch (entry.usageStatus) {
      case "published":
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" /> Published
          </Badge>
        );
      case "used":
        return (
          <Badge variant="accent-purple" className="gap-1">
            <Clock className="h-3 w-3" /> Used ({entry.usageCount})
          </Badge>
        );
      case "reserved":
        return (
          <Badge variant="info" className="gap-1">
            <Layers className="h-3 w-3" /> In Draft
          </Badge>
        );
      case "unused":
      default:
        return (
          <Badge variant="neutral" className="gap-1">
            Unused
          </Badge>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top action & search bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, observations, takeaways..."
            className="pl-9 bg-surface-container-lowest"
          />
        </div>

        {(canManageExperiences || isAdmin) && (
          <button
            type="button"
            onClick={() => setIsCaptureOpen(true)}
            className={cn(
              buttonVariants({ variant: "brand" }),
              "gap-2 self-start sm:self-auto",
            )}
          >
            <Plus className="h-4 w-4" />
            Capture Entry
          </button>
        )}
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small font-semibold text-muted-foreground mr-1">
          Category:
        </span>
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={cn(
            "rounded-full px-3 py-1 text-caption font-medium transition-colors",
            selectedCategory === "all"
              ? "bg-near-black text-white"
              : "bg-surface-container-low text-muted-foreground hover:bg-surface-container",
          )}
        >
          All ({entries.length})
        </button>
        {CONTENT_BANK_CATEGORIES.map((cat) => {
          const count = entries.filter((e) => e.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "rounded-full px-3 py-1 text-caption font-medium transition-colors",
                selectedCategory === cat
                  ? "bg-near-black text-white"
                  : "bg-surface-container-low text-muted-foreground hover:bg-surface-container",
              )}
            >
              {CONTENT_BANK_CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Readiness & Usage sub-filters */}
      <div className="flex flex-wrap items-center gap-4 text-small text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Readiness:</span>
          <select
            value={selectedReadiness}
            onChange={(e) => setSelectedReadiness(e.target.value)}
            className="rounded-md border border-border-grey bg-surface-container-lowest px-2 py-1 text-caption"
          >
            <option value="all">All</option>
            <option value="ready">Ready</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span>Usage:</span>
          <select
            value={selectedUsage}
            onChange={(e) => setSelectedUsage(e.target.value)}
            className="rounded-md border border-border-grey bg-surface-container-lowest px-2 py-1 text-caption"
          >
            <option value="all">All</option>
            <option value="unused">Unused</option>
            <option value="reserved">In Draft</option>
            <option value="used">Used</option>
            <option value="published">Published</option>
          </select>
        </div>
      </div>

      {/* Capture Modal / Form */}
      {isCaptureOpen && (
        <Card className="border-2 border-brand-orange/40 bg-surface-container-lowest shadow-md">
          <CardHeader>
            <CardTitle className="text-card-title flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-orange" />
              Capture Experience or Asset
            </CardTitle>
            <p className="text-caption text-muted-foreground">
              Type thoughts or paste raw meeting notes and transcripts. Set a category,
              key takeaway, and optional reuse permissions.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
              {formError && (
                <div className="rounded-md bg-danger/10 p-3 text-small text-danger-strong">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-small font-medium">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) =>
                      setFormCategory(e.target.value as ContentBankCategory)
                    }
                    className="rounded-md border border-border-grey bg-white px-3 py-2 text-small"
                  >
                    {CONTENT_BANK_CATEGORIES.map((c) => (
                      <option
                        key={c}
                        value={c}
                        disabled={c === "lead_magnet" && !isAdmin}
                      >
                        {CONTENT_BANK_CATEGORY_LABELS[c]}
                        {c === "lead_magnet" && !isAdmin ? " (Admin only)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-small font-medium">Readiness</label>
                  <select
                    value={formReadiness}
                    onChange={(e) =>
                      setFormReadiness(e.target.value as ContentBankReadiness)
                    }
                    className="rounded-md border border-border-grey bg-white px-3 py-2 text-small"
                  >
                    <option value="ready">Ready (Eligible for planning & drafting)</option>
                    <option value="draft">Draft (Notes in progress)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-small font-medium">Title / Short Working Headline *</label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Why we shifted our client onboarding from 14 days to 3 days"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-small font-medium">
                  Raw Notes / Pasted Transcript (Free-form)
                </label>
                <Textarea
                  value={formRawNotes}
                  onChange={(e) => setFormRawNotes(e.target.value)}
                  placeholder="Paste raw conversation notes, voice transcript, thoughts, or client feedback here..."
                  rows={4}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-small font-medium">
                  Primary Takeaway / Core Insight
                </label>
                <Input
                  value={formTakeaway}
                  onChange={(e) => setFormTakeaway(e.target.value)}
                  placeholder="What is the single counterintuitive lesson or result the reader should remember?"
                />
              </div>

              {formCategory === "lead_magnet" && (
                <div className="rounded-lg border border-brand-purple/20 bg-surface-container-low p-4 flex flex-col gap-3">
                  <span className="text-small font-semibold text-secondary-dark">
                    Lead Magnet Details
                  </span>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-caption font-medium">Asset Type</label>
                      <select
                        value={formResourceType}
                        onChange={(e) =>
                          setFormResourceType(e.target.value as LeadMagnetType)
                        }
                        className="mt-1 w-full rounded-md border border-border-grey bg-white px-2.5 py-1.5 text-small"
                      >
                        <option value="guide">Guide</option>
                        <option value="template">Template</option>
                        <option value="checklist">Checklist</option>
                        <option value="framework">Framework</option>
                        <option value="report">Report</option>
                        <option value="worksheet">Worksheet</option>
                        <option value="tool">Tool</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-caption font-medium">
                        Comment-Gating Keyword
                      </label>
                      <Input
                        value={formKeyword}
                        onChange={(e) => setFormKeyword(e.target.value)}
                        placeholder="e.g. AUDIT"
                        className="mt-1 bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-caption font-medium">
                      Delivery URL (Optional)
                    </label>
                    <Input
                      value={formDeliveryUrl}
                      onChange={(e) => setFormDeliveryUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1 bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="formAllowReuse"
                  checked={formAllowReuse}
                  onChange={(e) => setFormAllowReuse(e.target.checked)}
                  className="h-4 w-4 rounded border-border-grey"
                />
                <label htmlFor="formAllowReuse" className="text-small cursor-pointer">
                  <span className="font-medium">Allow multi-angle reuse</span>
                  <span className="block text-caption text-muted-foreground">
                    When enabled, this entry can be drafted into multiple distinct posts.
                    Otherwise, it is single-use only.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-grey">
                <button
                  type="button"
                  onClick={() => setIsCaptureOpen(false)}
                  className={cn(buttonVariants({ variant: "outline" }))}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: "brand" }))}
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Save to Content Bank"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Entry Cards List */}
      {filteredEntries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No Content Bank entries found"
          description="Capture original moments, case studies, experiments, or lead magnets to build your content engine."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredEntries.map((entry) => {
            const canEdit =
              entry.category === "lead_magnet" ? isAdmin : canManageExperiences;

            return (
              <Card
                key={`${entry.sourceType}-${entry.id}`}
                className={cn(
                  "flex flex-col justify-between transition-shadow hover:shadow-sm",
                  entry.readiness === "archived" && "opacity-60 bg-muted/30",
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant={getCategoryBadgeVariant(entry.category)}>
                      {CONTENT_BANK_CATEGORY_LABELS[entry.category]}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {getUsageBadge(entry)}
                      {entry.readiness !== "ready" && (
                        <Badge variant="outline" className="text-caption uppercase">
                          {entry.readiness}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardTitle className="text-card-title mt-2 leading-snug">
                    {entry.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex flex-col gap-3 pb-4">
                  {entry.takeaway && (
                    <p className="text-small font-medium text-foreground line-clamp-2">
                      <span className="text-muted-foreground font-normal">Takeaway: </span>
                      {entry.takeaway}
                    </p>
                  )}

                  {entry.rawNotes && !entry.takeaway && (
                    <p className="text-small text-muted-foreground line-clamp-3">
                      {entry.rawNotes}
                    </p>
                  )}

                  {entry.category === "lead_magnet" && entry.keyword && (
                    <div className="rounded bg-surface-container px-2 py-1 text-caption text-secondary-dark w-fit">
                      Keyword: <strong>{entry.keyword}</strong>
                    </div>
                  )}

                  {/* Reuse switch & usage controls */}
                  {entry.readiness === "ready" && (isAdmin || permissions.includes("ideas_manage") && permissions.includes("posts_draft")) ? (
                    <a href={`/client/${clientId}/newsletter?new=true&sources=${entry.id}`} className="text-small font-medium text-brand-purple underline">Use in newsletter</a>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between border-t border-border-grey pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => canEdit && handleToggleReuse(entry)}
                        disabled={!canEdit || isPending}
                        title={
                          entry.allowReuse
                            ? "Multi-angle reuse enabled (Click to make single-use)"
                            : "Single-use entry (Click to allow reuse)"
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium border transition-colors",
                          entry.allowReuse
                            ? "bg-brand-purple/10 border-brand-purple/30 text-secondary-dark"
                            : "bg-surface-container-low border-border-grey text-muted-foreground",
                          !canEdit && "cursor-not-allowed opacity-75",
                        )}
                      >
                        <RefreshCw
                          className={cn(
                            "h-3 w-3",
                            entry.allowReuse && "text-brand-purple",
                          )}
                        />
                        {entry.allowReuse ? "Reusable" : "Single-use"}
                      </button>

                      {entry.readiness !== "archived" && canEdit && (
                        <button
                          type="button"
                          onClick={() => handleArchive(entry)}
                          className="text-caption text-muted-foreground hover:text-danger-strong p-1"
                          title="Archive entry"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <a
                      href={`/client/${clientId}/posts?sourceId=${entry.id}`}
                      className="text-small font-medium text-brand-orange hover:underline inline-flex items-center gap-1"
                    >
                      Draft Post
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
