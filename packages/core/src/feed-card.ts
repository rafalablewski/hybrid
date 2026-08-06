/**
 * FEED CARDS — the shared card model behind the CONNECT feed.
 *
 * The old feed rendered one shape for everything: a title line, a prose body
 * and a row of identical `chips`. A 210 kg deadlift PR and a Tuesday accessory
 * day looked the same, which is precisely why nothing in a lifting feed is
 * worth reacting to (see reference/feed-spec.html).
 *
 * This module gives every item a MOMENT and an ARCHETYPE instead:
 *
 *   • moment  — p0 interrupts (a PR, a first-ever), p1 leads, p2 fills,
 *               p3 seasons. It drives visual weight on both clients and is the
 *               leading term when ranking arrives.
 *   • archetype — which of the layouts renders it (`stat` a big figure,
 *               `sets` a session's top sets, `text` prose). 30+ card types
 *               collapse into a handful of layouts; a new type is a preset,
 *               not a new component.
 *
 * Everything here is PURE and unit-agnostic: loads stay kg, durations stay
 * minutes, and the sentence-level copy is an i18n KEY plus its argument, so
 * both clients translate with their own `t()` and neither invents English in
 * a component. `feedStatText`/`feedFigureText` do the unit conversion at the
 * edge, from the athlete's own preference.
 *
 * DEVICE TRUTH: session figures are read through `deviceTrueSession` and the
 * measured duration/HR are marked `device: true` so the clients can show the
 * watch signature. A figure the device measured never renders as if it were
 * typed (see CLAUDE.md).
 */
import { type AttestationTier } from "./attestation";
import { deviceTrueSession } from "./device-truth";
import { sessionMinutes, sessionVolume, workingSets, type LoggedSession, type StrengthBlock } from "./engines";
import { fmtWeight, type WeightUnit } from "./units";

// ------------------------------------------------------------- the model ----

/** Ranking/visual weight class. p0 interrupts, p3 seasons. */
export type FeedMoment = "p0" | "p1" | "p2" | "p3";

/** Which layout renders the card. Every card type is a preset over one of
 *  these — adding a type must never add a component. */
export type FeedArchetype = "stat" | "sets" | "text";

/** The figures a card's stat row can carry. */
export type FeedStatKey = "duration" | "volume" | "sets" | "hr" | "distance" | "kcal";

export interface FeedStat {
  key: FeedStatKey;
  /** kg for volume, minutes for duration, km for distance, raw count otherwise. */
  value: number;
  /** true when the DEVICE measured it (watch signature, never a typed figure). */
  device?: boolean;
}

/** One line of a session's "top sets" — the 2–3 sets worth reading, not the
 *  whole ledger. */
export interface FeedSetLine {
  name: string;
  sets: number;
  /** reps as logged ("5", "10/leg", "30 s") — never re-parsed into a number. */
  reps: string;
  /** heaviest working load on the line, kg; null for bodyweight/time work. */
  loadKg: number | null;
}

/** The headline is a translation key plus the one thing it names, so the
 *  clients compose it in their own language. */
export type FeedHeadlineKey =
  | "feed.hl.pr" // "{lift} — new PR"
  | "feed.hl.first" // "First {lift}"
  | "feed.hl.session" // the session's own title
  | "feed.hl.sharedPr" // "{lift} — PR"
  | "feed.hl.sharedWorkout"
  | "feed.hl.post";

/** The structured card payload carried on a FeedItem. Optional so a feed built
 *  by an older server (or a shape we can't read) still renders as text. */
export interface FeedDetail {
  moment: FeedMoment;
  archetype: FeedArchetype;
  headlineKey: FeedHeadlineKey;
  /** the lift / session title the headline names. */
  headlineArg?: string;
  /** the card's hero number (a PR load), kg. */
  figureKg?: number;
  /** attestation tier of the figure — 0 renders NO badge (absence is the mark). */
  tier?: AttestationTier;
  /** improvement over the athlete's previous best on this lift, percent. */
  deltaPct?: number;
  /** e1RM behind the PR, kg — the honest second number beside a top load. */
  e1rmKg?: number;
  /** true when this lift had never been trained before (the beginner's PR). */
  firstEver?: boolean;
  stats?: FeedStat[];
  sets?: FeedSetLine[];
  /** the session carries a matched device recording. */
  device?: boolean;
  /** how many PRs the session set, when more than one. */
  prCount?: number;
}

