import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { BusinessContextForm } from "./business-context-form";
import { getClientBusinessContext } from "./queries";

export async function BusinessContextSection({
  clientId,
  role,
}: {
  clientId: string;
  role: ClientRole;
}) {
  const result = await getClientBusinessContext(clientId);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Business Context</CardTitle>
        <CardDescription>
          Always-on context used across research, ideas, and post drafts for
          this client.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.ok ? (
          <BusinessContextForm
            clientId={clientId}
            role={role}
            context={result.context}
          />
        ) : (
          <p className="text-small text-danger">
            We could not load business context. Please try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
