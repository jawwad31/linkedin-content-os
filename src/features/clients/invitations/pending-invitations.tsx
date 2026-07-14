import { Mail, Check } from "lucide-react";
import { CLIENT_ROLE_LABELS } from "@/lib/access/roles";

import { acceptInvitationAction } from "./actions";
import type { PendingInvitation } from "./queries";

export function PendingInvitations({
  invitations,
}: {
  invitations: PendingInvitation[];
}) {
  if (invitations.length === 0) return null;

  return (
    <div className="mt-8 mb-6 flex flex-col gap-4">
      <h2 className="text-body font-bold text-on-surface">
        Pending Invitations
      </h2>
      <div className="flex flex-col gap-3">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="bg-surface-container-high rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-outline-variant">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary shrink-0">
                <Mail className="w-5 h-5 fill-current opacity-80" />
              </div>
              <div className="flex flex-col">
                <p className="text-small text-on-surface">
                  You have been invited to join a Workspace as <span className="font-bold">{CLIENT_ROLE_LABELS[invitation.role]}</span>
                </p>
                <p className="text-caption text-on-surface-variant">
                  Accept the invitation to gain access to the client ecosystem.
                </p>
              </div>
            </div>
            
            <form action={acceptInvitationAction.bind(null, invitation.id)} className="w-full sm:w-auto">
              <button type="submit" className="w-full sm:w-auto bg-brand-purple text-white text-small font-medium px-6 py-2.5 rounded-full shadow hover:opacity-90 transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2">
                <Check className="w-4 h-4" />
                Accept Invite
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
