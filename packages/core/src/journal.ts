// Journal — the shared shape + maths behind Profile → Private → Journal. ONE
// source of truth for both clients: the mood scale, the suggested tags, input
// sanitisation for the API, and how a flat newest-first list becomes
// day-grouped timeline cards. Pure + unit-tested.

/** A private journal entry. `mood` is 1..4 (see MOODS) or null; `tags` are
 *  short slugs (see SUGGESTED_TAGS) — both optional so old entries still load. */
export type JournalEntry = {
  id: string;
  body: string;
  createdAt: string;
  mood?: number | null;
  tags?: string[] | null;
};

export type MoodDef = {
  value: 1 | 2 | 3 | 4;
  /** i18n key for the mood's label (used for the a11y name). */
  labelKey: string;
  emoji: string;
  /** A palette accent hint the clients map to their theme colour. */
  tone: "red" | "amber" | "lime";
};

// Rough → strong. Kept short on purpose: a quick tap, not a survey.
export const MOODS: readonly MoodDef[] = [
  { value: 1, labelKey: "w.account.profile.priv-j-mood-rough",  emoji: "😖", tone: "red" },
  { value: 2, labelKey: "w.account.profile.priv-j-mood-ok",     emoji: "😐", tone: "amber" },
  { value: 3, labelKey: "w.account.profile.priv-j-mood-good",   emoji: "🙂", tone: "lime" },
  { value: 4, labelKey: "w.account.profile.priv-j-mood-strong", emoji: "💪", tone: "lime" },
] as const;

export const moodDef = (value: number | null | undefined): MoodDef | null =>
  value == null ? null : MOODS.find((m) => m.value === value) ?? null;

export type TagDef = { slug: string; labelKey: string };

// The chips offered under the composer. Stored as slugs; the label is localised.
export const SUGGESTED_TAGS: readonly TagDef[] = [
  { slug: "sleep",     labelKey: "w.account.profile.priv-j-tag-sleep" },
  { slug: "nutrition", labelKey: "w.account.profile.priv-j-tag-nutrition" },
  { slug: "niggle",    labelKey: "w.account.profile.priv-j-tag-niggle" },
  { slug: "recovery",  labelKey: "w.account.profile.priv-j-tag-recovery" },
  { slug: "stress",    labelKey: "w.account.profile.priv-j-tag-stress" },
  { slug: "travel",    labelKey: "w.account.profile.priv-j-tag-travel" },
  { slug: "pr",        labelKey: "w.account.profile.priv-j-tag-pr" },
  { slug: "deload",    labelKey: "w.account.profile.priv-j-tag-deload" },
] as const;

const TAG_LABEL = new Map(SUGGESTED_TAGS.map((t) => [t.slug, t.labelKey]));
/** i18n key for a stored tag slug, or null for a custom one (render the slug). */
export const tagLabelKey = (slug: string): string | null => TAG_LABEL.get(slug) ?? null;

export const MAX_TAGS = 6;

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

// Local calendar-day key for grouping (runs on the client, so local tz is right).
const dayKeyOf = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export type JournalDayGroup = {
  /** Local day key, e.g. "2026-6-14". */
  key: string;
  /** Representative timestamp (the newest entry that day) for the label. */
  ts: number;
  entries: JournalEntry[];
};

/** Group a newest-first list into day buckets, preserving newest-first order of
 *  both the days and the entries within each day. */
export function journalDayGroups(entries: JournalEntry[]): JournalDayGroup[] {
  const groups: JournalDayGroup[] = [];
  const index = new Map<string, JournalDayGroup>();
  for (const e of entries) {
    const ts = Date.parse(e.createdAt);
    const key = Number.isNaN(ts) ? "unknown" : dayKeyOf(ts);
    let g = index.get(key);
    if (!g) { g = { key, ts: Number.isNaN(ts) ? 0 : ts, entries: [] }; index.set(key, g); groups.push(g); }
    g.entries.push(e);
  }
  return groups;
}

/** "today" | "yesterday" | null (null → the client formats the date). */
export function relativeDayKey(ts: number, nowMs: number): "today" | "yesterday" | null {
  if (dayKeyOf(ts) === dayKeyOf(nowMs)) return "today";
  if (dayKeyOf(ts) === dayKeyOf(nowMs - 86_400_000)) return "yesterday";
  return null;
}
