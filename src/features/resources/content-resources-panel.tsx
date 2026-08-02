"use client";

import { Archive, ExternalLink, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canRoleManageClientSetup, type EffectiveClientRole } from "@/lib/access/roles";
import { RESOURCE_TYPES } from "@/lib/ai/playbooks/taxonomies";

import type { ContentResource } from "./queries";

type DraftResource = {
  title: string;
  resourceType: (typeof RESOURCE_TYPES)[number];
  description: string;
  problemSolved: string;
  targetUseCase: string;
  keyword: string;
  deliveryUrl: string;
  deliveryInstructions: string;
  active: boolean;
  commentGateApproved: boolean;
};

const EMPTY_DRAFT: DraftResource = {
  title: "",
  resourceType: "guide",
  description: "",
  problemSolved: "",
  targetUseCase: "",
  keyword: "",
  deliveryUrl: "",
  deliveryInstructions: "",
  active: true,
  commentGateApproved: false,
};

function draftFromResource(resource: ContentResource): DraftResource {
  return {
    title: resource.title,
    resourceType: resource.resourceType,
    description: resource.description ?? "",
    problemSolved: resource.problemSolved ?? "",
    targetUseCase: resource.targetUseCase ?? "",
    keyword: resource.keyword,
    deliveryUrl: resource.deliveryUrl ?? "",
    deliveryInstructions: resource.deliveryInstructions ?? "",
    active: resource.active,
    commentGateApproved: resource.commentGateApproved,
  };
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ContentResourcesPanel({
  clientId,
  role,
  resources,
}: {
  clientId: string;
  role: EffectiveClientRole;
  resources: ContentResource[];
}) {
  const router = useRouter();
  const canManage = canRoleManageClientSetup(role);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResource>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");

  function edit(resource: ContentResource) {
    setEditingId(resource.id);
    setDraft(draftFromResource(resource));
    setShowForm(true);
    setState("idle");
  }

  function reset() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setShowForm(false);
    setState("idle");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("pending");
    const url = editingId
      ? `/api/client/${clientId}/resources/${editingId}`
      : `/api/client/${clientId}/resources`;
    try {
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!payload.success) {
        setState("error");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setState("error");
    }
  }

  async function archive(resource: ContentResource) {
    if (!window.confirm(`Archive "${resource.title}"? It will no longer be available for new ideas.`)) {
      return;
    }
    setState("pending");
    try {
      const response = await fetch(
        `/api/client/${clientId}/resources/${resource.id}`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!payload.success) {
        setState("error");
        return;
      }
      router.refresh();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div>
          <Button
            type="button"
            variant="brand"
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY_DRAFT);
              setShowForm((current) => !current);
            }}
          >
            {showForm && !editingId ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm && !editingId ? "Close form" : "Add Content Resource"}
          </Button>
        </div>
      ) : (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small text-muted-foreground">
          You can view and use approved resources. Client and Agency Admins manage them.
        </p>
      )}

      {showForm && canManage ? (
        <form onSubmit={save} className="grid grid-cols-1 gap-4 rounded-card border border-border-grey bg-soft-white p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="text-body font-semibold text-near-black">
              {editingId ? "Edit Content Resource" : "New Content Resource"}
            </h2>
            <p className="mt-1 text-small text-muted-foreground">
              Delivery remains manual. The app never fetches or sends this resource automatically.
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Title
            <Input
              value={draft.title}
              maxLength={200}
              required
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Type
            <select
              value={draft.resourceType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  resourceType: event.target.value as DraftResource["resourceType"],
                }))
              }
              className="h-10 rounded-control border border-border-grey bg-white px-3"
            >
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>{titleCase(type)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium sm:col-span-2">
            Description
            <Textarea
              value={draft.description}
              rows={3}
              maxLength={2_000}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Problem solved
            <Textarea
              value={draft.problemSolved}
              rows={3}
              maxLength={1_500}
              onChange={(event) => setDraft((current) => ({ ...current, problemSolved: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Target use case
            <Textarea
              value={draft.targetUseCase}
              rows={3}
              maxLength={1_500}
              onChange={(event) => setDraft((current) => ({ ...current, targetUseCase: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Comment keyword
            <Input
              value={draft.keyword}
              maxLength={40}
              placeholder="GUIDE"
              required
              onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value.toUpperCase() }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Delivery URL
            <Input
              type="url"
              value={draft.deliveryUrl}
              maxLength={2_000}
              placeholder="https://..."
              onChange={(event) => setDraft((current) => ({ ...current, deliveryUrl: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium sm:col-span-2">
            Delivery instructions
            <Textarea
              value={draft.deliveryInstructions}
              rows={3}
              maxLength={2_000}
              placeholder="Where the team can find it and how to send it manually."
              onChange={(event) => setDraft((current) => ({ ...current, deliveryInstructions: event.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-small font-medium">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-small font-medium">
            <input
              type="checkbox"
              checked={draft.commentGateApproved}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  commentGateApproved: event.target.checked,
                }))
              }
            />
            Approved for comment gating
          </label>
          {state === "error" ? (
            <p role="alert" className="text-small text-danger-strong sm:col-span-2">
              Could not save this resource. Check the required delivery details and try again.
            </p>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="brand" disabled={state === "pending"}>
              {state === "pending" ? "Saving..." : "Save Resource"}
            </Button>
            <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {resources.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-grey p-6 text-center text-small text-muted-foreground">
          No Content Resources yet. Add a real guide, template, checklist, report, worksheet, or tool before planning a resource post.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {resources.map((resource) => (
            <article key={resource.id} className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent-purple">{titleCase(resource.resourceType)}</Badge>
                <Badge variant={resource.active ? "success" : "outline"}>
                  {resource.active ? "Active" : "Inactive"}
                </Badge>
                {resource.commentGateApproved ? (
                  <Badge variant="warning">Comment Gate Approved</Badge>
                ) : null}
              </div>
              <div>
                <h2 className="text-body font-semibold text-near-black">{resource.title}</h2>
                {resource.description ? (
                  <p className="mt-1 whitespace-pre-line text-small text-muted-foreground">{resource.description}</p>
                ) : null}
              </div>
              {resource.problemSolved ? (
                <p className="text-small"><span className="font-medium">Problem:</span> {resource.problemSolved}</p>
              ) : null}
              {resource.targetUseCase ? (
                <p className="text-small"><span className="font-medium">Use case:</span> {resource.targetUseCase}</p>
              ) : null}
              <p className="font-mono text-small"><span className="font-sans font-medium">Keyword:</span> {resource.keyword}</p>
              {resource.deliveryUrl ? (
                <a
                  href={resource.deliveryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-small text-brand-purple hover:underline"
                >
                  Open delivery link <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {resource.deliveryInstructions ? (
                <details className="text-small">
                  <summary className="cursor-pointer font-medium">Delivery instructions</summary>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{resource.deliveryInstructions}</p>
                </details>
              ) : null}
              {canManage ? (
                <div className="mt-auto flex gap-2 border-t border-border-grey pt-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => edit(resource)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => archive(resource)} disabled={state === "pending"}>
                    <Archive className="h-4 w-4" /> Archive
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
