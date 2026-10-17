/**
 * An anonymous, random ID for each browser that opens a share link, so an
 * admin can see how many people looked at it. It identifies a browser, not a
 * person, and nothing else is stored with it.
 */
export const SHARE_VISITOR_COOKIE = "rcw_visitor";

export const SHARE_VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/s/",
  maxAge: 60 * 60 * 24 * 365,
} as const;