// ------------------------------------------------------------ formatting ----

/** i18n key for a stat's label. Clients translate; core never ships English. */
export const FEED_STAT_LABEL_KEY: Record<FeedStatKey, string> = {
  duration: "feed.stat.min",
  volume: "feed.stat.volume",
  sets: "feed.stat.sets",
  hr: "feed.stat.hr",
  distance: "feed.stat.distance",
  kcal: "feed.stat.kcal",
};

/** The VALUE of a stat, formatted for display (no label, no unit suffix — the
 *  label carries the unit so the number stays a number). */
export function feedStatText(stat: FeedStat, units: WeightUnit): string {
  switch (stat.key) {
    case "volume": {
      // Tonnage in the athlete's unit, thin-spaced so 12 400 stays readable.
      const v = units === "lb" ? stat.value / 0.45359237 : stat.value;
      return Math.round(v).toLocaleString();
    }
    case "distance":
      return (Math.round(stat.value * 10) / 10).toLocaleString();
    default:
      return Math.round(stat.value).toLocaleString();
  }
}

/** A hero figure split into its number and its unit, so the client can set the
 *  unit smaller without re-parsing a joined string. */
export function feedFigureText(kg: number, units: WeightUnit): { value: string; unit: string } {
  const text = fmtWeight(kg, units); // "180 kg" / "397 lb"
  const i = text.lastIndexOf(" ");
  return i < 0 ? { value: text, unit: "" } : { value: text.slice(0, i), unit: text.slice(i + 1) };
}

/** The tier chip: a short mono badge ("T2") plus the i18n key for its word.
 *  Tier 0 returns null — a claimed lift wears no badge, because absence is the
 *  mark and a scarlet letter would tax every beginner. */
export function feedTierChip(tier: AttestationTier | undefined): { short: string; labelKey: string } | null {
  if (tier == null || tier <= 0) return null;
  return { short: `T${tier}`, labelKey: `feed.tier.${tier}` };
}

/** Signed percent, for the delta line ("+4.2%"). */
export function feedDeltaText(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return `${r > 0 ? "+" : ""}${r}%`;
}

// ------------------------------------------------------------- builders -----

const isStrength = (b: LoggedSession["blocks"][number]): b is StrengthBlock => b.kind === "strength";
const numOf = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The 2–3 sets worth reading from a session — heaviest strength lines first.
 * A feed card is not a training log: the full ledger belongs on the expanded
 * post, and dumping it in the stream is exactly what makes every Hevy card
 * look identical.
 */
export function topSetLines(session: LoggedSession, limit = 3): FeedSetLine[] {
  const lines: Array<FeedSetLine & { _rank: number }> = [];
  for (const b of session.blocks) {
    if (!isStrength(b)) continue;
    const working = workingSets(b);
    const use = working.length ? working : b.sets;
    if (!use.length) continue;
    // The line's headline set is its heaviest; reps come from THAT set so the
    // pair always describes one real set the athlete actually did.
    let best = use[0]!;
    let bestLoad = numOf(best.load);
    for (const s of use) {
      const l = numOf(s.load);
      if (Number.isFinite(l) && (!Number.isFinite(bestLoad) || l > bestLoad)) {
        best = s;
        bestLoad = l;
      }
    }
    lines.push({
      name: b.name,
      sets: use.length,
      reps: (best.reps ?? "").trim(),
      loadKg: Number.isFinite(bestLoad) ? bestLoad : null,
      _rank: Number.isFinite(bestLoad) ? bestLoad : 0,
    });
  }
  return lines
    .sort((a, b) => b._rank - a._rank)
    .slice(0, limit)
    .map(({ _rank, ...line }) => line);
}

/** The stat row for a session card — duration, volume, sets, and heart rate
 *  when a device recorded it. Read through device-truth, so a matched session
 *  shows what the watch measured rather than what was typed. */
