// Notes — the shared primitives behind a PRIVATE training note: a quick mood
// tap + a few context tags, attached to a logged Session (Profile shows nothing;
// only the owner ever sees it). ONE source of truth for both clients: the mood
// scale, the suggested tags, and the input sanitisation the API reuses. Pure +
// unit-tested. (Deliberately generic — not session-specific — so any future
// note surface can reuse it.)

import { glyphMark, type Mark } from "./theme/mark";
import type { BrandAccent } from "./semantic";

export type MoodDef = {
  value: 1 | 2 | 3 | 4;
  /** i18n key for the mood's label (used for the a11y name). */
  labelKey: string;
  /** The mood's drawing. Was an emoji (😖 😐 🙂 💪); it takes four rungs of the
   *  SAME drawn face ramp the effort and fatigue scales use, so the app's three
   *  self-report questions stop being asked in three different hands. */
  mark: Mark;
  /** A palette accent hint the clients map to their theme colour. */
  /** A mood is never blue — narrow, but still DERIVED, so it cannot drift. */
  tone: Extract<BrandAccent, "lime" | "amber" | "red">;
};

// Rough → strong. Kept short on purpose: a quick tap, not a survey.
export const MOODS: readonly MoodDef[] = [
  { value: 1, labelKey: "w.train.note.mood-rough",  mark: glyphMark("face-spent"), tone: "red" },
  { value: 2, labelKey: "w.train.note.mood-ok",     mark: glyphMark("face-solid"), tone: "amber" },
  { value: 3, labelKey: "w.train.note.mood-good",   mark: glyphMark("face-steady"), tone: "lime" },
  { value: 4, labelKey: "w.train.note.mood-strong", mark: glyphMark("face-easy"), tone: "lime" },
] as const;

export const moodDef = (value: number | null | undefined): MoodDef | null =>
  value == null ? null : MOODS.find((m) => m.value === value) ?? null;

export type TagDef = { slug: string; labelKey: string };

// The chips offered under the note. Training-oriented context; stored as slugs,
// the label is localised.
export const SUGGESTED_TAGS: readonly TagDef[] = [
  { slug: "tough",     labelKey: "w.train.note.tag-tough" },
  { slug: "easy",      labelKey: "w.train.note.tag-easy" },
  { slug: "pr",        labelKey: "w.train.note.tag-pr" },
  { slug: "niggle",    labelKey: "w.train.note.tag-niggle" },
  { slug: "form",      labelKey: "w.train.note.tag-form" },
  { slug: "deload",    labelKey: "w.train.note.tag-deload" },
  { slug: "tired",     labelKey: "w.train.note.tag-tired" },
  { slug: "motivated", labelKey: "w.train.note.tag-motivated" },
] as const;

const TAG_LABEL = new Map(SUGGESTED_TAGS.map((t) => [t.slug, t.labelKey]));
/** i18n key for a stored tag slug, or null for a custom one (render the slug). */
export const tagLabelKey = (slug: string): string | null => TAG_LABEL.get(slug) ?? null;

export const MAX_TAGS = 6;
export const MAX_NOTE_LEN = 1000;

/** Coerce arbitrary input into clean tag slugs: lower-case, strip a leading #,
 *  keep [a-z0-9-], drop empties, de-dupe, cap length + count. Used by the API
 *  so a malformed client can never write junk. */
export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const slug = raw.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-]/g, "").slice(0, 24);
    if (slug && !out.includes(slug)) out.push(slug);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** A valid mood (1..4) or null. */
export function sanitizeMood(input: unknown): number | null {
  const n = typeof input === "number" ? input : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

/** A trimmed, length-capped note string, or null when blank. */
export function sanitizeNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  return s ? s.slice(0, MAX_NOTE_LEN) : null;
}

/** True when a session actually carries any private note content — used to
 *  decide whether to render the note affordance on a history row. */
export function hasNote(s: { note?: string | null; mood?: number | null; tags?: string[] | null }): boolean {
  return !!(s.note && s.note.trim()) || s.mood != null || (Array.isArray(s.tags) && s.tags.length > 0);
}
