import type { Role } from "@/lib/domain/permissions";

/** Names of the icons used in navigation. Mapped to components in the shell. */
export type NavIcon =
  | "home"
  | "services"
  | "gallery"
  | "handoffs"
  | "people"
  | "teams"
  | "categories"
  | "schedule"
  | "drive"
  | "telegram"
  | "share"
  | "regions";

export type NavLink = { href: string; label: string; icon: NavIcon };

export const MAIN_NAV: NavLink[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/services", label: "Services", icon: "services" },
  { href: "/gallery", label: "Gallery", icon: "gallery" },
  { href: "/handoffs", label: "Handoffs", icon: "handoffs" },
];

/** Admin sections are reachable directly, not through an index page. */
export const ADMIN_NAV: NavLink[] = [
  { href: "/admin/regions", label: "Regions", icon: "regions" },
  { href: "/admin/people", label: "People", icon: "people" },
  { href: "/admin/teams", label: "Teams", icon: "teams" },
  { href: "/admin/categories", label: "Categories", icon: "categories" },
  { href: "/admin/schedule", label: "Schedule", icon: "schedule" },
  { href: "/admin/shares", label: "Shared links", icon: "share" },
  { href: "/admin/google", label: "Google Drive", icon: "drive" },
  { href: "/admin/telegram", label: "Telegram", icon: "telegram" },
];

/** What a region admin runs for their own region. */
const REGION_ADMIN_NAV = new Set([
  "/admin/regions",
  "/admin/people",
  "/admin/schedule",
  "/admin/shares",
]);

export function adminNavFor(role: Role, runsARegion = false): NavLink[] {
  if (role === "admin") return ADMIN_NAV;
  if (!runsARegion) return [];
  // Their region's Drive and Telegram group are managed on its card.
  return ADMIN_NAV.filter((link) => REGION_ADMIN_NAV.has(link.href)).map((link) =>
    link.href === "/admin/regions" ? { ...link, label: "Your region" } : link,
  );
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
