import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ClientNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Access unavailable</CardTitle>
          <CardDescription>
            You do not have access to this client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/clients"
            className={buttonVariants({ variant: "secondary", className: "w-full" })}
          >
            Back to Companies
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
