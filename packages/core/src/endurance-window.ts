/**
 * THE ENDURANCE WINDOW — what the Endurance section's period was made of, over
 * whatever window the screen's date filter is showing.
 *
 * Endurance used to be a run of per-discipline rails hanging off the bottom of
 * the Progress cluster: five lanes of depth with nothing above them stating the
 * whole. You could see that running was 39 km and swimming 600 m and never be
 * told what the two came to, how many times you went out, or whether any of it
 * was more than usual. The lanes answer "how is my running going"; nothing
 * answered "how is my endurance going".
 *
 * THE RECONCILIATION RULE, the same one progress-parentage.ts follows: this
 * module computes NOTHING of its own. It calls the exact `activitySummary` the
 * verdict card renders, over the exact range the screen resolved, and keeps the
 * groups whose kind is `endurance` or `sport`. So this section's minutes are
 * literally a subset of the verdict card's hours column — a slice, never a
 * second opinion — and its distance is that card's distance column minus
 * nothing, since only these groups carry any.
 *
 * WHAT COUNTS AS ENDURANCE HERE. Both `endurance` (the disciplines with their
 * own lanes: running, cycling, swimming, rowing, …) and `sport` (tennis,
 * squash, five-a-side — the Other-sports tiles). The section holds both, so its
 * summary must too: a week that was three squash matches and nothing else must
 * not open by reading zero. The slices keep their kind, so a client can still
 * say how much of the window was lanes and how much was other sports.
 *
 * WHAT THE CLIENTS RENDER, and why the rest still belongs here. The opener is a
 * SENTENCE (see `enduranceLead` below) — the composition, which is the one
 * thing about this section no other surface on Today can state. It renders
 * neither the per-slice breakdown nor the totals as columns, and both omissions
 * are the same omission: every `slices` row is a discipline with a whole rail
 * directly beneath it, and the totals are the verdict card's own columns one
 * screen up. The model keeps them regardless. They are what the window IS, they
 * carry rules worth keeping proven (a brick session counts once; shares run on
 * TIME, so a timed sport is never silently dropped), and the Endurance screen
 * is the obvious next reader. A model is complete; a client picks from it — the
 * same contract activity-window.ts has, whose detail groups no single surface
 * renders whole either.
 *
 * Canonical units throughout, never formatted here: minutes for time, km for
 * distance. Clients format through their own preference, which is what lets web
 * and mobile say the identical sentence.
 */
import { activitySummary, activityBaselineWindows, type ActivityGroupKind, type ActivityRange } from "./activity-window";
import type { BodyweightInput } from "./bodyweight";
import type { CardioDiscipline, LoggedSession } from "./engines/session";
import { VERDICT_THRESHOLD_PCT, type VerdictDirection } from "./week-verdict";

/** The two group kinds this section owns. */
const OWNED: ReadonlySet<ActivityGroupKind> = new Set<ActivityGroupKind>(["endurance", "sport"]);

/** One discipline's or sport's share of the window. */
export interface EnduranceSlice {
  /** The activity-window group id: "d:running" | "sport:squash". */
  id: string;
  /** `endurance` for a lane discipline, `sport` for everything else. */
  kind: "endurance" | "sport";
  /** The endurance discipline, when the slice is one. */
  discipline: CardioDiscipline | null;
  /** i18n key for the name — null for a named sport, which carries its own
   *  label because "Squash" is not a translatable app string. */
  labelKey: string | null;
  label: string | null;
  /** A semantic sport glyph (never a decorative marker). */
  icon: string;
  /** The slice's natural distance unit — metres for pool and ergo sports. */
  unit: "km" | "m";
  minutes: number;
  distanceKm: number;
  /** Distinct sessions this slice appeared in, inside the window. */
  sessions: number;
  /** 0…1 of the window's MINUTES — the share bar, computed once here so both
   *  clients draw the same widths. Time is the one measure every endurance
   *  discipline and every timed sport carries, which distance is not: a share
   *  bar drawn on km would silently drop squash entirely. */
  share: number;
}

