import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

const PROTECTED_PREFIXES = [
  "/clients",
  "/client/",
  "/change-password",
  "/account/",
  "/no-access",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

function withSessionCookies(
  response: NextResponse,
  sessionResponse: NextResponse,
) {
  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated users away from protected routes. If the Supabase env
 * vars are missing, this fails closed (throws) rather than letting
 * protected routes through unchecked.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    getSupabasePublicEnv();

  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    return withSessionCookies(NextResponse.redirect(loginUrl), supabaseResponse);
  }

  const requiresAppSession =
    isProtectedPath(pathname) || pathname.startsWith("/api/");

  if (user && requiresAppSession && pathname !== "/change-password") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle<{ must_change_password: boolean }>();

    if (profile?.must_change_password) {
      if (pathname.startsWith("/api/")) {
        return withSessionCookies(
          NextResponse.json(
            {
              error: {
                code: "PASSWORD_CHANGE_REQUIRED",
                message: "Change your temporary password before continuing.",
              },
            },
            { status: 403 },
          ),
          supabaseResponse,
        );
      }
      return withSessionCookies(
        NextResponse.redirect(new URL("/change-password", request.url)),
        supabaseResponse,
      );
    }
  }

  return supabaseResponse;
}
