import { CheckCircle2, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function PublishPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Publish"
        description="Approved posts ready to copy and publish history."
      />

      <Card>
        <CardHeader>
          <CardTitle>Approved posts ready to copy</CardTitle>
          <CardDescription>
            Copy approved post text and mark it as published once you have
            posted it on LinkedIn manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Copy}
            title="No approved posts yet"
            description="Approved posts will appear here, ready to copy."
            action={
              <Button variant="outline" size="sm" disabled>
                Copy post text — Coming later
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Published history</CardTitle>
          <CardDescription>Posts you have marked as published.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={CheckCircle2}
            title="Nothing published yet"
            description="Published posts will appear here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
