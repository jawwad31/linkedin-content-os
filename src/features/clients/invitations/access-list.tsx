import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CLIENT_ROLE_LABELS } from "@/lib/access/roles";

import { RevokeAccessButton } from "./revoke-access-button";
import type { ClientAccessMember } from "./queries";

const STATUS_VARIANT: Record<
  ClientAccessMember["invitationStatus"],
  "success" | "warning" | "neutral"
> = {
  accepted: "success",
  pending: "warning",
  revoked: "neutral",
};

const STATUS_LABELS: Record<ClientAccessMember["invitationStatus"], string> = {
  accepted: "Accepted",
  pending: "Pending",
  revoked: "Revoked",
};

export function AccessList({
  clientId,
  members,
}: {
  clientId: string;
  members: ClientAccessMember[];
}) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No team members yet"
        description="Invite a Client Admin or Client User above to give them access to this Client Workspace."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex flex-col gap-3 rounded-control border border-border-grey bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="break-words text-body font-medium text-near-black">
              {member.invitedEmail ?? "Unknown email"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{CLIENT_ROLE_LABELS[member.role]}</Badge>
              <Badge variant={STATUS_VARIANT[member.invitationStatus]}>
                {STATUS_LABELS[member.invitationStatus]}
              </Badge>
            </div>
          </div>
          <div className="sm:shrink-0">
            <RevokeAccessButton
              clientId={clientId}
              memberId={member.id}
              memberLabel={member.invitedEmail ?? "this user"}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
