import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { revokeInvitationAction } from "./actions";
import type { ClientAccessMember } from "./queries";

const ROLE_LABELS: Record<ClientAccessMember["role"], string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

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
          className="flex items-center justify-between gap-3 rounded-card border border-border-grey bg-white p-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-body font-medium">
              {member.invitedEmail ?? "Unknown email"}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="neutral">{ROLE_LABELS[member.role]}</Badge>
              <Badge variant={STATUS_VARIANT[member.invitationStatus]}>
                {STATUS_LABELS[member.invitationStatus]}
              </Badge>
            </div>
          </div>
          <form action={revokeInvitationAction.bind(null, clientId, member.id)}>
            <Button type="submit" variant="ghost" size="sm">
              Revoke
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
