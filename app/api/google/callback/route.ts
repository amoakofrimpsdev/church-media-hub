import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, requireProfile } from "@/lib/auth";
import { requireManager } from "@/lib/regions";
import { saveGoogleConnection } from "@/lib/google/connection";
import { exchangeCode } from "@/lib/google/oauth";

const STATE_COOKIE = "google_oauth_state";

/** Step 2: Google sends the admin back here with a one-time code. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const [expectedState, regionId = null] = (
    request.cookies.get(STATE_COOKIE)?.value ?? ""
  ).split(".");
  if (regionId) await requireManager(regionId);
  else await requireAdmin();
  const admin = await requireProfile();

  const finish = (query: string) => {
    // A region's own account was connected from the Regions page.
    const page = regionId ? "/admin/regions" : "/admin/google";
    const response = NextResponse.redirect(new URL(`${page}?${query}`, origin));
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return response;
  };

  if (searchParams.get("error")) return finish("error=cancelled");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return finish("error=invalid_state");
  }

  try {
    const account = await exchangeCode(code, origin);
    await saveGoogleConnection(account, admin.id, regionId);
    return finish("connected=1");
  } catch (error) {
    if (error instanceof Error && error.message === "drive_permission_missing") {
      return finish("error=drive_permission_missing");
    }
    console.error("Connecting Google failed", error);
    return finish("error=failed");
  }
}
