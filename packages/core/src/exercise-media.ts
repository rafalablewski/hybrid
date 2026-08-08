import { gymExercise, GYM_EXERCISES, type GymCategory, type GymEquipment, type GymExercise } from "./exercise-db";
import { exerciseAnimation, exerciseArchetype, type AnimArchetype, type ExerciseAnimation } from "./exercise-animation";

// EXERCISE MEDIA — the ONE resolver for "what picture do we show for this lift".
// Written once in core, rendered by BOTH clients (exercise-media.tsx on web +
// mobile), so a demo drawn once appears everywhere the lift does.
//
// THE PLAN: every demo will be HAND-SKETCHED — a drawn still per lift and, where
// the movement needs it, a short drawn loop. None of that art exists yet, so
// TODAY every lift resolves to a PLACEHOLDER: the procedural stick-figure demo
// that exercise-animation.ts already renders. That is a deliberate stand-in, not
// a gap — it reads as the movement, costs no assets, and is what the clients
// draw until a sketch is registered for that lift.
//
// THE SWAP SEAM. `exerciseMedia(name)` always returns a resolution; `asset` is
// the drawn media once it exists and `null` while it doesn't, with `fallback`
// carrying the procedural animation to draw instead. Resolution order:
//
//   1. the admin LIBRARY row for this lift (Exercise.videoUrl / thumbUrl in the
//      CMS, published here via `setExerciseMediaCatalog`) — an admin can point a
//      lift at an uploaded asset with no deploy;
//   2. SKETCH_MEDIA under the EXACT exercise name — the commissioned drawing;
//   3. SKETCH_MEDIA under the lift's ARCHETYPE — one drawing of "a squat" stands
//      in for every squat until each is drawn individually (status "pattern");
//   4. nothing drawn yet → status "pending", `fallback` = the stick figure.
//
// So shipping the real art is: drop the files, call `registerSketchMedia` with
// the manifest. No client change, no per-screen churn — every surface that reads
// through here upgrades at once.
//
// COMMISSIONING. `sketchShotList()` / `sketchCoverage()` / `sketchBrief()` turn
// the exercise DB into the illustrator's brief: every lift that still needs
// drawing, its stable file slot, its archetype and its equipment, grouped so one
// drawing session covers a whole movement pattern. Surfaced in the admin console
// (Content → Media) so the backlog is visible, not tribal knowledge.

// ── the media shapes ────────────────────────────────────────────────────────

/** A single drawn frame — the still that represents the lift (rows, cards, the
 *  poster behind a loop). */
export interface StillMedia {
  kind: "still";
  src: string;
  alt?: string;
  credit?: string;
}

/**
 * A drawn LOOP of the rep. Two deliveries, one shape:
 *  - several `frames` the client flips/cross-fades through (the illustrator's
 *    keyframe export), or
 *  - ONE self-animating file (animated WebP/GIF) — a single entry in `frames`,
 *    which every client already animates natively.
 */
export interface LoopMedia {
  kind: "loop";
  frames: string[];
  /** milliseconds for one full loop (ignored by a self-animating file). */
  cycleMs: number;
  /** the still to hold while paused / under reduced motion. */
  poster?: string;
  alt?: string;
  credit?: string;
}

/** A demo CLIP the client plays inline (mp4/webm). */
export interface ClipMedia {
  kind: "clip";
  src: string;
  poster?: string;
  alt?: string;
  credit?: string;
}

/** A demo hosted somewhere we can't play inline (a YouTube/Vimeo link an admin
 *  pasted). The clients show the poster (or the placeholder) plus an open-out
 *  action rather than pretending it's an embed. */
export interface LinkMedia {
  kind: "link";
  href: string;
  poster?: string;
  alt?: string;
  credit?: string;
}

export type ExerciseMediaAsset = StillMedia | LoopMedia | ClipMedia | LinkMedia;

/** Where a resolved asset came from. */
export type MediaSource = "library" | "sketch" | "pattern";

/** How well this lift is covered by real art. */
export type MediaStatus = "drawn" | "pattern" | "pending";

export interface ExerciseMediaResolution {
  /** The exercise as the DB knows it (canonical name), or the name as given. */
  name: string;
  /** Stable asset slot — the filename the drawing is delivered under. */
  slot: string;
  /** The movement archetype, or null for a name the exercise DB doesn't know. */
  archetype: AnimArchetype | null;
  /** "drawn" (this lift), "pattern" (its archetype stands in), "pending". */
  status: MediaStatus;
  /** The drawn media, or null while this lift is still a placeholder. */
  asset: ExerciseMediaAsset | null;
  /** Where `asset` came from; null when nothing is drawn. */
  source: MediaSource | null;
  /** The procedural stand-in to draw when `asset` is null. Null only for a name
   *  the DB doesn't know (custom lifts, sports) — those get no demo at all. */
  fallback: ExerciseAnimation | null;
  /** Accessible description — the asset's own alt, else the exercise name. */
  alt: string;
}

// ── asset slots ─────────────────────────────────────────────────────────────

