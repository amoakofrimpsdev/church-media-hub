import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { requireManager } from "@/lib/regions";
import { isUuid } from "@/lib/uploads/api";
import { buildGoogleAuthUrl } from "@/lib/google/oauth";

const STATE_COOKIE = "google_oauth_state";

/**
 * Step 1 of connecting a Google account: the church's, or with ?region= a
 * region's own (region admins may do this for their region). Sends the admin
 * to Google's
 * consent screen. The random `state` is remembered in a cookie and checked when
 * Google sends them back, so nobody can trick an admin into connecting an
 * account the attacker controls.
 */
export async function GET(request: NextRequest) {
  const regionId = request.nextUrl.searchParams.get("region");
  if (regionId) {
    if (!isUuid(regionId)) return NextResponse.redirect(new URL("/admin/google", request.nextUrl.origin));
    await requireManager(regionId);
  } else {
    await requireAdmin();
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(
    buildGoogleAuthUrl(request.nextUrl.origin, state),
  );
  // The region rides along in the cookie, never in what Google sees.
  response.cookies.set(STATE_COOKIE, regionId ? `${state}.${regionId}` : state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return response;
}