export interface EnduranceTotals {
  /** Distinct sessions in the window carrying any endurance or sport. */
  efforts: number;
  minutes: number;
  distanceKm: number;
}

/**
 * The measures a window can be asked about. No surface prints them as columns
 * any more — the opener is a sentence, and the figures it used to carry were
 * the verdict card's own (see `enduranceLead`) — but they remain the domain of
 * `enduranceDeltaPct` / `enduranceDirection`, which the sentence's working-out
 * asks about TIME, and they define `EnduranceMetric`.
 *
 * ORDER IS figure-order.ts's — efforts (the session count), then time, then
 * distance. It read efforts/distance/minutes, which did not even match the
 * `EnduranceTotals` shape a few lines above it, let alone the rest of the app.
 */
export const ENDURANCE_METRICS = ["efforts", "minutes", "distance"] as const;
export type EnduranceMetric = (typeof ENDURANCE_METRICS)[number];

export interface EnduranceWindow {
  range: ActivityRange;
  totals: EnduranceTotals;
  /** Mean of the preceding windows of the same length — the same comparison
   *  the verdict card makes, so "up on your average" means one thing on this
   *  screen. Zeroes when there is no history to compare against. */
  baseline: EnduranceTotals;
  /** Biggest first, by minutes. */
  slices: EnduranceSlice[];
  /** Lane disciplines in the window (running, cycling, …). */
  disciplines: number;
  /** Other sports in the window (tennis, squash, …). */
  sports: number;
  /** Preceding windows (of those compared) that carried any endurance. */
  baselinePeriods: number;
  /** How many preceding windows were available to compare against. */
  baselineOf: number;
}

/** Totals + slices for one already-resolved window. */
function windowSlice(
  sessions: LoggedSession[],
  range: ActivityRange,
  bw: BodyweightInput | undefined,
): { totals: EnduranceTotals; slices: EnduranceSlice[] } {
  const sum = activitySummary(sessions, range, bw);
  const hours = sum.details.hours.groups.filter((g) => OWNED.has(g.kind));
  const distance = sum.details.distance.groups.filter((g) => OWNED.has(g.kind));

  const minutesById = new Map(hours.map((g) => [g.id, g.value]));
  const kmById = new Map(distance.map((g) => [g.id, g.value]));
  const minutes = hours.reduce((n, g) => n + g.value, 0);
  const distanceKm = distance.reduce((n, g) => n + g.value, 0);

  // A group with distance but no minutes (a run imported with a route and no
  // duration) still deserves a slice — hence the union of the two id sets,
  // rather than reading the hours groups alone. `sessions` comes from whichever
  // side names the group, and both count the same distinct sessions.
  const metas = new Map(hours.map((g) => [g.id, g]));
  for (const g of distance) if (!metas.has(g.id)) metas.set(g.id, g);

  const slices: EnduranceSlice[] = [...metas.values()]
    .map((g) => ({
      id: g.id,
      kind: g.kind === "sport" ? ("sport" as const) : ("endurance" as const),
      discipline: g.discipline,
      labelKey: g.labelKey,
      label: g.label,
      icon: g.icon,
      unit: g.unit,
      minutes: minutesById.get(g.id) ?? 0,
      distanceKm: kmById.get(g.id) ?? 0,
      sessions: g.sessions,
      share: minutes > 0 ? (minutesById.get(g.id) ?? 0) / minutes : 0,
    }))
    // Biggest first; a tie falls back to the id so the order is total and the
    // two clients can't stack the same window differently.
    .sort((a, b) => b.minutes - a.minutes || b.distanceKm - a.distanceKm || (a.id < b.id ? -1 : 1));

  // EFFORTS ARE SESSIONS, not blocks. A brick session — a ride and a run on one
  // entry — is ONE time you went out, and counting its two blocks would make
  // the figure disagree with the verdict card's session count in a way nothing
  // on the screen explains. The lanes still count blocks, and say so: a lane's
  // summary tile is labelled with its own scope.
  const ids = new Set<string>();
  for (const g of [...hours, ...distance]) for (const it of g.items) ids.add(it.sessionId);

  return { totals: { efforts: ids.size, minutes, distanceKm }, slices };
}

