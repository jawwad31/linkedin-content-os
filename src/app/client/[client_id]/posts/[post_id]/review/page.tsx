import { CheckCircle2, FileText, PenSquare, RotateCcw, XCircle } from "lucide-react";

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

export default function PostReviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Post Review"
        description="Review this post before approval."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>LinkedIn Preview</CardTitle>
            <CardDescription>
              The generated post will preview here once available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="No post drafted yet"
              description="Post generation and review are coming later."
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Buyer belief shift
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-small text-muted-foreground">
                Not available yet.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Proof notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-small text-muted-foreground">
                Not available yet.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Risk notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-small text-muted-foreground">
                Not available yet.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                CTA intent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-small text-muted-foreground">
                Not available yet.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Button variant="secondary" disabled>
            <PenSquare aria-hidden="true" className="h-4 w-4" />
            Needs Edit
          </Button>
          <Button variant="outline" disabled>
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Redraft
          </Button>
          <Button variant="destructive" disabled>
            <XCircle aria-hidden="true" className="h-4 w-4" />
            Reject
          </Button>
          <Button variant="secondary" disabled className="ml-auto">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            Approve
          </Button>
        </CardContent>
      </Card>
      <p className="text-caption text-muted-foreground">
        Post review actions are coming later.
      </p>
    </div>
  );
}
