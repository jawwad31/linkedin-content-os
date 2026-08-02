import { Activity, BrainCircuit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatUtcDateTime } from "@/lib/format/date";

import type {
  OperationalAuditLog,
  OperationalLlmLog,
} from "./operational-logs-queries";

const ACTION_LABELS: Record<string, string> = {
  access_revoked: "Access Revoked",
  account_access_added: "Account Access Added",
  account_access_updated: "Account Access Updated",
  agency_access_added: "Agency Access Added",
  agency_access_revoked: "Agency Access Revoked",
  article_marked_irrelevant: "Article Marked Irrelevant",
  article_marked_relevant: "Article Marked Relevant",
  client_settings_updated: "Business Context Updated",
  content_idea_archived: "Content Idea Archived",
  content_idea_founder_direction_updated: "Founder Direction Updated",
  content_idea_marked_used: "Content Idea Marked Used",
  content_ideas_generated: "Content Ideas Generated",
  founder_experience_created: "Founder Experience Created",
  founder_experience_deleted: "Founder Experience Deleted",
  founder_experience_updated: "Founder Experience Updated",
  founder_take_added: "Founder Take Added",
  founder_take_updated: "Founder Take Updated",
  invitation_accepted: "Legacy Invitation Accepted",
  password_changed: "Password Changed",
  password_reset: "Password Reset by Administrator",
  post_approved: "Post Approved",
  post_archived: "Post Archived",
  post_generated: "Post Generated",
  post_marked_needs_edit: "Post Marked Needs Edit",
  post_marked_published: "Post Marked Published",
  post_rejected: "Post Rejected",
  research_classification_completed: "Research Classification Completed",
  research_classification_failed: "Research Classification Failed",
  research_run_completed: "Research Run Completed",
  research_run_failed: "Research Run Failed",
  research_run_skipped_locked: "Research Run Skipped",
  research_run_started: "Research Run Started",
  research_synthesis_completed: "TrendCard Synthesis Completed",
  research_synthesis_failed: "TrendCard Synthesis Failed",
  rss_source_created: "RSS Source Created",
  rss_source_deleted: "RSS Source Deleted",
  rss_source_toggled: "RSS Source Toggled",
  rss_source_updated: "RSS Source Updated",
  trend_card_approved_for_ideas: "TrendCard Approved for Ideas",
  trend_card_archived: "TrendCard Archived",
  trend_card_created: "TrendCard Created",
  trend_card_reaction_added: "Trend Reaction Added",
  user_created: "User Created",
  user_invited: "Legacy Invitation Created",
};

const FEATURE_LABELS: Record<string, string> = {
  content_agent: "Content Agent",
  planning_agent: "Planning Agent",
  research_classification: "Research Classification",
  research_signal_synthesis: "TrendCard Synthesis",
  trend_card_synthesis: "TrendCard Synthesis",
};

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length > 8 ? value.slice(0, 8) : value;
}

