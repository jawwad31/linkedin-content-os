import { Lightbulb, Sparkles, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function IdeasPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ideas"
        description="Generate Content Ideas for this client from three modes."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <span
              aria-hidden="true"
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-control bg-brand-orange/10 text-brand-orange"
            >
              <Sparkles className="h-5 w-5" />
            </span>
            <CardTitle>Founder Experience</CardTitle>
            <CardDescription>
              Generate an idea from a real founder experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" disabled>
              Generate — Coming later
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span
              aria-hidden="true"
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-control bg-info/10 text-info"
            >
              <TrendingUp className="h-5 w-5" />
            </span>
            <CardTitle>Market Signal</CardTitle>
            <CardDescription>
              Generate an idea from an approved Market Signal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" disabled>
              Generate — Coming later
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span
              aria-hidden="true"
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-control bg-brand-purple/10 text-brand-purple"
            >
              <Lightbulb className="h-5 w-5" />
            </span>
            <CardTitle>Signal Reaction / Founder Take</CardTitle>
            <CardDescription>
              Generate an idea led by a founder take on a Market Signal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" disabled>
              Generate — Coming later
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-card border border-border-grey bg-white p-8 text-center">
        <p className="text-body font-medium">No ideas yet for this client.</p>
        <p className="mt-1 text-small text-muted-foreground">
          Idea generation is coming later.
        </p>
      </div>
    </div>
  );
}
