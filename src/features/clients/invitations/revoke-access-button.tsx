"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { revokeInvitationAction } from "./actions";

export function RevokeAccessButton({
  clientId,
  memberId,
  memberLabel,
}: {
  clientId: string;
  memberId: string;
  memberLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const formId = `revoke-access-${memberId}`;

  return (
    <>
      <form id={formId} action={revokeInvitationAction.bind(null, clientId, memberId)} />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger-strong hover:bg-danger/10 hover:text-danger-strong"
        onClick={() => setOpen(true)}
      >
        Revoke
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen} modal>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-near-black/40 backdrop-blur-[2px] transition-all" />
          <Dialog.Popup
            className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-dialog border border-border-grey bg-white p-6 shadow-2xl transition-all focus:outline-none"
            aria-label="Confirm revoke access"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-body-lg font-heading font-semibold text-near-black">
                Revoke access?
              </h2>
              <Dialog.Close
                className="rounded-full p-1 text-muted-foreground hover:bg-soft-white"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <p className="mt-3 text-small leading-relaxed text-muted-foreground">
              This immediately removes {memberLabel}&apos;s access to this
              Client Workspace. They will need a new invitation to return.
            </p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="destructive"
                onClick={() => setOpen(false)}
              >
                Revoke Access
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
