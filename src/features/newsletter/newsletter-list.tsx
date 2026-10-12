import Link from "next/link";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import type { EditionSummary } from "./contracts";

/** One line of status and the one next step, for an edition in the list. */
export function describeEdition(e: EditionSummary): {
  status: string;
  action: string;
  tone: "neutral" | "success" | "warning" | "info";
} {
  if (e.status === "published")
    return {
      status: e.published_on ? `Published ${e.published_on}` : "Published",
      action: "Open",
      tone: "success",
    };
  if (e.status === "approved" && e.approved_revision === e.revision)
    return {
      status: `Approved version ${e.revision}`,
      action: "Copy or export",
      tone: "success",
    };
  if (e.status === "rejected")
    return { status: "Edits requested", action: "Edit", tone: "warning" };
  if (e.hasQa)
    return {
      status:
        e.qaNotes === 0
          ? "Draft ready · no QA notes"
          : `Draft ready · ${e.qaNotes} QA ${e.qaNotes === 1 ? "note" : "notes"}`,
      action: "Review",
      tone: "info",
    };
  if (e.planStatus && e.planStatus !== "ready")
    return {
      status: "Needs more or different sources",
      action: "Open",
      tone: "warning",
    };
  if (!e.planStatus)
    return { status: "Outline not planned yet", action: "Plan outline", tone: "neutral" };
  if (e.outline_revision === e.revision)
    return {
      status: "Outline confirmed · not drafted yet",
      action: "Draft edition",
      tone: "info",
    };
  return { status: "Outline ready to review", action: "Review outline", tone: "info" };
}

export function NewsletterList({
  clientId,
  editions,
  canCreate,
}: {
  clientId: string;
  editions: EditionSummary[];
  canCreate: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Newsletter"
        description="Your newsletter editions and where each one stands."
        action={
          canCreate ? (
            <Link
              href={`/client/${clientId}/newsletter?new=true`}
              className={buttonVariants({ variant: "brand" })}
            >
              New edition
            </Link>
          ) : null
        }
      />
      {!editions.length ? (
        <p className="rounded-card border border-border-subtle bg-white p-6 text-small text-muted-foreground">
          No editions yet.
          {canCreate
            ? " Choose the Content Bank entries worth sharing and Virel will outline an edition for you to confirm."
            : ""}
        </p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-border-subtle bg-white">
          {editions.map((e) => {
            const d = describeEdition(e);
            return (
              <li
                key={e.id}
                className="flex items-center gap-4 border-b border-border-subtle p-4 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-muted-foreground"
                >
                  <Mail className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    href={`/client/${clientId}/newsletter?edition=${e.id}`}
                    className="truncate text-body font-medium text-near-black hover:underline"
                  >
                    {e.name}
                  </Link>
                  <span className="text-small text-muted-foreground">
                    {d.status}
                  </span>
                </div>
                <Badge variant={d.tone} className="hidden sm:inline-flex">
                  {e.status === "published"
                    ? "Published"
                    : e.status === "approved"
                      ? "Approved"
                      : e.hasQa
                        ? "In review"
                        : "Outline"}
                </Badge>
                <Link
                  href={`/client/${clientId}/newsletter?edition=${e.id}`}
                  className="shrink-0 text-small font-medium text-link underline"
                >
                  {d.action}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
