"use client";

import * as React from "react";
import { CircleCheck, CircleX, ListChecks, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  batchArticleStatusResultSchema,
  type ArticleBatchStatus,
} from "@/lib/bulk-edit/contracts";
import {
  BATCH_DELETE_MAX_ITEMS,
  batchDeleteResultSchema,
  type BatchDeleteEntityType,
  type BatchDeleteFailure,
  type BatchDeleteResult,
} from "@/lib/bulk-delete/contracts";

function failureSummary(
  failures: Array<Pick<BatchDeleteFailure, "message">>,
): string {
  const groups = new Map<string, number>();
  for (const failure of failures) {
    groups.set(failure.message, (groups.get(failure.message) ?? 0) + 1);
  }

  const summaries = Array.from(groups, ([message, count]) =>
    count === 1 ? message : `${count} records: ${message}`,
  );
  const visible = summaries.slice(0, 3).join(" ");
  return summaries.length > 3
    ? `${visible} ${summaries.length - 3} more error types occurred.`
    : visible;
}

export function useBulkSelection(visibleIds: string[]) {
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedState, setSelectedState] = React.useState<Set<string>>(
    () => new Set(),
  );
  const anchorIdRef = React.useRef<string | null>(null);
  const selectedIds = visibleIds.filter((id) => selectedState.has(id));
  const selectableIds = visibleIds.slice(0, BATCH_DELETE_MAX_ITEMS);
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedState.has(id));
  const someSelected = selectedIds.length > 0;
  const isIndeterminate = someSelected && !allSelected;
  const limitReached = selectedIds.length >= BATCH_DELETE_MAX_ITEMS;

  function clearSelection() {
    setSelectedState(new Set());
    anchorIdRef.current = null;
  }

  return {
    isSelectionMode,
    selectedIds,
    allSelected,
    someSelected,
    isIndeterminate,
    limitReached,
    isSelected: (id: string) => selectedState.has(id),
    enter() {
      clearSelection();
      setIsSelectionMode(true);
    },
    cancel() {
      clearSelection();
      setIsSelectionMode(false);
    },
    clear: clearSelection,
    toggle(id: string, extendRange = false) {
      setSelectedState((current) => {
        const next = new Set(current);
        const anchorId = anchorIdRef.current;

        if (extendRange && anchorId) {
          const anchorIndex = visibleIds.indexOf(anchorId);
          const currentIndex = visibleIds.indexOf(id);
          if (anchorIndex >= 0 && currentIndex >= 0) {
            const start = Math.min(anchorIndex, currentIndex);
            const end = Math.max(anchorIndex, currentIndex);
            for (const rangeId of visibleIds.slice(start, end + 1)) {
              if (next.size >= BATCH_DELETE_MAX_ITEMS) break;
              next.add(rangeId);
            }
            anchorIdRef.current = id;
            return next;
          }
        }

        if (next.has(id)) {
          next.delete(id);
        } else if (next.size < BATCH_DELETE_MAX_ITEMS) {
          next.add(id);
        }
        anchorIdRef.current = id;
        return next;
      });
    },
    toggleAll() {
      setSelectedState(
        allSelected
          ? new Set()
          : new Set(selectableIds),
      );
      anchorIdRef.current = null;
    },
    retain(ids: string[]) {
      const retained = ids.filter((id) => visibleIds.includes(id));
      setSelectedState(new Set(retained));
      setIsSelectionMode(retained.length > 0);
      anchorIdRef.current = null;
    },
  };
}

export type BulkSelection = ReturnType<typeof useBulkSelection>;

