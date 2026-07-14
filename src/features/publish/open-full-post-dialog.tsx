"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Maximize2, X } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function OpenFullPostButton({
  postText,
  badgeLabel,
  badgeVariant,
  dateLabel,
}: {
  postText: string;
  badgeLabel: string;
  badgeVariant: BadgeProps["variant"];
  dateLabel: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full"
      >
        <Maximize2 aria-hidden="true" className="h-4 w-4" />
        Open Full Post
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen} modal>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/40 backdrop-blur-[2px] transition-all" />
          <Dialog.Popup
            className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-border-grey bg-white p-6 shadow-2xl transition-all focus:outline-none"
            aria-label="Full post text"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                <span className="font-mono text-caption text-muted-foreground">
                  {dateLabel}
                </span>
              </div>
              <Dialog.Close
                className="rounded-full p-1 text-muted-foreground hover:bg-soft-white"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="mt-4 whitespace-pre-line break-words text-body leading-relaxed text-near-black">
              {postText}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
