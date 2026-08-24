/**
 * THE WEEK IN ITS TWO HALVES — the gym, and everything you went out and did.
 *
 * HYBRID is a HYBRID-ATHLETE app: the whole premise is that one person lifts
 * and runs, and that the two halves of that are worth reading together. The
 * week report did not read that way. It picked ONE figure for the whole week on
 * a priority that starts at tonnage, so a week of four sessions with a squat
 * PR and an 8 km run opened with "9.0 t" and mentioned the running in a ledger
 * row underneath, in the same voice as the set count. A lifter with a bike
 * would have been told their week was about the barbell every time.
 *
 * So the week is stated ONCE as a whole (the sessions, the days, the clock —
 * time is the one measure both halves carry) and then SPLIT, each half leading
 * with its own native figure: the gym with what it moved, endurance and sport
 * with the ground they covered.
 *
 * THE SPLIT IS A PARTITION, and that is the property worth having:
 *
 *   gym.minutes + endurance.minutes === the window's own minutes
 *
 * Nothing falls between the two sections and nothing is counted in both, so an
 * athlete can add the halves up and get the top of the screen back. It holds
 * because the two sides own COMPLEMENTARY group kinds — `enduranceWindow` takes
 * `endurance` and `sport` (that is its definition, and Today's Endurance
 * section is the same slice), and this takes literally the rest. A new group
 * kind therefore lands in the gym half by default, which is the safe direction:
 * it shows up somewhere rather than vanishing, and the partition test fails
 * only if someone makes the two sides overlap.
 *
 * EFFORTS ARE THE ONE FIGURE THAT DOES NOT PARTITION, deliberately. A brick
 * session — squats then a run on one entry — is one session that carried both
 * kinds of work, so it counts as an effort on BOTH sides and the two effort
 * counts can sum past the week's session count. Sessions are the unit of "how
 * often did you go", and it went once; each half is answering "how often did
 * you do THIS", and it did both.
 *
 * Like `endurance-window.ts`, this computes nothing of its own: it reads the
 * exact `activitySummary` the verdict card renders, over the exact range the
 * screen resolved. A slice, never a second opinion. Canonical units throughout
 * — minutes for time, kg for tonnage — formatted by the client.
 */
import {
  activitySummary,
  activityBaselineWindows,
  type ActivityGroupKind,
  type ActivityRange,
} from "./activity-window";
import { enduranceWindow, type EnduranceWindow } from "./endurance-window";
import type { BodyweightInput } from "./bodyweight";
import { deviceTrueSessions } from "./device-truth";
import type { LoggedSession } from "./engines/session";

/** What the OTHER half owns. Everything else is the gym's — see the partition
 *  note above for why the default direction is this way round. */
const OUTDOORS: ReadonlySet<ActivityGroupKind> = new Set<ActivityGroupKind>(["endurance", "sport"]);

export interface GymTotals {
  /** Distinct sessions in the window carrying any gym work. Counts a brick
   *  session that also went for a run — see the note above. */
  efforts: number;
  minutes: number;
  /** kg. */
  tonnage: number;
  /**
   * STRENGTH sets, and only those.
   *
   * `WeeklyRecap.sets` counts a cardio block as one set — which is right for a
   * whole-week figure that has to give every block a grain, and WRONG the
   * moment it is printed under a heading that says GYM. A week of two squat
   * sets, a run and a tennis match reported "4 sets" in the gym half, two of
   * them things nobody did a set of.
   */
  sets: number;
  /** Distinct lifts trained. */
  lifts: number;
}

export interface GymWindow {
  range: ActivityRange;
  totals: GymTotals;
  /** THE AXIS — the window immediately before this one, the same comparison
   *  the verdict card and the endurance section make. One screen, one answer
   *  about what "before" means. */
  previous: GymTotals;
}

const ZERO: GymTotals = { efforts: 0, minutes: 0, tonnage: 0, sets: 0, lifts: 0 };

function gymSlice(sessions: LoggedSession[], range: ActivityRange, bw: BodyweightInput | undefined): GymTotals {
  const sum = activitySummary(sessions, range, bw);
  const mine = (kind: ActivityGroupKind) => !OUTDOORS.has(kind);
  const hours = sum.details.hours.groups.filter((g) => mine(g.kind));
  const tonnage = sum.details.tonnage.groups.filter((g) => mine(g.kind));

  const ids = new Set<string>();
  for (const g of [...hours, ...tonnage]) for (const it of g.items) ids.add(it.sessionId);

  // SETS AND LIFTS have no summary to slice — `ActivityTotals` does not carry
  // them, because they are not measures every kind of training has. They are
  // counted here from the strength blocks of the sessions the slice already
  // named, which keeps them a fact about the same window rather than a second
  // opinion about a different one.
  const grain = { sets: 0, lifts: new Set<string>() };
  for (const s of deviceTrueSessions(sessions)) {
    const t = new Date(s.startedAt).getTime();
    if (!Number.isFinite(t) || t < range.from || t >= range.through || !ids.has(s.id)) continue;
    for (const b of s.blocks) {
      if (b.kind !== "strength") continue;
      grain.sets += b.sets.length;
      grain.lifts.add(b.name);
    }
  }

  return {
    efforts: ids.size,
    minutes: hours.reduce((n, g) => n + g.value, 0),
    tonnage: tonnage.reduce((n, g) => n + g.value, 0),
    sets: grain.sets,
    lifts: grain.lifts.size,
  };
}

/** The gym read for a period, with the window before it as its axis. */
export function gymWindow(sessions: LoggedSession[], range: ActivityRange, bw?: BodyweightInput): GymWindow {
  const totals = gymSlice(sessions, range, bw);
  // Nearest first, so priors[0] is the period the athlete is actually asking
  // about — the same convention activityVerdict and enduranceWindow use.
  const prior = activityBaselineWindows(range)
    .slice(0, 1)
    .map((w) => gymSlice(sessions, { ...range, from: w.from, to: w.to, through: w.to }, bw))[0];
  return { range, totals, previous: prior ?? ZERO };
}

export interface WeekSplit {
  range: ActivityRange;
  gym: GymWindow;
  endurance: EnduranceWindow;
}

/**
 * Both halves of one window, from one call — so a screen cannot accidentally
 * read them over two different ranges, which is the only way the partition
 * above could come apart at a call site.
 */
export function weekSplit(sessions: LoggedSession[], range: ActivityRange, bw?: BodyweightInput): WeekSplit {
  return { range, gym: gymWindow(sessions, range, bw), endurance: enduranceWindow(sessions, range, bw) };
}
