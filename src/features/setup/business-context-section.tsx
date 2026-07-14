import { FileText } from "lucide-react";

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
        <div className="flex items-center gap-2">
          <FileText aria-hidden="true" className="h-5 w-5 text-brand-orange" />
          <CardTitle>Business Context</CardTitle>
        </div>
        <CardDescription>
          The always-on context Research, Ideas, and Posts all draw from for
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
