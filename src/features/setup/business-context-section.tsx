import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EffectiveClientRole } from "@/lib/access/roles";

import { BusinessContextForm } from "./business-context-form";
import { getClientBusinessContext } from "./queries";

export async function BusinessContextSection({
  clientId,
  role,
}: {
  clientId: string;
  role: EffectiveClientRole;
}) {
  const result = await getClientBusinessContext(clientId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Context</CardTitle>
        <CardDescription>
          Always-on context used across research, ideas, and post drafts for
          this Client Workspace.
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
