import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a text color next to the app's own font-size classes", () => {
    expect(cn("text-white", "text-small")).toBe("text-white text-small");
    expect(cn("text-small", "text-white")).toBe("text-small text-white");
    expect(cn("bg-destructive text-white hover:brightness-95", "h-[38px] px-4 text-small")).toContain("text-white");
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-small", "text-body-lg")).toBe("text-body-lg");
    expect(cn("text-caption", "text-body")).toBe("text-body");
  });

  it("still lets a later color replace an earlier one", () => {
    expect(cn("text-white", "text-near-black")).toBe("text-near-black");
  });
});
