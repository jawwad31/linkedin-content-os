import { History, Layers, Rss, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function ResearchPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Research"
        description="Collect and process market signals for this client."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>RSS Sources</CardTitle>
            <CardDescription>
              Feeds this client&apos;s research pulls from.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Rss}
              title="No RSS sources yet"
              description="RSS source management is coming later."
              action={
                <Button variant="outline" size="sm" disabled>
                  Add RSS source — Coming later
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research Runs</CardTitle>
            <CardDescription>
              History of manual and worker research runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={History}
              title="No research runs yet"
              description="Running the research agent is coming later."
              action={
                <Button variant="outline" size="sm" disabled>
                  Run Research Agent — Coming later
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collected Articles</CardTitle>
            <CardDescription>
              Articles gathered from active RSS sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Layers}
              title="No collected articles yet"
              description="Articles will appear here once research is running."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Signals</CardTitle>
            <CardDescription>
              Evidence-backed signals synthesized from collected articles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={TrendingUp}
              title="No Market Signals yet"
              description="Signals will appear here once research is running."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
