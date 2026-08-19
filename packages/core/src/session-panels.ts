/**
 * SESSION PANELS — the one manifest of what a session's summary is made of.
 *
 * WHY THIS EXISTS. The share deck was assembled TWICE, from the same
 * ingredients, in two files: once on the finish screen the moment a workout
 * ends, once on the session review opened later. They had already drifted, and
 * in the direction that produces nonsense rather than mere inconsistency — the
 * finish screen always dealt an overview card (title, sets, tonnage), so a
 * 1 500 m swim shared as "1 SET – 0.0 t", and it dealt a second stat card for
 * TIME while the review dealt one for the discipline's own headline. Same
 * session, two decks, and no test could catch it because neither list was a
 * value anything could compare.
 *
 * So the list becomes a value. This module answers WHICH panels a session has
 * and IN WHAT ORDER; the clients answer what each one looks like. Two callers
 * consuming one manifest cannot disagree about the deck, which is a stronger
 * guarantee than two callers being carefully kept in step.
 *
 * WHAT IT DOES NOT DO: no translation and no layout. Where a panel's content is
 * pure — the signature's bars, the muscle split, the headline figure — it is
 * computed here so both callers show the same numbers. Where it needs the
 * athlete's language (a PR line, the fun fact's sentence), the manifest carries
 * the MODEL and the client formats it with the same core formatter it already
 * used. Labels travel as i18n keys, exactly as session-wrapped.ts sends them.
 */
import type { LoggedSession } from "./engines/session";
import type { Muscle } from "./exercise-db";
import type { Celebration } from "./session-celebration";
import type { FunFact } from "./engines/comparisons";
import { sessionFunFact } from "./engines/comparisons";
import { sessionCelebration } from "./session-celebration";
import { prsForSession, cardioPrsForSession } from "./engines/records";
import { sessionSignature, SIGNATURE_MIN_BARS } from "./session-signature";
import { sessionWrapped, type WrappedDiscipline } from "./session-wrapped";
import { sessionMuscleMap } from "./session-muscle-map";
import { deviceTrueSession } from "./device-truth";
import { bwAt, type BodyweightInput } from "./bodyweight";
import type { WeightUnit } from "./units";

/** One bar of the muscle panel — the FINE vocabulary, never the seven buckets. */
export interface PanelMuscleBar {
  muscle: Muscle;
  /** short label ("Front delts") — the anatomy model's own, not a client map */
  short: string;
  /** share of the top mover's volume, 0–100, for the bar's width */
  pct: number;
  /** the muscle's tonnage in kg (the client formats it in the athlete's unit) */
  volumeKg: number;
}

/**
 * A panel in the session's summary deck. `eyebrowKey` is an i18n key; every
 * other field is either a computed value both callers must agree on, or the
 * model the caller formats with a core formatter.
 */
export type SessionPanel =
  /** A record was set: the trophy card leads the deck. */
  | { kind: "trophy"; eyebrowKey: string; celebration: Celebration }
  /** The session's shape as bars — only when there are enough of them to be a shape. */
  | { kind: "signature"; eyebrowKey: string; bars: number[] }
  /** The gym card (title, sets, tonnage, bests) — gym sessions only. */
  | { kind: "overview"; eyebrowKey: string }
  /** The one figure that defines this session, in its own unit. */
  | { kind: "stat"; eyebrowKey: string; value: string; unitKey: string }
  /** Records and today's bests. */
  | { kind: "prs"; eyebrowKey: string }
  /** Where the work landed. */
  | { kind: "muscle"; eyebrowKey: string; bars: PanelMuscleBar[] }
  /** The comparison sentence. */
  | { kind: "fun"; eyebrowKey: string; fact: FunFact };

export type SessionPanelKind = SessionPanel["kind"];

/** How many muscles the share panel prints before the bars stop separating. */
export const PANEL_MUSCLE_ROWS = 6;

/** A gym session is the only one an overview card can describe: it is the card
 *  that counts sets and tonnage, and a swim has neither. */
const isGymSession = (d: WrappedDiscipline): boolean => d === "strength" || d === "mixed";

/**
 * The session's deck, in order. Pass the full history — records, the headline
 * and the muscle baseline all read it — and the athlete's dated bodyweight so
 * bodyweight lifts count their true work.
 *
 * Deliberately takes no "which screen is asking" flag. The moment one exists,
 * the two decks are two decks again.
 */
export function sessionPanels(
  session: LoggedSession,
  all: LoggedSession[],
  opts: { units: WeightUnit; bw?: BodyweightInput },
): SessionPanel[] {
  const { units, bw } = opts;
  const bwHere = bwAt(bw, session.startedAt);
  const wrapped = sessionWrapped(session, all, { units, bw });
  const cel = sessionCelebration(
    prsForSession(all, session.id, bw),
    cardioPrsForSession(all, session.id),
  );
  const signature = sessionSignature(session);
  // The fun fact compares distance and tonnage, so it reads the MEASURED
  // session — a run the watch recorded at 8.2 km must not be compared at the
  // 8 km somebody typed.
  const fact = sessionFunFact(deviceTrueSession(session).blocks, bwHere);
  const muscles = sessionMuscleMap(session, { bw });
  const top = muscles.muscles[0]?.volumeKg ?? 0;

  const panels: SessionPanel[] = [];
  if (cel) panels.push({ kind: "trophy", eyebrowKey: "summary.slide.prs", celebration: cel });
  if (signature.length >= SIGNATURE_MIN_BARS)
    panels.push({ kind: "signature", eyebrowKey: "session.wrapped.title", bars: signature });
  if (isGymSession(wrapped.discipline))
    panels.push({ kind: "overview", eyebrowKey: "summary.slide.overview" });
  panels.push({
    kind: "stat",
    eyebrowKey: "summary.slide.load",
    value: wrapped.headline.value,
    unitKey: wrapped.headline.labelKey,
  });
  panels.push({ kind: "prs", eyebrowKey: "summary.slide.prs" });
  if (muscles.muscles.length > 0 && top > 0)
    panels.push({
      kind: "muscle",
      eyebrowKey: "summary.slide.muscle",
      bars: muscles.muscles.slice(0, PANEL_MUSCLE_ROWS).map((m) => ({
        muscle: m.muscle,
        short: m.short,
        pct: Math.round((m.volumeKg / top) * 100),
        volumeKg: m.volumeKg,
      })),
    });
  if (fact) panels.push({ kind: "fun", eyebrowKey: "summary.slide.fun", fact });
  return panels;
}