/**
 * The endurance read for a period, with the baseline it is measured against.
 *
 * The baseline is the mean of the preceding windows of the same length —
 * INCLUDING any that were empty, because a fortnight off genuinely is part of
 * your average and dropping it would make every return look like a personal
 * best. Same rule, same windows, as the verdict card.
 */
export function enduranceWindow(
  sessions: LoggedSession[],
  range: ActivityRange,
  bw?: BodyweightInput,
): EnduranceWindow {
  const { totals, slices } = windowSlice(sessions, range, bw);

  const priors = activityBaselineWindows(range).map(
    // A baseline window is the SAME range shape with a different frame: only
    // `from`/`through` are read by the summary, and `to` is carried so the
    // object stays a coherent ActivityRange rather than a half-filled one.
    (w) => windowSlice(sessions, { ...range, from: w.from, to: w.to, through: w.to }, bw).totals,
  );
  const mean = (pick: (t: EnduranceTotals) => number) =>
    priors.length ? priors.reduce((n, p) => n + pick(p), 0) / priors.length : 0;

  return {
    range,
    totals,
    baseline: {
      efforts: mean((t) => t.efforts),
      minutes: mean((t) => t.minutes),
      distanceKm: mean((t) => t.distanceKm),
    },
    slices,
    disciplines: slices.filter((s) => s.kind === "endurance").length,
    sports: slices.filter((s) => s.kind === "sport").length,
    baselinePeriods: priors.filter((p) => p.efforts > 0).length,
    baselineOf: priors.length,
  };
}

/** A metric's canonical value out of the window. */
export const enduranceValue = (t: EnduranceTotals, m: EnduranceMetric): number =>
  m === "efforts" ? t.efforts : m === "distance" ? t.distanceKm : t.minutes;

/**
 * A METRIC'S OWN MOVE — the signed % it sits above or below its own baseline,
 * rounded. Null when there is no baseline to move from, which is a different
 * fact from "it did not move" and must never render as 0%. Same contract as
 * the verdict card's `figureDeltaPct`, so the two cards' deltas mean the same
 * thing.
 */
export function enduranceDeltaPct(w: EnduranceWindow, m: EnduranceMetric): number | null {
  const base = enduranceValue(w.baseline, m);
  if (base <= 0) return null;
  return Math.round(((enduranceValue(w.totals, m) - base) / base) * 100);
}

/**
 * A METRIC'S OWN DIRECTION, on the verdict card's SENTENCE threshold
 * (VERDICT_THRESHOLD_PCT) — because what this tones is a sentence too: the
 * signed delta inside this section's lead. A move too small to be worth a claim
 * up there is too small to be worth one down here, and the two cards can never
 * contradict each other about whether a period was flat.
 *
 * It is deliberately NOT the verdict card's lower mark threshold
 * (VERDICT_END_THRESHOLD_PCT). That one ranks the two ENDS of a row of figures
 * — which end of four this is — and this section's lead is one figure with no
 * row to be an end of, so there is nothing here for the lower bar to rank.
 */