export function BulkDeleteControls({
  clientId,
  entityType,
  recordLabel,
  pluralLabel,
  visibleCount,
  selection,
  allowDelete = true,
  articleStatusActions = false,
}: {
  clientId: string;
  entityType: BatchDeleteEntityType;
  recordLabel: string;
  pluralLabel: string;
  visibleCount: number;
  selection: BulkSelection;
  allowDelete?: boolean;
  articleStatusActions?: boolean;
}) {
  const router = useRouter();
  const masterCheckboxRef = React.useRef<HTMLInputElement>(null);
  const latestOutcome = React.useRef<BatchDeleteResult | null>(null);
  const [pendingIds, setPendingIds] = React.useState<string[]>([]);
  const [pendingStatus, setPendingStatus] =
    React.useState<ArticleBatchStatus | null>(null);
  const [open, setOpen] = React.useState(false);
  const [resultMessage, setResultMessage] = React.useState<{
    tone: "success" | "warning";
    text: string;
  } | null>(null);

  React.useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = selection.isIndeterminate;
    }
  }, [selection.isIndeterminate]);

  const openConfirmation = () => {
    if (selection.selectedIds.length === 0) return;
    setPendingIds([...selection.selectedIds]);
    setResultMessage(null);
    setOpen(true);
  };

  const updateSelectedStatus = async (targetStatus: ArticleBatchStatus) => {
    if (selection.selectedIds.length === 0 || pendingStatus) return;

    setPendingStatus(targetStatus);
    setResultMessage(null);

    try {
      const response = await fetch(
        `/api/client/${encodeURIComponent(clientId)}/market-items/batch-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: selection.selectedIds,
            targetStatus,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            data?: unknown;
            error?: { message?: string } | null;
          }
        | null;

      if (!response.ok) {
        setResultMessage({
          tone: "warning",
          text: payload?.error?.message ?? "Batch update failed.",
        });
        return;
      }

      const parsed = batchArticleStatusResultSchema.safeParse(payload?.data);
      if (!parsed.success) {
        setResultMessage({
          tone: "warning",
          text: "The server returned an invalid batch result.",
        });
        return;
      }

      const failedIds = parsed.data.failures.map((failure) => failure.id);
      selection.retain(failedIds);

      const statusLabel = targetStatus === "relevant" ? "relevant" : "irrelevant";
      if (parsed.data.failures.length === 0) {
        setResultMessage({
          tone: "success",
          text: `${parsed.data.updatedIds.length} article${
            parsed.data.updatedIds.length === 1 ? "" : "s"
          } marked ${statusLabel}.`,
        });
      } else {
        setResultMessage({
          tone: "warning",
          text: `${parsed.data.updatedIds.length} updated; ${
            parsed.data.failures.length
          } kept. ${failureSummary(parsed.data.failures)}`,
        });
      }
      router.refresh();
    } catch {
      setResultMessage({
        tone: "warning",
        text: "The request could not reach the server.",
      });
    } finally {
      setPendingStatus(null);
    }
  };

  return (
    <div className="relative">
      {!selection.isSelectionMode ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setResultMessage(null);
            selection.enter();
          }}
        >
          <ListChecks aria-hidden="true" className="h-4 w-4" />
          Select {pluralLabel}
        </Button>
      ) : (
        <div
          role="toolbar"
          aria-label={`${pluralLabel} selection actions`}
          className="sticky top-3 z-30 flex flex-col gap-2 rounded-card border border-brand-purple/25 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center"
        >
          <label className="inline-flex cursor-pointer items-center gap-2 text-small font-medium text-near-black">
            <input
              ref={masterCheckboxRef}
              type="checkbox"
              checked={selection.allSelected}
              onChange={selection.toggleAll}
              className="h-4 w-4 rounded border-border-grey accent-brand-purple"
              aria-label={`Select this page of ${pluralLabel}`}
            />
            <span>
              {selection.allSelected ? "Page selected" : "Select page"}
            </span>
          </label>

          <span
            role="status"
            aria-live="polite"
            className="text-small text-muted-foreground"
          >
            {selection.selectedIds.length} of {visibleCount} selected
          </span>

          {visibleCount > BATCH_DELETE_MAX_ITEMS || selection.limitReached ? (
            <span className="text-caption font-medium text-warning-strong">
              Maximum {BATCH_DELETE_MAX_ITEMS} per batch
            </span>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {articleStatusActions ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selection.someSelected || pendingStatus !== null}
                  onClick={() => updateSelectedStatus("relevant")}
                >
                  <CircleCheck aria-hidden="true" className="h-4 w-4" />
                  {pendingStatus === "relevant"
                    ? "Marking..."
                    : "Mark relevant"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selection.someSelected || pendingStatus !== null}
                  onClick={() => updateSelectedStatus("irrelevant")}
                >
                  <CircleX aria-hidden="true" className="h-4 w-4" />
                  {pendingStatus === "irrelevant"
                    ? "Marking..."
                    : "Mark irrelevant"}
                </Button>
              </>
            ) : null}
            {selection.someSelected ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selection.clear}
              >
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={selection.cancel}
            >
              <X aria-hidden="true" className="h-4 w-4" />
              Cancel
            </Button>
            {allowDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!selection.someSelected || pendingStatus !== null}
                onClick={openConfirmation}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Delete selected
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {resultMessage ? (
        <p
          role="status"
          className={
            "mt-2 rounded-control border px-3 py-2 text-small font-medium " +
            (resultMessage.tone === "success"
              ? "border-success/20 bg-success/5 text-success-strong"
              : "border-warning/20 bg-warning/5 text-warning-strong")
          }
        >
          {resultMessage.text}
        </p>
      ) : null}

      {allowDelete ? (
        <DestructiveConfirmDialog
        open={open}
        onOpenChange={setOpen}
        recordType={recordLabel}
        recordTitle={`${pendingIds.length} selected ${pluralLabel}`}
        dialogTitle={`Delete ${pendingIds.length} selected ${pluralLabel}?`}
        description="Eligible records will be permanently deleted. Records still used by active content will be kept and reported. This action cannot be undone."
        requiresTypedConfirmation
        confirmLabel="Delete selected"
        pendingLabel="Deleting selected..."
        onConfirm={async () => {
          try {
            const response = await fetch(
              `/api/client/${encodeURIComponent(clientId)}/batch-delete`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  entityType,
                  ids: pendingIds,
                  confirmDelete: "DELETE",
                }),
              },
            );
            const payload = (await response.json().catch(() => null)) as
              | {
                  data?: unknown;
                  error?: { message?: string } | null;
                }
              | null;

            if (!response.ok) {
              return {
                ok: false,
                error: payload?.error?.message ?? "Batch deletion failed.",
              };
            }

            const parsed = batchDeleteResultSchema.safeParse(payload?.data);
            if (!parsed.success) {
              return {
                ok: false,
                error: "The server returned an invalid batch result.",
              };
            }

            latestOutcome.current = parsed.data;
            return { ok: true };
          } catch {
            return {
              ok: false,
              error: "The request could not reach the server.",
            };
          }
        }}
        onSuccess={() => {
          const outcome = latestOutcome.current;
          if (!outcome) return;

          const failedIds = outcome.failures.map((failure) => failure.id);
          selection.retain(failedIds);
          if (outcome.failures.length === 0) {
            setResultMessage({
              tone: "success",
              text: `${outcome.deletedIds.length} ${
                outcome.deletedIds.length === 1 ? recordLabel : pluralLabel
              } deleted.`,
            });
          } else {
            setResultMessage({
              tone: "warning",
              text: `${outcome.deletedIds.length} deleted; ${outcome.failures.length} kept. ${failureSummary(
                outcome.failures,
              )}`,
            });
          }
          router.refresh();
        }}
        />
      ) : null}
    </div>
  );
}
