"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DestructiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: string;
  recordTitle: string;
  dialogTitle?: string;
  description?: string;
  requiresTypedConfirmation?: boolean;
  confirmLabel?: string;
  pendingLabel?: string;
  onConfirm: (confirmText?: string) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
}

export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  recordType,
  recordTitle,
  dialogTitle,
  description,
  requiresTypedConfirmation = false,
  confirmLabel = "Delete",
  pendingLabel = "Deleting...",
  onConfirm,
  onSuccess,
}: DestructiveConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [typedConfirmation, setTypedConfirmation] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const confirmationInputId = React.useId();

  const handleOpenChange = (nextOpen: boolean) => {
    // Prevent closing dialog while deletion is pending
    if (isDeleting) return;
    setError(null);
    setTypedConfirmation("");
    onOpenChange(nextOpen);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeleting) return;

    if (requiresTypedConfirmation && typedConfirmation !== "DELETE") {
      setError("Please type DELETE to confirm.");
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const res = await onConfirm(typedConfirmation);
      if (res.ok) {
        onOpenChange(false);
        setTypedConfirmation("");
        if (onSuccess) onSuccess();
      } else {
        setError(res.error || "An error occurred during deletion.");
      }
    } catch {
      setError("Failed to execute deletion. Please check your connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  const isDeleteDisabled =
    isDeleting ||
    (requiresTypedConfirmation && typedConfirmation !== "DELETE");

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/40 backdrop-blur-[2px] transition-all" />
        <Dialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-dialog bg-white p-6 shadow-2xl transition-all border border-border-grey focus:outline-none",
          )}
          aria-label={`Confirm delete ${recordType}`}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-body-lg font-heading font-semibold text-near-black">
              {dialogTitle ?? `Delete this ${recordType}?`}
            </h2>
            <Dialog.Close
              disabled={isDeleting}
              className="rounded-full p-1 text-muted-foreground hover:bg-soft-white disabled:pointer-events-none disabled:opacity-50"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleConfirm} className="mt-4 flex flex-col gap-4">
            <p className="text-small text-muted-foreground leading-relaxed">
              {description ?? (
                <>
                  This permanently deletes &quot;{recordTitle}&quot;. This action cannot be undone.
                </>
              )}
            </p>

            {requiresTypedConfirmation && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={confirmationInputId}
                  className="text-xs font-semibold text-near-black"
                >
                  Type <span className="text-danger-strong font-bold">DELETE</span> to confirm:
                </label>
                <Input
                  id={confirmationInputId}
                  type="text"
                  placeholder="DELETE"
                  value={typedConfirmation}
                  onChange={(e) => setTypedConfirmation(e.target.value)}
                  disabled={isDeleting}
                  className="w-full font-mono tracking-wider"
                  autoComplete="off"
                />
              </div>
            )}

            {error && (
              <div className="rounded-control bg-danger/10 border border-danger/20 p-3">
                <p className="text-xs font-medium text-danger-strong">{error}</p>
              </div>
            )}

            <div className="mt-2 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={isDeleting}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isDeleteDisabled}
              >
                {isDeleting ? pendingLabel : confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
