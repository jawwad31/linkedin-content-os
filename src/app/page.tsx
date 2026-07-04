import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-page-title font-heading font-semibold leading-tight">
          AIXelerate Content OS
        </h1>
        <p className="text-body-lg mt-2 text-muted-foreground">
          An ICP-first LinkedIn content operating system for B2B operators and
          founders.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Design Foundation</CardTitle>
          <CardDescription>
            Buttons, cards, and badges built on the AIXelerate brand tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="gradient">Run Research Agent</Button>
            <Button variant="secondary">Secondary Action</Button>
            <Button variant="ghost">Ghost Action</Button>
            <Button variant="destructive">Reject</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Draft</Badge>
            <Badge variant="success">Approved</Badge>
            <Badge variant="warning">Needs Edit</Badge>
            <Badge variant="danger">Rejected</Badge>
            <Badge variant="info">Running</Badge>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
