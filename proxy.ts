import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import { SHARE_VISITOR_COOKIE, SHARE_VISITOR_COOKIE_OPTIONS } from "@/lib/share/visitor";

// Reachable without signing in. Telegram and the scheduler authenticate with
// their own secrets inside those routes.
// Share links ("/s/…" and their images and files) are for people without an
// account: the long random token in the address is the permission.
const PUBLIC_PREFIXES = [
  "/login",
  "/auth/",
  "/api/telegram/",
  "/api/cron/",
  "/s/",
  "/api/share/",
];

// Design previews with sample data. They only exist in local development.
if (process.env.NODE_ENV !== "production") PUBLIC_PREFIXES.push("/preview/");

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

/**
 * Runs before every page. It refreshes the Supabase session cookie and sends
 * signed-out visitors to the login page. This is a convenience, not the
 * security boundary: pages re-check the user and the database enforces Row
 * Level Security.
 */
export async function proxy(request: NextRequest) {
  // A share page's first visit from a browser: give it an anonymous visitor
  // ID, on the request too so the page can count this very visit.
  let newVisitor: string | null = null;
  if (request.nextUrl.pathname.startsWith("/s/") && !request.cookies.has(SHARE_VISITOR_COOKIE)) {
    newVisitor = crypto.randomUUID();
    request.cookies.set(SHARE_VISITOR_COOKIE, newVisitor);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not run code between creating the client and this call: it is what
  // refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  // API routes are called by scripts on our pages, not visited. A redirect to
  // the login page would be read as a successful (but nonsense) reply, so
  // answer with a clear "signed out" error instead.
  if (!signedIn && pathname.startsWith("/api/") && !isPublic(pathname)) {
    return NextResponse.json(
      {
        error: {
          code: "signed_out",
          message: "You have been signed out. Sign in and try again.",
        },
      },
      { status: 401 },
    );
  }

  if (!signedIn && !isPublic(pathname)) {
    // Remember where they were going (for example a link from the Telegram
    // bot) so sign-in can bring them back to it.
    const destination = `${pathname}${request.nextUrl.search}`;
    return redirectKeepingCookies(
      request,
      response,
      "/login",
      destination === "/" ? undefined : destination,
    );
  }
  if (signedIn && pathname === "/login") {
    return redirectKeepingCookies(request, response, "/dashboard");
  }
  if (newVisitor) {
    response.cookies.set(SHARE_VISITOR_COOKIE, newVisitor, SHARE_VISITOR_COOKIE_OPTIONS);
  }
  return response;
}

/** A redirect must carry any refreshed session cookies with it. */
function redirectKeepingCookies(
  request: NextRequest,
  from: NextResponse,
  pathname: string,
  next?: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
