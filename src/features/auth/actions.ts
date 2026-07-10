"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter a valid email and password.")
    .email("Enter a valid email and password."),
  password: z.string().min(1, "Enter a valid email and password."),
});

export type LoginState = {
  error: string | null;
};

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !user) {
    return { error: "The email or password is incorrect." };
  }

  redirect(await resolveAuthenticatedDestination(user.id));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
