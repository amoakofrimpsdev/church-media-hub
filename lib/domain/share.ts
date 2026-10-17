/**
 * Rules for share links: what one covers, whether it still works, and how to
 * describe it. Pure functions, used by the public page, the file routes and
 * the admin list, so all three agree.
 */

export type ShareScope = {
  serviceId: string | null;
  categoryId: string | null;
  /** Limits the link to one region. Absent or null: every region. */
  regionId?: string | null;
};

export type ShareState = {
  expiresAt: string | null;
  revokedAt: string | null;
};

export type ShareStatus = "active" | "expired" | "revoked";

export function shareStatus(share: ShareState, now: Date): ShareStatus {
  if (share.revokedAt) return "revoked";
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

/** Whether a particular upload is covered by a link. */
export function uploadInScope(
  upload: { serviceId: string; categoryId: string; regionId?: string },
  scope: ShareScope,
): boolean {
  if (scope.regionId && upload.regionId !== scope.regionId) return false;
  if (scope.serviceId && upload.serviceId !== scope.serviceId) return false;
  if (scope.categoryId && upload.categoryId !== scope.categoryId) return false;
  return true;
}

export type ScopeKind = "album" | "category" | "service" | "everything";

export function scopeKind(scope: ShareScope): ScopeKind {
  if (scope.serviceId && scope.categoryId) return "album";
  if (scope.categoryId) return "category";
  if (scope.serviceId) return "service";
  return "everything";
}

/**
 * What a link covers, in words: "Baptism from Sunday Service, Oct 12",
 * "Every Baptism album", "Everything from Sunday Service, Oct 12",
 * "The whole gallery".
 */
export function describeScope(
  scope: ShareScope,
  names: { category?: string | null; service?: string | null },
): string {
  switch (scopeKind(scope)) {
    case "album":
      return `${names.category ?? "One category"} from ${names.service ?? "one service"}`;
    case "category":
      return `Every ${names.category ?? "category"} album`;
    case "service":
      return `Everything from ${names.service ?? "one service"}`;
    case "everything":
      return "The whole gallery";
  }
}

export const EXPIRY_CHOICES = [
  { value: "7", label: "In 7 days" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "never", label: "Never" },
] as const;

/**
 * Turns the form's expiry choice into an instant. `undefined` means the
 * choice was not one of the allowed ones.
 */
export function expiryFromChoice(choice: string, now: Date): string | null | undefined {
  if (choice === "never") return null;
  const days = Number(choice);
  if (![7, 30, 90].includes(days)) return undefined;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Tokens are 32 random bytes in base64url: 43 characters. */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** "Expires in 12 days", "Expires today", "Never expires", "Expired", "Turned off". */
export function expiryLabel(share: ShareState, now: Date): string {
  const status = shareStatus(share, now);
  if (status === "revoked") return "Turned off";
  if (status === "expired") return "Expired";
  if (!share.expiresAt) return "Never expires";
  const days = Math.ceil(
    (new Date(share.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  return days <= 1 ? "Expires today" : `Expires in ${days} days`;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "3 people · 11 visits · 24 downloads", or "Not opened yet". */
export function viewSummary(link: {
  viewCount: number;
  visitorCount: number;
  downloadCount: number;
}): string {
  if (link.viewCount === 0 && link.downloadCount === 0) return "Not opened yet";
  const parts = [];
  // Links made before visitors were counted have visits but no visitors.
  if (link.visitorCount > 0) parts.push(plural(link.visitorCount, "person", "people"));
  parts.push(plural(link.viewCount, "visit", "visits"));
  if (link.downloadCount > 0) parts.push(plural(link.downloadCount, "download", "downloads"));
  return parts.join(" · ");
}