/**
 * The stable file slot for a lift — "Back Squat" → "back-squat", "Seesaw KB
 * Press" → "seesaw-kb-press". This is the contract with the illustrator: a
 * delivered `back-squat.webp` is registered under the slot and needs no
 * per-exercise wiring.
 */
export function mediaSlot(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── the sketch registry (empty until the art lands) ─────────────────────────

/**
 * Commissioned hand-drawn media, keyed by EXACT exercise name or by archetype
 * ("squat", "pressH", …) — a name key wins over an archetype key. EMPTY today:
 * every lift resolves to the procedural placeholder.
 *
 * To ship the art, register the delivery (see `registerSketchMedia`):
 *   registerSketchMedia({
 *     "Back Squat": { kind: "loop", frames: ["…/back-squat.webp"], cycleMs: 2200 },
 *     squat: { kind: "still", src: "…/pattern-squat.png" },
 *   });
 */
export const SKETCH_MEDIA: Record<string, ExerciseMediaAsset> = {};

/** Register delivered art (exact names and/or archetype stand-ins). Merges over
 *  whatever is already registered, so drops can land in batches. */
export function registerSketchMedia(entries: Record<string, ExerciseMediaAsset>): void {
  for (const [key, asset] of Object.entries(entries)) SKETCH_MEDIA[key] = asset;
}

/** Clear the registry — tests, and a client re-registering a fresh manifest. */
export function resetSketchMedia(): void {
  for (const key of Object.keys(SKETCH_MEDIA)) delete SKETCH_MEDIA[key];
}

// ── the admin library overlay (CMS-authored URLs) ───────────────────────────

/** One published library row's media fields (Exercise.videoUrl / thumbUrl). */
export interface LibraryMedia {
  name: string;
  videoUrl?: string | null;
  thumbUrl?: string | null;
}

/** name (lowercased) → the asset built from that row. */
let LIBRARY: Map<string, ExerciseMediaAsset> = new Map();

const VIDEO_RE = /\.(mp4|m4v|webm|mov)(\?|#|$)/i;
const ANIMATED_RE = /\.(gif|webp|apng)(\?|#|$)/i;
const IMAGE_RE = /\.(png|jpe?g|svg|avif|heic)(\?|#|$)/i;

/** Build the asset a library row describes. A file we can play/draw becomes a
 *  clip/loop/still; anything else (a YouTube page, a Drive share) stays a link
 *  so the client offers to open it instead of failing to embed it. */
function libraryAsset(row: LibraryMedia): ExerciseMediaAsset | null {
  const video = row.videoUrl?.trim() || "";
  const thumb = row.thumbUrl?.trim() || "";
  const poster = thumb || undefined;
  if (video) {
    if (VIDEO_RE.test(video)) return { kind: "clip", src: video, poster };
    if (ANIMATED_RE.test(video)) return { kind: "loop", frames: [video], cycleMs: 2200, poster };
    if (IMAGE_RE.test(video)) return { kind: "still", src: video };
    return { kind: "link", href: video, poster };
  }
  if (thumb) return { kind: "still", src: thumb };
  return null;
}

/**
 * Publish the admin-managed library's media to this resolver. Global,
 * admin-authored data (identical for every athlete), so a module-level registry
 * is right here for the same reason it is for `setExerciseCatalog` — and it
 * keeps every call site's signature unchanged. Both clients call this from the
 * same place they publish the engine catalog.
 */
export function setExerciseMediaCatalog(rows: LibraryMedia[] | null | undefined): void {
  const next = new Map<string, ExerciseMediaAsset>();
  for (const row of rows ?? []) {
    const asset = libraryAsset(row);
    if (asset && row.name) next.set(row.name.trim().toLowerCase(), asset);
  }
  LIBRARY = next;
}

/** Drop the library overlay — back to the registry + placeholders. */
export function resetExerciseMediaCatalog(): void {
  LIBRARY = new Map();
}

// ── the resolver ────────────────────────────────────────────────────────────

/**
 * The media for a lift. ALWAYS returns a resolution (never null) so a caller
 * can't accidentally render nothing: when no art exists, `asset` is null and
 * `fallback` carries the procedural demo to draw instead. The single swap point
 * — the clients render whichever of the two came back.
 */
export function exerciseMedia(name: string): ExerciseMediaResolution {
  const e = gymExercise(name);
  const canonical = e?.name ?? name;
  const archetype = e ? exerciseArchetype(e) : null;
  const slot = mediaSlot(canonical);

  const library = LIBRARY.get(canonical.trim().toLowerCase()) ?? LIBRARY.get(name.trim().toLowerCase());
  const exact = SKETCH_MEDIA[canonical];
  const pattern = archetype ? SKETCH_MEDIA[archetype] : undefined;

  const asset = library ?? exact ?? pattern ?? null;
  const source: MediaSource | null = library ? "library" : exact ? "sketch" : pattern ? "pattern" : null;
  const status: MediaStatus = source === null ? "pending" : source === "pattern" ? "pattern" : "drawn";

  return {
    name: canonical,
    slot,
    archetype,
    status,
    asset,
    source,
    // The placeholder is only meaningful when there's no asset — but it's cheap
    // and the clients want it as the poster/paused frame either way.
    fallback: exerciseAnimation(canonical),
    alt: asset?.alt ?? canonical,
  };
}

/** Convenience: is there real art for this lift (drawn or a pattern stand-in)? */
export function hasExerciseMedia(name: string): boolean {
  return exerciseMedia(name).asset !== null;
}

/** The still a SMALL surface (a picker row, a card) can show — a poster where
 *  one exists, else the drawing itself. Null while nothing is drawn, and null
 *  for a clip/link with no poster: the caller keeps whatever tile it draws
 *  today rather than showing 200 identical placeholders at 40px. */
export function exerciseThumb(name: string): string | null {
  const asset = exerciseMedia(name).asset;
  if (!asset) return null;
  switch (asset.kind) {
    case "still":
      return asset.src;
    case "loop":
      return asset.poster ?? asset.frames[0] ?? null;
    case "clip":
    case "link":
      return asset.poster ?? null;
  }
}

// ── the illustrator's brief ─────────────────────────────────────────────────

export interface SketchShotListRow {
  slot: string;
  name: string;
  category: GymCategory;
  archetype: AnimArchetype;
  equipment: GymEquipment;
  unilateral: boolean;
  /** reps / seconds (holds) / metres (carries) — the drawing needs to read as
   *  the right kind of effort. */
  measure: GymExercise["measure"];
  status: MediaStatus;
}

/**
 * Every gym lift and whether it's been drawn — the shot list an illustrator
 * works through. Sorted by archetype then name so one sitting covers a whole
 * movement pattern (all the squats, then all the hinges), which is how drawn
 * demos stay stylistically consistent.
 */
export function sketchShotList(): SketchShotListRow[] {
  return GYM_EXERCISES.map((e) => {
    const m = exerciseMedia(e.name);
    return {
      slot: m.slot,
      name: e.name,
      category: e.category,
      archetype: exerciseArchetype(e),
      equipment: e.equipment,
      unilateral: !!e.unilateral,
      measure: e.measure,
      status: m.status,
    };
  }).sort((a, b) => a.archetype.localeCompare(b.archetype) || a.name.localeCompare(b.name));
}

export interface ArchetypeCoverage {
  archetype: AnimArchetype;
  total: number;
  drawn: number;
  pattern: number;
  pending: number;
}

export interface SketchCoverage {
  total: number;
  /** lifts with their OWN drawing. */
  drawn: number;
  /** lifts covered only by their archetype's stand-in drawing. */
  pattern: number;
  /** lifts still on the procedural placeholder. */
  pending: number;
  /** 0-100, counting a pattern stand-in as half-covered. */
  pct: number;
  byArchetype: ArchetypeCoverage[];
}

/** How much of the catalog is actually drawn — the number the admin screen
 *  shows and the one that tells us when the placeholder can retire. */
export function sketchCoverage(): SketchCoverage {
  const rows = sketchShotList();
  const byKey = new Map<AnimArchetype, ArchetypeCoverage>();
  let drawn = 0, pattern = 0, pending = 0;
  for (const r of rows) {
    if (r.status === "drawn") drawn++;
    else if (r.status === "pattern") pattern++;
    else pending++;
    const cur = byKey.get(r.archetype) ?? { archetype: r.archetype, total: 0, drawn: 0, pattern: 0, pending: 0 };
    cur.total++;
    cur[r.status]++;
    byKey.set(r.archetype, cur);
  }
  const total = rows.length;
  return {
    total,
    drawn,
    pattern,
    pending,
    pct: total === 0 ? 0 : Math.round(((drawn + pattern / 2) / total) * 100),
    byArchetype: [...byKey.values()].sort((a, b) => b.pending - a.pending || a.archetype.localeCompare(b.archetype)),
  };
}

/**
 * The commissioning brief as plain text — the drawing spec plus every lift still
 * to draw, one CSV row each (slot, name, archetype, equipment, measure). The
 * admin console copies this straight to an illustrator; the slot column is the
 * filename to deliver each drawing under.
 */
export function sketchBrief(): string {
  const pending = sketchShotList().filter((r) => r.status !== "drawn");
  const head = [
    "HYBRID — exercise demo sketches",
    "",
    "Style: side profile, single athlete facing right, clean line work on a",
    "transparent ground. Square canvas (1:1), the figure filling ~80% of the",
    "height with the implement legible. One still per lift; where the movement",
    "needs it, 2-3 keyframes (start, end, and the midpoint if the path bends).",
    "Deliver each drawing under its SLOT filename below — still as .png, loop as",
    "an animated .webp or numbered frames (slot-1.png, slot-2.png, …).",
    "",
    `${pending.length} of ${GYM_EXERCISES.length} lifts still to draw.`,
    "",
    "slot,name,archetype,equipment,measure",
  ].join("\n");
  const rows = pending.map((r) => [r.slot, r.name, r.archetype, r.equipment, r.measure].join(","));
  return [head, ...rows].join("\n");
}
