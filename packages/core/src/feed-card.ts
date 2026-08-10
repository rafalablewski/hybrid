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
import { roundKm } from "./distance";
import {
  isAutoSessionTitle,
  paceClock,
  sessionMinutes,
  sessionVolume,
  workingSets,
  type LoggedSession,
  type PrHit,
  type StrengthBlock,
} from "./engines";
import { fmtWeight, type WeightUnit } from "./units";

// ------------------------------------------------------------- the model ----

/** Ranking/visual weight class. p0 interrupts, p3 seasons. */
export type FeedMoment = "p0" | "p1" | "p2" | "p3";

/** Which layout renders the card. Every card type is a preset over one of
 *  these — adding a type must never add a component. */
export type FeedArchetype = "stat" | "sets" | "text";

/** The figures a card's stat row can carry. The CARD shows the first few; the
 *  opened post shows the whole set (feed-workout.ts `feedWorkoutStats`). */
export type FeedStatKey = "duration" | "volume" | "sets" | "reps" | "hr" | "distance" | "pace" | "kcal";

export interface FeedStat {
  key: FeedStatKey;
  /** kg for volume, minutes for duration, km for distance, seconds-per-km for
   *  pace, raw count otherwise. */
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

/**
 * ONE RECORD, as it reads inside the workout that set it.
 *
 * A session that set three PRs used to emit three things: the workout card and
 * a separate PR card that named only the heaviest lift. The other two records
 * were a count ("3 PRs") and nothing else, and the stream carried the same
 * session twice. A workout is ONE post, and the records it set are lines
 * inside it — listed one after another, each with its own evidence.
 */
export interface FeedPrLine {
  lift: string;
  /** the weight actually lifted, kg — never the estimate (#231). */
  topLoadKg: number;
  /** the estimate behind it, kg — the honest second number, when there is one. */
  e1rmKg?: number;
  /** the athlete's own previous best on this lift, kg; absent on a first-ever. */
  previousTopLoadKg?: number;
  /** improvement over that previous best, percent. */
  deltaPct?: number;
  /** this lift had never been trained before — the beginner's record. */
  firstEver: boolean;
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
  /** the records this workout set, heaviest first — listed one after another
   *  ON the workout card, never posted as cards of their own. */
  prs?: FeedPrLine[];
}

// ------------------------------------------------------------ formatting ----

/** i18n key for a stat's label. Clients translate; core never ships English. */
export const FEED_STAT_LABEL_KEY: Record<FeedStatKey, string> = {
  duration: "feed.stat.min",
  volume: "feed.stat.volume",
  sets: "feed.stat.sets",
  reps: "feed.stat.reps",
  hr: "feed.stat.hr",
  distance: "feed.stat.distance",
  pace: "feed.stat.pace",
  kcal: "feed.stat.kcal",
};

/**
 * The VALUE of a stat, formatted for display (no label, no unit suffix — the
 * label carries the unit so the number stays a number).
 *
 * `locale` IS NOT OPTIONAL IN SPIRIT, only in signature. Left out, these calls
 * resolve grouping against the DEVICE rather than against the app: 5360 kg
 * renders "5.360" on a German or Polish handset while the interface is in
 * English, and an English reader parses that as five point three six. The
 * failure is invisible to anyone testing on an English device, which is exactly
 * how it shipped. Every caller passes the ACTIVE LANGUAGE — both clients hold
 * it on `useLang()` — and the parameter stays optional only so a pure caller
 * with no language in hand (a test, a server-side aggregate) still compiles.
 */
export function feedStatText(stat: FeedStat, units: WeightUnit, locale?: string): string {
  switch (stat.key) {
    case "volume": {
      // Tonnage in the athlete's unit, grouped so 12 400 stays readable.
      const v = units === "lb" ? stat.value / 0.45359237 : stat.value;
      return Math.round(v).toLocaleString(locale);
    }
    case "distance":
      return roundKm(stat.value).toLocaleString(locale);
    case "pace":
      // A pace is a CLOCK, not a count — "5:42", with the label carrying /km.
      return paceClock(stat.value);
    default:
      return Math.round(stat.value).toLocaleString(locale);
  }
}

/**
 * A stat as it reads in the card's FOOTER LINE — the figure and the unit that
 * belongs to it, kept as two pieces so the client can set the unit quieter than
 * the number without re-parsing a joined string.
 *
 * The card's stat row used to be three equal columns, each stacking a value
 * over an uppercase label: a data TABLE, competing for attention with the
 * content above it and giving tonnage no unit at all. As one line it is a
 * footer, which is what a session's aggregates are.
 *
 * Every stat's label already reads as a unit ("min", "sets", "km", "min/km",
 * "avg bpm") — every stat but VOLUME, whose unit is the athlete's own weight
 * preference and so a literal rather than a word to translate.
 */
export interface FeedStatParts {
  value: string;
  /** i18n key for the unit. Absent on volume, which carries `unit` instead. */
  unitKey?: string;
  /** a literal unit that must not be translated (kg / lb). */
  unit?: string;
  /** the DEVICE measured it — the client draws the watch signature. */
  device: boolean;
}

export function feedStatParts(stat: FeedStat, units: WeightUnit, locale?: string): FeedStatParts {
  return {
    value: feedStatText(stat, units, locale),
    ...(stat.key === "volume" ? { unit: units } : { unitKey: FEED_STAT_LABEL_KEY[stat.key] }),
    device: !!stat.device,
  };
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

/**
 * The card's headline, composed — core names the lift, the client speaks the
 * language. A session/workout headline IS its own title (the athlete named it,
 * or `defaultSessionTitle` did); everything else is a key with the one thing it
 * names substituted in.
 *
 * It lives here because four surfaces render it — the row and the post, on two
 * clients — and four copies of one ternary is how a record comes to read one
 * way in the stream and another when you open it.
 */
export function feedHeadlineText(
  it: { lead?: string | null; title?: string; detail?: FeedDetail },
  t: (key: string) => string,
): string {
  const d = it.detail;
  if (!d) return it.lead || it.title || "";
  if (d.headlineKey === "feed.hl.session" || d.headlineKey === "feed.hl.sharedWorkout") return d.headlineArg || t(d.headlineKey);
  return d.headlineArg ? t(d.headlineKey).replace("{lift}", d.headlineArg) : t(d.headlineKey);
}

/** Signed percent, for the delta line ("+4.2%"). */
export function feedDeltaText(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return `${r > 0 ? "+" : ""}${r}%`;
}

/**
 * WHAT QUALIFIES A FIGURE — and there is only ever ONE of them.
 *
 * `deltaPct` and `firstEver` are mutually exclusive by construction: a lift
 * trained for the first time has no previous best to improve on, so `prLines`
 * can never emit both. They were nevertheless drawn in two separate slots on a
 * line that already carried six type treatments on one baseline — a bold lift
 * name, a mono-bold figure, a mono-ash unit, a mono-accent delta, the LOWERCASE
 * SENTENCE "first time trained" doing a badge's job, and a tier chip flung to
 * the far edge.
 *
 * One slot, two possible contents, and the distinction carried by colour alone:
 *   • a delta wears the card's ACCENT — an improvement is the thing worth
 *     seeing across a room, and it is the only accent the card spends;
 *   • a first-ever is ASH, and short. It is context, not a score.
 *
 * The delta wins if both somehow arrive (an older payload, a hand-built
 * detail): the stronger claim is the one measured against a real previous best.
 */
export type CardQualifier =
  | { kind: "delta"; text: string }
  | { kind: "first"; labelKey: "feed.firstShort" };

export function cardQualifier(of: { deltaPct?: number; firstEver?: boolean }): CardQualifier | null {
  if (of.deltaPct != null) return { kind: "delta", text: feedDeltaText(of.deltaPct) };
  if (of.firstEver) return { kind: "first", labelKey: "feed.firstShort" };
  return null;
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

/**
 * The records a session set, as post lines — heaviest first, the order
 * `newPrsInSession` already returns them in.
 *
 * The percent is over the athlete's OWN previous best on that lift, which is
 * the only comparison that means anything here: it is what lets a beginner's
 * +10 kg read as loud as an elite's +2.5 kg.
 */
export function prLines(prs: PrHit[]): FeedPrLine[] {
  return prs.map((p) => {
    const firstEver = p.previousTopLoad == null && p.previous == null;
    const prev = p.previousTopLoad ?? null;
    return {
      lift: p.lift,
      topLoadKg: p.topLoad,
      ...(p.e1rm > 0 ? { e1rmKg: Math.round(p.e1rm) } : {}),
      ...(prev != null ? { previousTopLoadKg: prev } : {}),
      ...(prev != null && prev > 0 && p.topLoad > prev
        ? { deltaPct: ((p.topLoad - prev) / prev) * 100 }
        : {}),
      firstEver,
    };
  });
}

/**
 * A completed-session card: top sets lead, stat row underneath — and the
 * records it set, listed on the same post.
 *
 * MOMENT. A plain session is p2, the bread of the feed, deliberately quiet so
 * the moments can be loud. A session that set a record IS the moment: it takes
 * p0, exactly as the separate PR card used to, so folding the two together
 * costs a record none of its weight in the ranker (feed-rank.ts).
 *
 * TIER is earned, not claimed: a matched device recording corroborates the
 * session the lifts were set in (attestation.ts). Tier 2 needs a witness and is
 * resolved server-side per viewer.
 */
export function sessionDetail(session: LoggedSession, prs: PrHit[] = []): FeedDetail {
  const lines = prLines(prs);
  return {
    moment: lines.length ? "p0" : "p2",
    archetype: "sets",
    headlineKey: "feed.hl.session",
    headlineArg: session.title,
    stats: sessionStats(session),
    sets: topSetLines(session),
    device: !!session.device,
    ...(lines.length
      ? {
          prs: lines,
          prCount: lines.length,
          tier: session.device ? 1 : 0,
          // The loudest line's own numbers drive the ranker's rarity terms —
          // a first-ever, and how far past the athlete's own best they went.
          firstEver: lines.some((l) => l.firstEver),
          deltaPct: lines.reduce<number | undefined>((max, l) => (l.deltaPct != null && (max == null || l.deltaPct > max) ? l.deltaPct : max), undefined),
        }
      : {}),
  };
}

/**
 * How many records a CARD names in total, counting the one promoted to the hero
 * figure. The post lists all of them; a row that listed six would stop being a
 * row.
 */
export const FEED_CARD_PR_LINES = 2;

/**
 * THE CARD'S ONE BIG NUMBER, and where it comes from.
 *
 * The hero figure — the 44/46px number with its unit and its provenance — used
 * to be reachable only by `archetype: "stat"`, which is a SHARED post. A
 * session, which is the archetype that actually sets records, is always
 * `"sets"`, so the two conditions could never both be true and a p0 session
 * drew its record at the same size as its accessory work. "Moment drives
 * weight" was documented in three files and inert in all of them.
 *
 * So the decision moves here, where both renderers read it:
 *   • a stat post leads with its own figure, and its HEADLINE already names the
 *     lift — so the label is null and nothing is said twice;
 *   • a session that set records leads with the LOUDEST one, labelled with the
 *     lift, because the record is why the post exists;
 *   • everything else has no hero at all, which is what makes a p2 Tuesday
 *     read as quieter than the record beside it.
 */
export interface CardLead {
  /** the lift the figure belongs to, when the headline isn't already naming it
   *  — drawn as a small mono label above the number. null for a stat post. */
  label: string | null;
  /** the hero number, kg. Absent on a legacy post that only stored an e1RM. */
  figureKg?: number;
  e1rmKg?: number;
  deltaPct?: number;
  firstEver: boolean;
  tier?: AttestationTier;
}

export function cardLead(d: FeedDetail | undefined): CardLead | null {
  if (!d) return null;
  if (d.archetype === "stat") {
    // Unchanged behaviour — the shared-PR post already had this treatment.
    if (d.figureKg == null && d.e1rmKg == null) return null;
    return {
      label: null,
      figureKg: d.figureKg,
      e1rmKg: d.e1rmKg,
      deltaPct: d.deltaPct,
      firstEver: !!d.firstEver,
      tier: d.tier,
    };
  }
  // A session earns the hero only at p0 — which `sessionDetail` grants exactly
  // when the session set a record. No record, no big number.
  const top = d.moment === "p0" ? d.prs?.[0] : undefined;
  if (!top) return null;
  return {
    label: top.lift,
    figureKg: top.topLoadKg,
    e1rmKg: top.e1rmKg,
    deltaPct: top.deltaPct,
    firstEver: top.firstEver,
    // Provenance belongs to the CLAIM, and the claim is now the hero.
    tier: d.tier,
  };
}

/**
 * How a card's records divide between the hero and the lines under it.
 *
 * The record promoted to `lead` must not also draw a line of its own — that
 * would be the same lift twice in one card, which is the exact noise
 * `cardSetLines` was written to prevent one rung further down.
 */
export interface CardRecords {
  /** the record that took the hero figure, or null when nothing did. */
  lead: FeedPrLine | null;
  /** the records drawn as their own quiet lines beneath it. */
  lines: FeedPrLine[];
  /** lead + lines — every record the card NAMES, for `cardSetLines`. */
  shown: FeedPrLine[];
  /** records the card doesn't draw at all; the count line opens the post. */
  rest: number;
}

export function cardRecords(d: FeedDetail | undefined): CardRecords {
  const prs = d?.prs ?? [];
  const lead = cardLead(d)?.label ? prs[0] ?? null : null;
  const lines = prs.slice(lead ? 1 : 0, FEED_CARD_PR_LINES);
  const shown = lead ? [lead, ...lines] : lines;
  return { lead, lines, shown, rest: Math.max(0, prs.length - shown.length) };
}

/**
 * The top-set lines still worth drawing BESIDE those records.
 *
 * A lift that already has a record line has said its numbers there — drawing
 * "Back Squat 160 kg +6%" and then "Back Squat 3 × 5 — 160 kg" two rows down is
 * the same lift twice in one card. Both clients filter through this, so neither
 * can decide differently.
 */
export function cardSetLines(sets: FeedSetLine[] | undefined, shownPrs: FeedPrLine[]): FeedSetLine[] {
  if (!sets?.length || !shownPrs.length) return sets ?? [];
  const named = new Set(shownPrs.map((p) => p.lift));
  return sets.filter((l) => !named.has(l.name));
}

/**
 * DOES THIS CARD'S HEADLINE EARN THE LOUDEST LINE ON IT?
 *
 * A headline that is the same on every post is not a headline. A session with
 * no name of its own is titled by the CLOCK (`defaultSessionTitle`), so a feed
 * of twenty workouts was a column of "Afternoon workout" set in the display
 * face — the largest type on each card, carrying the one fact the timestamp
 * beside the athlete's name had already given.
 *
 * The rule, and both clients read it from here so neither can soften it:
 *   • a session/workout title leads only when the ATHLETE chose it;
 *   • a record headline always leads — it names the lift;
 *   • "Posted" over a status update never leads: the words are the post;
 *   • an auto title leads anyway when the card would otherwise be anonymous —
 *     no hero and no top sets (a bare cardio session) — because a generic name
 *     still beats a row of numbers with nothing to hold them.
 *
 * This gates ZONE B only. `feedHeadlineText` is unchanged and still composes
 * the string, which the share payload and the opened POST both need: a page may
 * name itself, and what you share must read like what you tapped.
 */
export function feedHeadlineEarnsLead(it: { detail?: FeedDetail }): boolean {
  const d = it.detail;
  if (!d) return true; // legacy shape — there is nothing else to lead with
  switch (d.headlineKey) {
    case "feed.hl.session":
    case "feed.hl.sharedWorkout":
      if (!isAutoSessionTitle(d.headlineArg)) return true;
      return !cardLead(d) && !d.sets?.length;
    case "feed.hl.post":
      return false;
    default:
      return true;
  }
}

/*
 * THERE IS NO `prDetail` ANY MORE. A record the athlete SET is not a card — it
 * is a line on the workout that set it (see `sessionDetail` above). The only
 * PR-shaped card left is a PR the athlete deliberately SHARED as a post, which
 * `postDetail("pr", …)` builds from the stored row.
 */

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
