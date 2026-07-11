import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLIENT_ROLE_LABELS } from "@/lib/access/roles";

import { revokeInvitationAction } from "./actions";
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
      <p className="text-small text-muted-foreground">No team members yet.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="break-words text-body font-medium">
              {member.invitedEmail ?? "Unknown email"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{CLIENT_ROLE_LABELS[member.role]}</Badge>
              <Badge variant={STATUS_VARIANT[member.invitationStatus]}>
                {STATUS_LABELS[member.invitationStatus]}
              </Badge>
            </div>
          </div>
          <form
            action={revokeInvitationAction.bind(null, clientId, member.id)}
            className="sm:shrink-0"
          >
            <Button type="submit" variant="ghost" size="sm">
              Revoke
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