export function sessionStats(session: LoggedSession): FeedStat[] {
  const s = deviceTrueSession(session);
  const dev = session.device;
  const stats: FeedStat[] = [];

  // Duration precedence, strongest evidence first: what the DEVICE measured,
  // then the session's own clock, and only then the engine's per-set estimate.
  // `sessionMinutes` approximates 3.5 min per set, which is the right input for
  // training load but the wrong number to print beside a watch reading.
  const elapsed = session.completedAt
    ? (Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60_000
    : NaN;
  const mins = Math.round(
    dev?.durationMin && dev.durationMin > 0
      ? dev.durationMin
      : Number.isFinite(elapsed) && elapsed > 0
        ? elapsed
        : sessionMinutes(s),
  );
  if (mins > 0) stats.push({ key: "duration", value: mins, device: !!dev?.durationMin });

  const vol = Math.round(sessionVolume(s.blocks));
  if (vol > 0) stats.push({ key: "volume", value: vol });

  let sets = 0;
  for (const b of s.blocks) if (isStrength(b)) sets += b.sets.length;
  if (sets > 0) stats.push({ key: "sets", value: sets });

  if (dev?.avgHr) stats.push({ key: "hr", value: dev.avgHr, device: true });
  else {
    const km = s.blocks.reduce((sum, b) => sum + (b.kind === "cardio" ? b.distance ?? 0 : 0), 0);
    if (km > 0) stats.push({ key: "distance", value: km, device: !!dev?.distanceKm });
  }
  return stats;
}

/** A completed-session card: top sets lead, stat row underneath. p2 — the
 *  bread of the feed, deliberately quiet so the moments can be loud. */
export function sessionDetail(session: LoggedSession): FeedDetail {
  return {
    moment: "p2",
    archetype: "sets",
    headlineKey: "feed.hl.session",
    headlineArg: session.title,
    stats: sessionStats(session),
    sets: topSetLines(session),
    device: !!session.device,
  };
}

/** A PR card. `firstEver` (a lift never trained before) is the beginner's
 *  record and gets the same p0 weight as a 200 kg squat — the warmest card in
 *  the system, and the one that keeps a beginner posting. */
export function prDetail(pr: {
  lift: string;
  topLoad: number;
  e1rm?: number;
  previousTopLoad?: number | null;
  previous?: number | null;
  count?: number;
}, opts: { tier?: AttestationTier; device?: boolean } = {}): FeedDetail {
  const firstEver = pr.previousTopLoad == null && pr.previous == null;
  // Percent over the athlete's OWN previous best on this lift — the only
  // comparison that means anything, and the reason a beginner's card can be as
  // loud as an elite's.
  const prev = pr.previousTopLoad ?? null;
  const deltaPct = prev != null && prev > 0 && pr.topLoad > prev ? ((pr.topLoad - prev) / prev) * 100 : undefined;
  return {
    moment: "p0",
    archetype: "stat",
    headlineKey: firstEver ? "feed.hl.first" : "feed.hl.pr",
    headlineArg: pr.lift,
    figureKg: pr.topLoad,
    e1rmKg: pr.e1rm && pr.e1rm > 0 ? Math.round(pr.e1rm) : undefined,
    tier: opts.tier ?? (opts.device ? 1 : 0),
    deltaPct,
    firstEver,
    device: opts.device,
    prCount: pr.count && pr.count > 1 ? pr.count : undefined,
  };
}

/** A typed post — text leads, nothing is dressed up as data. p2/p3. */
export function postDetail(kind: "status" | "pr" | "workout", data: Record<string, unknown>): FeedDetail {
  if (kind === "pr") {
    const topLoad = typeof data.topLoad === "number" ? data.topLoad : undefined;
    const e1rm = typeof data.e1rm === "number" ? data.e1rm : undefined;
    return {
      moment: "p1",
      archetype: "stat",
      headlineKey: "feed.hl.sharedPr",
      headlineArg: typeof data.lift === "string" ? data.lift : undefined,
      // A pre-#231 post only stored an e1RM; it renders as the estimate it is
      // rather than being passed off as a weight the athlete lifted.
      figureKg: topLoad,
      e1rmKg: topLoad == null ? e1rm : undefined,
      tier: 0,
    };
  }
  if (kind === "workout") {
    const vol = typeof data.volume === "number" ? Math.round(data.volume) : 0;
    return {
      moment: "p2",
      archetype: "sets",
      headlineKey: "feed.hl.sharedWorkout",
      headlineArg: typeof data.title === "string" ? data.title : undefined,
      stats: vol > 0 ? [{ key: "volume", value: vol }] : [],
      sets: [],
    };
  }
  return { moment: "p2", archetype: "text", headlineKey: "feed.hl.post" };
}
