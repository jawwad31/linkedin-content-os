import { Button } from "@/components/ui/button";

import { logout } from "./actions";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm" className={className}>
        Log out
      </Button>
    </form>
  );
}