export function enduranceDirection(w: EnduranceWindow, m: EnduranceMetric): VerdictDirection {
  const d = enduranceDeltaPct(w, m);
  if (d === null || Math.abs(d) < VERDICT_THRESHOLD_PCT) return "flat";
  return d < 0 ? "down" : "up";
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  THE LEAD — the section's opener, as a SENTENCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The opener was three figures (efforts / distance / time) and it had to stop
 * being figures, because most of what it printed was already on the screen.
 * DISTANCE is the worst of it: only endurance and sport groups ever carry any,
 * so this section's kilometres are the verdict card's KM column to the decimal
 * — the same number, twice, a screen apart. Efforts sit next to that card's
 * SESSIONS count and read as a contradiction of it. Only time was genuinely
 * new, and one honest figure does not need three columns and a divider.
 *
 * What the verdict card cannot say, at any zoom, is what the endurance was MADE
 * OF — how many sports, and which one carried it. So the opener says that, in
 * words, and hands the arithmetic back to the card above and the lanes below.
 *
 * Two parts, the same anatomy the verdict card uses: a SENTENCE, and under it a
 * mono working-out carrying the one figure that isn't a restatement (the
 * section's own time) against the one comparison nothing else makes (its own
 * baseline). Pure, so both clients say the same thing about the same window.
 */

/** At or above this share of the period's time, the leading sport gets "mostly"
 *  rather than "led by" — the difference between a week that WAS one sport and
 *  a week that merely leaned on one. */
export const ENDURANCE_LEAD_MAJORITY = 0.5;

export interface EnduranceLead {
  /** i18n key for the sentence. Interpolates `{n}` (sports) and `{s}` (the
   *  leading sport's name), except when empty, which takes neither. */
  key: string;
  /** Disciplines + other sports in the window — the sentence's `{n}`. */
  sports: number;
  /** The biggest slice by time; null when the window holds nothing. */
  lead: EnduranceSlice | null;
  /** i18n key for the mono line under the sentence. `{h}` takes the section's
   *  time ALREADY FORMATTED through `formatDuration` — the string carries no
   *  unit of its own, so this line and the verdict card's hours column can't
   *  print a span two ways. `{d}` takes the signed delta, and is absent from
   *  the key entirely when there is no baseline to move from. */
  whyKey: string;
  /** The section's minutes — canonical, the client renders the hours. */
  minutes: number;
  /** The TIME metric's own signed move, or null with no baseline. Null is a
   *  different fact from "it did not move" and must never render as 0%. */
  deltaPct: number | null;
}

/**
 * The opener's sentence and its working-out.
 *
 * THREE SHAPES, and each is true of the week it describes: nothing logged; one
 * sport, which is a fact about the week rather than a degenerate case of the
 * others; or several, split by whether the leader carried the majority of the
 * time. "Led by" is safe at any number of sports — the leader is the largest
 * slice by definition — so no window can produce a claim it doesn't support.
 */
export function enduranceLead(w: EnduranceWindow): EnduranceLead {
  const sports = w.slices.length;
  const lead = w.slices[0] ?? null;
  const deltaPct = enduranceDeltaPct(w, "minutes");
  const key = sports === 0 ? "w.home.endw.empty"
    : sports === 1 ? "w.home.endw.leadOne"
      : (lead && lead.share >= ENDURANCE_LEAD_MAJORITY) ? "w.home.endw.leadMost"
        : "w.home.endw.leadLed";
  return {
    key,
    sports,
    lead,
    whyKey: deltaPct === null ? "w.home.endw.whyCold" : "w.home.endw.why",
    minutes: w.totals.minutes,
    deltaPct,
  };
}

/** A slice's display name needs the client's `t`; this says which to use. */
export const sliceName = (s: { labelKey: string | null; label: string | null }, t: (k: string) => string): string =>
  s.labelKey ? t(s.labelKey) : (s.label ?? "");

/**
 * Whether Today should carry an Endurance section at all.
 *
 * A pure lifter gets no heading, no empty card and no zeroes: the section is
 * absent, exactly as the lanes and the sport tiles already are individually.
 * The question is asked of the WHOLE history rather than of the shown window,
 * so a runner who took this week off still finds their section where they left
 * it — with the card saying the week was quiet, which is a real answer.
 */
export function hasEnduranceHistory(sessions: LoggedSession[]): boolean {
  for (const s of sessions) {
    for (const b of s.blocks) if (b.kind === "cardio") return true;
  }
  return false;
}
