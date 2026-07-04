import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { AccessibleClient } from "./queries";

const ROLE_LABELS: Record<AccessibleClient["role"], string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ClientList({ clients }: { clients: AccessibleClient[] }) {
  if (clients.length === 0) {
    return (
      <div className="mt-6 rounded-card border border-border-grey bg-white p-8 text-center">
        <p className="text-body font-medium">You have no clients yet.</p>
        <p className="mt-1 text-small text-muted-foreground">
          Ask an owner to invite you, or check back once a client has been
          set up for you.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clients.map((client) => (
        <Link
          key={client.id}
          href={`/client/${client.id}/dashboard`}
          className="block h-full"
        >
          <Card className="h-full transition-colors hover:border-brand-orange/50">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{client.name}</CardTitle>
                <Badge variant="neutral">{ROLE_LABELS[client.role]}</Badge>
              </div>
              <CardDescription>
                {client.founderName || client.industry
                  ? [client.founderName, client.industry]
                      .filter(Boolean)
                      .join(" · ")
                  : "No business details yet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="font-mono text-caption text-muted-foreground">
                Updated {formatUpdatedAt(client.updatedAt)}
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
