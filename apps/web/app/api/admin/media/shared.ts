// Shared validation for the Media library CMS routes.

export const KINDS = ["image", "video", "other"] as const;
export const STATUSES = ["draft", "published", "archived"] as const;

export type MediaInput = Record<string, unknown>;

export type CleanMediaMeta = {
  title?: string;
  alt?: string | null;
  kind?: string;
  tags?: string[];
  status?: string;
};

function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 40))
    .slice(0, 16);
}

/** Validate the editable metadata (shared by create + PATCH). `requireTitle`
 *  is set on create. */
export function parseMediaMeta(
  b: MediaInput,
  requireTitle: boolean,
): { ok: true; data: CleanMediaMeta } | { ok: false; error: string } {
  const out: CleanMediaMeta = {};

  if (b.title !== undefined || requireTitle) {
    if (typeof b.title !== "string" || !b.title.trim()) return { ok: false, error: "title required" };
    out.title = b.title.trim().slice(0, 160);
  }
  if (b.alt !== undefined)
    out.alt = typeof b.alt === "string" && b.alt.trim() ? b.alt.trim().slice(0, 500) : null;
  if (b.kind !== undefined) {
    if (!KINDS.includes(b.kind as (typeof KINDS)[number])) return { ok: false, error: "invalid kind" };
    out.kind = b.kind as string;
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as (typeof STATUSES)[number])) return { ok: false, error: "invalid status" };
    out.status = b.status as string;
  }
  if (b.tags !== undefined) out.tags = cleanTags(b.tags);

  return { ok: true, data: out };
}

/** Infer a coarse media kind from a MIME type. */
export function kindFromContentType(ct: string | null | undefined): string {
  if (!ct) return "other";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  return "other";
}
