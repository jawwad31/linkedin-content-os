import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="mt-6 flex flex-col gap-3">
      <h2 className="text-small font-medium text-muted-foreground">
        Pending Invitations
      </h2>
      {invitations.map((invitation) => (
        <Card key={invitation.id}>
          <CardContent className="flex items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-2">
              <span className="text-body">You have been invited as</span>
              <Badge variant="neutral">
                {CLIENT_ROLE_LABELS[invitation.role]}
              </Badge>
            </div>
            <form action={acceptInvitationAction.bind(null, invitation.id)}>
              <Button type="submit" variant="gradient" size="sm">
                Accept
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