function formatScalar(value: unknown): string | null {
  if (typeof value === "string") return titleize(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

function metadataSummary(metadata: Record<string, unknown>): string[] {
  const summaries: string[] = [];

  const changedCount =
    typeof metadata.changed_count === "number"
      ? metadata.changed_count
      : Array.isArray(metadata.changed_fields)
        ? metadata.changed_fields.length
        : null;
  if (typeof changedCount === "number") {
    summaries.push(`Changed fields: ${changedCount}`);
  }

  const fields: Array<[string, string, "scalar" | "id"]> = [
    ["previous_status", "Previous", "scalar"],
    ["next_status", "Next", "scalar"],
    ["source_type", "Source", "scalar"],
    ["mode", "Mode", "scalar"],
    ["role", "Role", "scalar"],
    ["reaction_type", "Reaction", "scalar"],
    ["trigger_type", "Trigger", "scalar"],
    ["source_id", "Source ID", "id"],
    ["idea_id", "Idea ID", "id"],
    ["post_id", "Post ID", "id"],
    ["trend_card_id", "TrendCard ID", "id"],
    ["ideas_created", "Ideas", "scalar"],
    ["cards_created", "TrendCards", "scalar"],
    ["source_item_count", "Sources", "scalar"],
    ["confidence_score", "Confidence", "scalar"],
    ["attempted_item_count", "Attempted", "scalar"],
    ["items_marked_used", "Items used", "scalar"],
    ["synthesis_error_count", "Synthesis errors", "scalar"],
    ["classified_count", "Classified", "scalar"],
    ["relevant_count", "Relevant", "scalar"],
    ["irrelevant_count", "Irrelevant", "scalar"],
    ["error_count", "Errors", "scalar"],
    ["sources_processed", "RSS sources", "scalar"],
    ["total_new", "New articles", "scalar"],
    ["has_edit_note", "Edit note", "scalar"],
    ["previous_has_direction", "Had direction", "scalar"],
    ["next_has_direction", "Has direction", "scalar"],
    ["active", "Active", "scalar"],
    ["title_present", "Title present", "scalar"],
    ["source_name_present", "Source name present", "scalar"],
  ];

  for (const [key, label, type] of fields) {
    if (!(key in metadata)) continue;

    const formatted =
      type === "id" ? shortId(metadata[key]) : formatScalar(metadata[key]);
    if (formatted) summaries.push(`${label}: ${formatted}`);
  }

  return summaries.slice(0, 6);
}

function actorLabel(userId: string | null): string {
  return userId ? `User ${userId.slice(0, 8)}` : "System";
}

function statusVariant(
  status: OperationalLlmLog["status"],
): "success" | "danger" {
  return status === "success" ? "success" : "danger";
}

function formatCost(value: number | null): string {
  if (typeof value !== "number") return "Not tracked";
  return `$${value.toFixed(4)}`;
}

function ActivityRows({ logs }: { logs: OperationalAuditLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6">
        <EmptyState
          icon={Activity}
          title="No activity logged yet."
          description="Client activity will appear here after workflow actions run."
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-grey rounded-card border border-border-grey bg-white">
      {logs.map((log) => {
        const metadata = metadataSummary(log.metadata);

        return (
          <article
            key={log.id}
            className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">
                  {ACTION_LABELS[log.action] ?? titleize(log.action)}
                </Badge>
                <span className="text-caption text-muted-foreground">
                  {actorLabel(log.actorUserId)}
                </span>
              </div>
              {metadata.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {metadata.map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-soft-white px-2.5 py-1 text-caption text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <time className="font-mono text-caption text-muted-foreground lg:text-right">
              {formatUtcDateTime(log.createdAt)}
            </time>
          </article>
        );
      })}
    </div>
  );
}

function AiUsageRows({ logs }: { logs: OperationalLlmLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6">
        <EmptyState
          icon={BrainCircuit}
          title="No AI usage logged yet."
          description="AI usage metadata will appear here after agent actions run."
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-grey rounded-card border border-border-grey bg-white">
      {logs.map((log) => (
        <article
          key={log.id}
          className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_220px]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(log.status)}>
                {titleize(log.status)}
              </Badge>
              <h3 className="font-heading text-body text-near-black">
                {FEATURE_LABELS[log.feature] ?? titleize(log.feature)}
              </h3>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-soft-white px-2.5 py-1 font-mono text-caption text-muted-foreground">
                {log.provider} / {log.model}
              </span>
              <span className="rounded-full bg-soft-white px-2.5 py-1 text-caption text-muted-foreground">
                Input tokens: {log.tokenInputCount ?? "Not tracked"}
              </span>
              <span className="rounded-full bg-soft-white px-2.5 py-1 text-caption text-muted-foreground">
                Output tokens: {log.tokenOutputCount ?? "Not tracked"}
              </span>
              <span className="rounded-full bg-soft-white px-2.5 py-1 text-caption text-muted-foreground">
                Cost: {formatCost(log.estimatedCost)}
              </span>
              {log.errorType ? (
                <span className="rounded-full bg-danger/10 px-2.5 py-1 text-caption text-danger-strong">
                  Error: {titleize(log.errorType)}
                </span>
              ) : null}
            </div>
          </div>
          <time className="font-mono text-caption text-muted-foreground xl:text-right">
            {formatUtcDateTime(log.createdAt)}
          </time>
        </article>
      ))}
    </div>
  );
}

export function OperationalLogsPanel({
  auditLogs,
  llmLogs,
}: {
  auditLogs: OperationalAuditLog[];
  llmLogs: OperationalLlmLog[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity & AI Logs</CardTitle>
        <CardDescription>
          Owner-only operational view of recent client activity and safe AI
          usage metadata.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-3">
            <h2 className="font-heading text-card-title text-near-black">
              Recent Activity
            </h2>
            <p className="mt-1 text-small text-muted-foreground">
              Latest safe audit events for this client.
            </p>
          </div>
          <ActivityRows logs={auditLogs} />
        </section>

        <section className="min-w-0">
          <div className="mb-3">
            <h2 className="font-heading text-card-title text-near-black">
              Recent AI Usage
            </h2>
            <p className="mt-1 text-small text-muted-foreground">
              Metadata only. Prompts and provider responses are not shown.
            </p>
          </div>
          <AiUsageRows logs={llmLogs} />
        </section>
      </CardContent>
    </Card>
  );
}
