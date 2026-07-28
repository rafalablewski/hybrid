/**
 * WHAT THE CHECK-IN COLUMNS ACTUALLY MEAN.
 *
 * Three of the daily check-in's four metrics are "higher is better" and read
 * exactly as their name suggests: energy, sleep, mood. The fourth does not.
 *
 * The column is called `soreness`, and both the Prisma comment and the field
 * name imply 5 = very sore. THE STORED VALUE IS THE OPPOSITE. The guided flow
 * asks "How fresh do your muscles feel?" (checkin-flow.ts), the one-tap face on
 * Today writes the picked readiness level into all four metrics at once, and
 * `checkinRating` averages the four as if higher were better everywhere. Every
 * writer agrees: 5 means FRESH, 1 means wrecked. Only the name disagrees.
 *
 * That is a trap with teeth. A consumer that reads the field by its name gets a
 * perfectly plausible, exactly backwards answer — no crash, no type error, just
 * an athlete reporting "my legs feel great" having their training ceiling
 * lowered for it. The volume estimator shipped with precisely that bug.
 *
 * So the polarity is named ONCE, here, and every consumer converts at the
 * boundary instead of remembering. The column can't be renamed without a
 * migration; this is the next best thing, and it is pinned by tests.
 *
 * WHAT THE ATHLETE SEES. The metric is called FRESHNESS everywhere a human
 * reads it — the card, the guided flow, the coach console, all three languages.
 * That is the direction the question always ran ("how fresh do your muscles
 * feel?") and the direction the value is stored, so the name now agrees with
 * both. Only two things still say `soreness`: this Postgres column, and the
 * metric key that has to match it. Nothing translates on the wire; the copy key
 * (`w.recovery.checkins.freshness`) simply differs from the storage key, which
 * is why `metricLabelKey` exists instead of building the i18n key from the
 * field name.
 */

/** The 1–5 value stored in `Checkin.soreness`: 5 = muscles feel fresh, 1 = wrecked. */
export type FreshnessRating = number;
/** The 1–5 value people mean when they say "soreness": 5 = very sore, 1 = none. */
export type SorenessRating = number;

const inScale = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;

/**
 * Read the check-in's stored value as SORENESS (5 = very sore) — the sense the
 * column's name implies and the sense fatigue models want. Null passes through,
 * because an unreported metric must stay unknown rather than becoming a 3.
 */
export function sorenessFromCheckin(stored: FreshnessRating | null | undefined): SorenessRating | null {
  return inScale(stored) ? 6 - stored : null;
}

/** The inverse — write a soreness reading into the column's freshness sense. */
export function checkinFromSoreness(soreness: SorenessRating | null | undefined): FreshnessRating | null {
  return inScale(soreness) ? 6 - soreness : null;
}

/** Read the stored value as FRESHNESS (5 = fresh), i.e. as-is but validated. */
export function freshnessFromCheckin(stored: FreshnessRating | null | undefined): FreshnessRating | null {
  return inScale(stored) ? stored : null;
}
