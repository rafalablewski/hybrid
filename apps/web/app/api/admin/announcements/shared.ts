// Shared validation for the Announcement CMS routes. Kept pure so both the
// list/create and the item route enforce the same shape.

export const LEVELS = ["info", "success", "warning"] as const;
export const AUDIENCES = ["all", "coaches", "clients"] as const;
export const STATUSES = ["draft", "published", "archived"] as const;

export type AnnouncementInput = {
  title?: unknown;
  body?: unknown;
  level?: unknown;
  audience?: unknown;
  status?: unknown;
  pinned?: unknown;
  publishAt?: unknown;
  expiresAt?: unknown;
};

export type CleanFields = {
  title?: string;
  body?: string;
  level?: string;
  audience?: string;
  status?: string;
  pinned?: boolean;
  publishAt?: Date | null;
  expiresAt?: Date | null;
};

/** Validate + coerce the provided fields. `requireCore` demands title+body (for
 *  create); a PATCH omits them. Returns the cleaned subset or an error string. */
export function parseAnnouncement(
  b: AnnouncementInput,
  requireCore: boolean,
): { ok: true; data: CleanFields } | { ok: false; error: string } {
  const out: CleanFields = {};

  if (b.title !== undefined || requireCore) {
    if (typeof b.title !== "string" || !b.title.trim()) return { ok: false, error: "title required" };
    out.title = b.title.trim().slice(0, 160);
  }
  if (b.body !== undefined || requireCore) {
    if (typeof b.body !== "string" || !b.body.trim()) return { ok: false, error: "body required" };
    out.body = b.body.trim().slice(0, 4000);
  }
  if (b.level !== undefined) {
    if (!LEVELS.includes(b.level as (typeof LEVELS)[number])) return { ok: false, error: "invalid level" };
    out.level = b.level as string;
  }
  if (b.audience !== undefined) {
    if (!AUDIENCES.includes(b.audience as (typeof AUDIENCES)[number])) return { ok: false, error: "invalid audience" };
    out.audience = b.audience as string;
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as (typeof STATUSES)[number])) return { ok: false, error: "invalid status" };
    out.status = b.status as string;
  }
  if (b.pinned !== undefined) {
    if (typeof b.pinned !== "boolean") return { ok: false, error: "pinned must be a boolean" };
    out.pinned = b.pinned;
  }
  for (const key of ["publishAt", "expiresAt"] as const) {
    if (b[key] === undefined) continue;
    if (b[key] === null || b[key] === "") {
      out[key] = null;
      continue;
    }
    if (typeof b[key] !== "string" || Number.isNaN(Date.parse(b[key] as string)))
      return { ok: false, error: `invalid ${key}` };
    out[key] = new Date(b[key] as string);
  }

  // When both are supplied together, the publish window must be valid.
  if (out.publishAt instanceof Date && out.expiresAt instanceof Date && out.publishAt >= out.expiresAt)
    return { ok: false, error: "publishAt must be before expiresAt" };

  return { ok: true, data: out };
}
