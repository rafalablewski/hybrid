/**
 * SESSION FACTS — one row per performed effort, so a set is a ROW and not a
 * needle in a JSON document.
 *
 * `Session.blocks` is a Json column holding the whole workout as one nested
 * document. That is the right shape for the thing the athlete edits — a session
 * is written and read as a unit, the logger round-trips it, and the block shape
 * is free to grow without a migration. It is the WRONG shape for every question
 * asked ACROSS sessions or across athletes: "how many working sets of Back Squat
 * were logged at RPE 9+ last month", "median rest between top sets", "which
 * movement pattern is under-trained in this cohort" all had to load whole
 * sessions into a lambda and walk them in TypeScript, bounded by a `take:` cap
 * that silently truncates the answer. There is no index that can help, because
 * there is nothing to index: the set does not exist as a value the database can
 * see.
 *
 * This module is the projection that fixes that. It reads a session and returns
 * the FACTS inside it — one per strength set, one per timed effort — flat, typed
 * and fully denormalised (athlete, date, exercise, movement, muscles all on the
 * row), which is exactly the grain a `SessionSet` table wants. The document
 * stays the source of truth; the fact rows are a derived, disposable projection
 * that can be rebuilt from it at any time. Nothing reads facts to render a
 * workout; facts exist to be aggregated.
 *
 * THREE RULES, and they are the reason this lives in core rather than in the API:
 *
 *  1. THE DEVICE'S RECORDING WINS. The projection runs `deviceTrueSession`
 *     first, so a matched effort's duration/distance/climb/power are the ones
 *     the watch measured — never the typed ones — and `measured` marks the row
 *     so an analytic can weight or filter on provenance. A warehouse fed the
 *     typed numbers would disagree with every screen in the app.
 *
 *  2. DERIVED FIGURES ARE COMPUTED ONCE, HERE. Effective load (bodyweight-aware),
 *     tonnage (× implements), e1RM and pace are the same functions the engines
 *     use, so an aggregate over the fact table and a figure on a screen can
 *     never drift. Recomputing them in SQL would be a second implementation of
 *     the same rules, which is how two numbers for one lift happen.
 *
 *  3. THE ROW REMEMBERS WHAT IT ASSUMED. Bodyweight-dependent lifts (pull-ups,
 *     dips, assisted work) resolve against the athlete's weight AT THAT DATE, so
 *     the row carries `bodyweightKg` — the value used, not the value today. A
 *     later weigh-in makes old rows stale rather than wrong, and a reprojection
 *     fixes them; without the column nobody could tell which rows needed it.
 *
 * Pure. No IO, no Prisma, no clock.
 */
import { bwAt, type BodyweightInput } from "./bodyweight";
import { deviceTrueSession } from "./device-truth";
import { gymExercise, loadUnitCount } from "./exercise-db";
import { movementFor } from "./engines/movements";
import {
  cardioSeconds,
  e1rm,
  effectiveSetLoadKg,
  isWorkingSet,
  setType,
  type CardioBlock,
  type ConditioningBlock,
  type LoggedSession,
  type SessionBlock,
  type SetRole,
  type StrengthBlock,
} from "./engines/session";

/** What KIND of effort a fact row is — the block kind it came from. */
export type SetFactKind = "strength" | "cardio" | "conditioning";

/**
 * ONE performed effort, flattened.
 *
 * The grain is deliberately mixed-but-uniform: a strength block contributes one
 * row PER SET (that is the whole point — the set becomes addressable), while a
 * cardio or conditioning block contributes exactly ONE row, because a continuous
 * effort has no sets to split. `setIndex` is 0 for those, so
 * (blockIndex, setIndex) is a stable key across every kind.
 *
 * Every field is nullable except the identity ones: a fact row must survive a
 * half-logged workout — a set with reps and no load, a run with a distance and
 * no time — because those are real rows an athlete produced and dropping them
 * would quietly bias every aggregate toward the well-logged.
 */
export interface SetFact {
  /** Position of the block within the session, 0-based. */
  blockIndex: number;
  /** Position of the set within the block, 0-based (always 0 for timed blocks). */
  setIndex: number;
  kind: SetFactKind;
  /** The exercise/activity name AS STORED on the block (already canonicalised
   *  by `migrateBlocks` on read, so a renamed lift aggregates under one name). */
  exercise: string;
  /** The engine movement pattern ("hinge", "push-v"…) — null for an unknown
   *  name or a timed effort. The column that makes "under-trained pattern"
   *  a `GROUP BY`, not a walk over every session. */
  movement: string | null;
  /** Engine muscle groups the effort attributes to (0–3). Empty for cardio. */
  muscles: string[];
  /** Coarse cardio modality ("running", "swimming"…) — null for strength. */
  discipline: string | null;

