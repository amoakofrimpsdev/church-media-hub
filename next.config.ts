import type { NextConfig } from "next";

/**
 * Security headers on every response.
 *
 * - No other site may show the app in a frame, so nobody can trick someone
 *   into pressing a button (like "Link this group") on a hidden copy of it.
 * - Browsers must not guess file types.
 * - Share-link addresses contain the link's secret, so those pages never send
 *   their address to another site; elsewhere only the site's name is sent.
 * - Camera, microphone and location are switched off: the app never needs them.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/s/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/share/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
