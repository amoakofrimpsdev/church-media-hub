import type { Role } from "./permissions";

export const ROLES: readonly Role[] = ["admin", "member", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Manages services, people, categories and teams",
  member: "Media team: uploads and marks tasks done",
  viewer: "Receiving team: sees only their team's categories",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Trims and lowercases an email, or returns null if it is not one. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

/** The most addresses one batch invite takes. */
export const BATCH_INVITE_MAX = 50;

/**
 * Many addresses pasted at once: one per line, or separated by commas,
 * semicolons or spaces. Also accepts "Name <name@gmail.com>" as copied from an
 * email app. Returns the valid ones (lowercased, no repeats) and anything that
 * did not look like an address.
 */
export function parseEmailList(value: unknown): { emails: string[]; invalid: string[] } {
  if (typeof value !== "string") return { emails: [], invalid: [] };
  const emails: string[] = [];
  const invalid: string[] = [];
  // "Name <address>" → address, so the name does not split into junk words.
  const cleaned = value.replace(/[^<>\n,;]*<([^>]+)>/g, " $1 ");
  for (const piece of cleaned.split(/[\s,;]+/)) {
    if (!piece) continue;
    const email = normalizeEmail(piece.replace(/^mailto:/i, ""));
    if (!email) invalid.push(piece);
    else if (!emails.includes(email)) emails.push(email);
  }
  return { emails, invalid };
}