  // ---- strength ---------------------------------------------------------
  /** Warm-up / working / cool-down. Absent on the set means "working". */
  role: SetRole;
  /** Performed straight off the previous set with reduced load. */
  drop: boolean;
  reps: number | null;
  /** The load AS ENTERED, kg — what the athlete typed, before bodyweight. */
  loadKg: number | null;
  /** The athlete's bodyweight used to resolve this row (kg), when it mattered
   *  and was known. Null for external-load lifts and for unknown weights. */
  bodyweightKg: number | null;
  /** The load actually moved per rep, kg: entered for external lifts,
   *  BW / BW+added / BW−assist for the bodyweight modes. */
  effectiveLoadKg: number | null;
  /** effectiveLoad × reps × implements — the row's contribution to tonnage.
   *  Null (not 0) when the set has nothing to weigh: a timed hold, a rep count
   *  with no load. Zero would average in as a real light set. */
  volumeKg: number | null;
  /** Epley estimate from this set alone, kg. Null for holds/carries. */
  e1rmKg: number | null;
  rpe: number | null;
  /** Mean concentric velocity, m/s (VBT). */
  velocityMs: number | null;
  peakVelocityMs: number | null;
  romCm: number | null;
  /** Rest taken BEFORE this set, seconds — measured by the live logger. */
  restSec: number | null;

  // ---- timed efforts ----------------------------------------------------
  distanceKm: number | null;
  /** Moving time, seconds — second-accurate where a recording supplied it. */
  durationSec: number | null;
  /** Seconds per kilometre, from the exact distance and the exact clock. */
  paceSecPerKm: number | null;
  elevationM: number | null;
  watts: number | null;
  zone: number | null;
  /** Conditioning rounds completed. */
  rounds: number | null;

  /** True when the figures on this row came from a matched device recording
   *  rather than from what the athlete typed. */
  measured: boolean;
}

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";
const isTimed = (b: SessionBlock): b is CardioBlock | ConditioningBlock =>
  b.kind === "cardio" || b.kind === "conditioning";

/** A finite number, or null. Accepts the block shapes' `string | number`. */
const fin = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

/** A finite POSITIVE number, or null — for the figures where 0 means "absent"
 *  (a distance of 0, a duration of 0) rather than a measured zero. */
const pos = (v: unknown): number | null => {
  const n = fin(v);
  return n != null && n > 0 ? n : null;
};

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Does this exercise measure its sets in REPS (as opposed to seconds held or
 * metres carried)? Tonnage and e1RM are meaningless for the others, and an
 * unknown name is assumed rep-counted — the same default the engines use.
 */
const isRepCounted = (name: string): boolean => (gymExercise(name)?.measure ?? "reps") === "reps";

/** Whether the lift's effective load depends on the athlete's bodyweight. */
const usesBodyweight = (name: string): boolean => {
  const mode = gymExercise(name)?.loadMode ?? "external";
  return mode === "bodyweight" || mode === "bodyweight-plus" || mode === "assisted";
};

function strengthFacts(
  b: StrengthBlock,
  blockIndex: number,
  bodyweightKg: number | null,
): SetFact[] {
  const movement = movementFor(b.name);
  const units = loadUnitCount(b.name);
  const repCounted = isRepCounted(b.name);
  const bwLift = usesBodyweight(b.name);
  const bw = bwLift ? bodyweightKg : null;

  return b.sets.map((s, setIndex) => {
    const reps = pos(s.reps);
    const entered = fin(s.load);
    // effectiveSetLoadKg reads the exercise's load MODE, so it is the only
    // correct way to turn "+10" on a weighted pull-up into 80 kg. With no
    // bodyweight on file it degrades exactly as the engines do — an added-weight
    // lift falls back to the plate alone and a pure bodyweight lift resolves to
    // nothing, which `pos` turns into a null volume rather than a zero one. A
    // set that weighed nothing must not average in as a light set.
    const effective = pos(effectiveSetLoadKg(b.name, s.load, bodyweightKg));
    const volume =
      repCounted && effective != null && reps != null ? round(effective * reps * units, 2) : null;
    return {
      blockIndex,
      setIndex,
      kind: "strength" as const,
      exercise: b.name,
      movement: movement?.pattern ?? null,
      muscles: movement?.muscles ? [...movement.muscles] : [],
      discipline: null,
      role: (setType(s) === "warmup" ? "warmup" : setType(s) === "cooldown" ? "cooldown" : "working") as SetRole,
      drop: s.drop === true,
      reps,
      loadKg: entered,
      bodyweightKg: bw,
      effectiveLoadKg: effective != null ? round(effective, 2) : null,
      volumeKg: volume,
      e1rmKg:
        repCounted && effective != null && reps != null ? round(e1rm(effective, reps), 2) : null,
      rpe: fin(s.rpe),
      velocityMs: pos(s.vel),
      peakVelocityMs: pos(s.peakVel),
      romCm: pos(s.rom),
      // The PLANNED rest is the block's; the MEASURED one is the set's. Only
      // the measured figure belongs on a fact row — a prescription is not an
      // observation, and averaging the two would report a rest nobody took.
      restSec: pos(s.rest),
      distanceKm: null,
      durationSec: null,
      paceSecPerKm: null,
      elevationM: null,
      watts: null,
      zone: null,
      rounds: null,
      measured: false,
    } satisfies SetFact;
  });
}

