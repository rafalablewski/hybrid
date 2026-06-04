import { ALL_MUSCLES } from "@hybrid/core";

// Shared validation for the Exercise library CMS routes. Engine-critical fields
// are checked against the SAME core enums the engines use, so a bad row can't
// reach fatigue/prescription/injury math.

export const PATTERNS = ["squat", "hinge", "push", "pull", "lunge", "carry", "core", "cond"] as const;
export const SYSTEMS = ["anaerobic", "threshold", "aerobic"] as const;
export const KINDS = ["strength", "conditioning"] as const;
export const STATUSES = ["draft", "published", "archived"] as const;
const MUSCLES = new Set<string>(ALL_MUSCLES);

export type ExerciseInput = Record<string, unknown>;

export type CleanExercise = {
  name?: string;
  slug?: string;
  pattern?: string;
  muscles?: string[];
  baseLoad?: number | null;
  system?: string | null;
  kind?: string;
  category?: string | null;
  equipment?: string[];
  aliases?: string[];
  description?: string | null;
  cues?: string[];
  videoUrl?: string | null;
  thumbUrl?: string | null;
  status?: string;
};

/** URL/engine-stable key from a display name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanStringArray(v: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, itemMax))
    .slice(0, max);
}

/** Validate + coerce. `requireCore` demands name+pattern+muscles (create); a
 *  PATCH omits any field it isn't changing. */
export function parseExercise(
  b: ExerciseInput,
  requireCore: boolean,
): { ok: true; data: CleanExercise } | { ok: false; error: string } {
  const out: CleanExercise = {};

  if (b.name !== undefined || requireCore) {
    if (typeof b.name !== "string" || !b.name.trim()) return { ok: false, error: "name required" };
    out.name = b.name.trim().slice(0, 80);
    out.slug = slugify(out.name);
    if (!out.slug) return { ok: false, error: "name must contain letters or digits" };
  }

  if (b.pattern !== undefined || requireCore) {
    if (!PATTERNS.includes(b.pattern as (typeof PATTERNS)[number]))
      return { ok: false, error: `pattern must be one of ${PATTERNS.join(", ")}` };
    out.pattern = b.pattern as string;
  }

  if (b.muscles !== undefined || requireCore) {
    if (!Array.isArray(b.muscles) || b.muscles.length === 0)
      return { ok: false, error: "at least one muscle required" };
    const bad = b.muscles.find((m) => typeof m !== "string" || !MUSCLES.has(m));
    if (bad !== undefined) return { ok: false, error: `invalid muscle: ${String(bad)}` };
    out.muscles = [...new Set(b.muscles as string[])];
  }

  if (b.baseLoad !== undefined) {
    if (b.baseLoad === null) out.baseLoad = null;
    else if (typeof b.baseLoad !== "number" || !Number.isFinite(b.baseLoad) || b.baseLoad < 0)
      return { ok: false, error: "baseLoad must be a non-negative number or null" };
    else out.baseLoad = b.baseLoad;
  }

  if (b.system !== undefined) {
    if (b.system === null || b.system === "") out.system = null;
    else if (!SYSTEMS.includes(b.system as (typeof SYSTEMS)[number]))
      return { ok: false, error: `system must be one of ${SYSTEMS.join(", ")} or null` };
    else out.system = b.system as string;
  }

  if (b.kind !== undefined) {
    if (!KINDS.includes(b.kind as (typeof KINDS)[number])) return { ok: false, error: "invalid kind" };
    out.kind = b.kind as string;
  }

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as (typeof STATUSES)[number])) return { ok: false, error: "invalid status" };
    out.status = b.status as string;
  }

  if (b.category !== undefined)
    out.category = typeof b.category === "string" && b.category.trim() ? b.category.trim().slice(0, 60) : null;
  if (b.description !== undefined)
    out.description = typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 2000) : null;
  if (b.videoUrl !== undefined)
    out.videoUrl = typeof b.videoUrl === "string" && b.videoUrl.trim() ? b.videoUrl.trim().slice(0, 500) : null;
  if (b.thumbUrl !== undefined)
    out.thumbUrl = typeof b.thumbUrl === "string" && b.thumbUrl.trim() ? b.thumbUrl.trim().slice(0, 500) : null;

  if (b.equipment !== undefined) out.equipment = cleanStringArray(b.equipment, 12, 40);
  if (b.aliases !== undefined) {
    const cleaned = cleanStringArray(b.aliases, 12, 80);
    // an exercise is never its own alias (redundant + breaks resolution)
    out.aliases = out.name ? cleaned.filter((a) => a !== out.name) : cleaned;
  }
  if (b.cues !== undefined) out.cues = cleanStringArray(b.cues, 20, 280);

  return { ok: true, data: out };
}