function timedFact(
  b: CardioBlock | ConditioningBlock,
  blockIndex: number,
  measured: boolean,
): SetFact {
  const cardio = b.kind === "cardio" ? b : null;
  const distanceKm = pos(cardio?.distance);
  // cardioSeconds prefers the second-accurate clock the device projection
  // writes, falling back to logged minutes — so a pace here matches the pace on
  // the summary rather than being recomputed from a rounded minute count.
  const durationSec = cardioSeconds(b);
  return {
    blockIndex,
    setIndex: 0,
    kind: b.kind,
    exercise: b.name,
    movement: null,
    muscles: [],
    discipline: cardio?.discipline ?? null,
    role: "working",
    drop: false,
    reps: null,
    loadKg: null,
    bodyweightKg: null,
    effectiveLoadKg: null,
    volumeKg: null,
    e1rmKg: null,
    rpe: fin(b.rpe),
    velocityMs: null,
    peakVelocityMs: null,
    romCm: null,
    restSec: null,
    distanceKm,
    durationSec: durationSec != null ? Math.round(durationSec) : null,
    paceSecPerKm:
      distanceKm != null && durationSec != null ? round(durationSec / distanceKm, 1) : null,
    elevationM: pos(cardio?.elevation),
    watts: pos(cardio?.watts),
    zone: pos(cardio?.zone),
    rounds: b.kind === "conditioning" ? pos(b.rounds) : null,
    measured,
  };
}

/**
 * Every fact in one session, in block-then-set order.
 *
 * `bw` accepts what the engines accept — a number (the current weight), a dated
 * lookup (the right answer for a history), or nothing. Pass a lookup when
 * projecting more than one session: each row must resolve at ITS OWN date, or a
 * year of pull-ups gets recorded at today's bodyweight.
 *
 * Blocks with no efforts at all (a strength block with zero sets — a plan the
 * athlete opened and never worked) produce no rows: a warehouse counts what
 * happened, and nothing happened.
 */
export function sessionSetFacts(session: LoggedSession, bw?: BodyweightInput): SetFact[] {
  // The measurement wins — project BEFORE reading any figure off a block.
  const trued = deviceTrueSession(session);
  // Which timed block (if any) the recording actually spoke for: the projection
  // only rewrites when the attribution is unambiguous (exactly one timed
  // block), so `measured` must follow the same rule rather than marking every
  // block of a matched session.
  const timedCount = trued.blocks.filter(isTimed).length;
  const measuredBlock = trued !== session && timedCount === 1 ? trued.blocks.findIndex(isTimed) : -1;
  const bodyweightKg = bwAt(bw, session.startedAt);

  const out: SetFact[] = [];
  trued.blocks.forEach((b, blockIndex) => {
    if (isStrength(b)) out.push(...strengthFacts(b, blockIndex, bodyweightKg));
    else if (isTimed(b)) out.push(timedFact(b, blockIndex, measuredBlock === blockIndex));
  });
  return out;
}

/** The same projection across a history — each session resolved at its own date
 *  when `bw` is a lookup. Rows carry no session id; the caller pairs them with
 *  the session it passed (the API writes them under `sessionId`). */
export function sessionSetFactsFor(
  sessions: LoggedSession[],
  bw?: BodyweightInput,
): { session: LoggedSession; facts: SetFact[] }[] {
  return sessions.map((session) => ({ session, facts: sessionSetFacts(session, bw) }));
}

/**
 * A one-line integrity check the API can assert before it writes: the number of
 * facts a session should produce. Exported so a reprojection can detect a
 * session whose stored rows no longer match its document (an edit that landed
 * while the projection was mid-flight) without re-reading every row's contents.
 */
export function sessionFactCount(session: LoggedSession): number {
  return session.blocks.reduce(
    (n, b) => n + (isStrength(b) ? b.sets.length : isTimed(b) ? 1 : 0),
    0,
  );
}

/** Working sets only — the rows that count as training volume. The one filter
 *  every aggregate needs, kept here so callers don't re-derive the rule. */
export const workingFacts = (facts: SetFact[]): SetFact[] =>
  facts.filter((f) => f.kind !== "strength" || isWorkingSet({ role: f.role }));
