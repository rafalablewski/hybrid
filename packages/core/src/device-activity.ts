// WHAT KIND OF TRAINING IS THIS — and can these two possibly be the same thing?
//
// Matching a logged session to a device recording used to be decided on the
// CLOCK alone: how close the two intervals sit, plus a nudge for a similar
// duration. That is blind to the one thing an athlete can see at a glance —
// you logged Cycling and the watch is offering you Tennis. Same hour, same
// length, and obviously not the same session. The picker put it on top anyway,
// and the unattended import would happily weld it onto the row.
//
// So this module answers one question for both halves of the device story:
// given what the session SAYS it was and what the recording SAYS it was, do
// they agree, contradict, or is there not enough to tell?
//
// THE ANSWER IS THREE-VALUED ON PURPOSE. A watch's label is often vaguer than
// the log ("Other", "Mixed Cardio") and a log's title is often free text
// ("Morning session"), so "I can't tell" has to be a real answer — and it is
// treated exactly like agreement, because refusing a match we merely failed to
// understand would be worse than the bug this fixes. Only a genuine
// CONTRADICTION — both sides named, and named different things — carries a
// consequence:
//
//   • the picker (rankDeviceWorkouts) demotes it and says why, but still shows
//     it, because the athlete may have started the wrong workout type on the
//     watch and knows perfectly well that the tennis recording IS their ride;
//   • the unattended import (device-import's `sameSession`) refuses it outright
//     — an auto-attach nobody watched is precisely where a wrong weld must not
//     happen, and the recording simply lands as its own session instead.
//
// Pure, and the ONE place either client decides what an activity IS.

import { cardioDiscipline, type CardioDiscipline, type LoggedSession } from "./engines/session";
import { olympicSport } from "./olympic-sports";

/**
 * HealthKit activity → the catalog sport it IS, keyed by the label squashed to
 * letters only ("Cross Country Skiing" → "crosscountryskiing"). Only entries
 * where the mapping is UNAMBIGUOUS are here: HealthKit's `hockey` covers both
 * ice and field, its `skatingSports` covers speed, short-track and figure, so
 * those keep the device's own wording rather than guess a sport wrong.
 *
 * A hit means the imported session is a first-class catalog sport — its icon,
 * its distance unit, its PR handling. A miss is not a failure: the recording's
 * own label becomes the title and `cardioDiscipline` classifies it from the
 * name, exactly as a typed-in "Treadmill" is classified today.
 */
const ACTIVITY_SPORT: Record<string, string> = {
  running: "Running",
  cycling: "Cycling",
  handcycling: "Cycling",
  swimming: "Swimming",
  swimbikerun: "Triathlon",
  openwaterswimming: "Open Water Swimming",
  rowing: "Rowing",
  waterpolo: "Water Polo",
  sailing: "Sailing",
  surfingsports: "Surfing",
  tennis: "Tennis",
  tabletennis: "Table Tennis",
  badminton: "Badminton",
  squash: "Squash",
  soccer: "Football",
  americanfootball: "Football",
  basketball: "Basketball",
  volleyball: "Volleyball",
  handball: "Handball",
  baseball: "Baseball",
  softball: "Softball",
  rugby: "Rugby Sevens",
  golf: "Golf",
  climbing: "Climbing",
  boxing: "Boxing",
  wrestling: "Wrestling",
  fencing: "Fencing",
  archery: "Archery",
  equestriansports: "Equestrian",
  gymnastics: "Artistic Gymnastics",
  crosscountryskiing: "Cross-Country Skiing",
  downhillskiing: "Alpine Skiing",
  snowboarding: "Snowboarding",
  curling: "Curling",
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The catalog sport a device recording is, or null when the catalog has no
 * unambiguous answer. Checks the explicit map first, then the catalog itself —
 * so a label that already reads as a sport name ("Judo", "Diving") resolves
 * without needing a row here.
 */
export function sportForDeviceActivity(activityLabel: string): string | null {
  const label = (activityLabel || "").trim();
  if (!label) return null;
  const mapped = ACTIVITY_SPORT[squash(label)];
  if (mapped) return mapped;
  return olympicSport(label) ? label : null;
}

/**
 * Names that mean RESISTANCE TRAINING on either side of the comparison — the
 * watch's own wording ("Traditional Strength Training", "Functional Strength
 * Training") and the way people title a gym session. Not a catalog sport and
 * not a cardio modality, so it needs its own axis; without it a lifting session
 * and a tennis recording would both read as "not endurance" and compare equal.
 */
const STRENGTH_RE = /\b(strength|weight ?lift|lifting|powerlift|bodybuild|resistance|gym)\b/i;

/** What one NAME says the training is, on the three axes we can compare. */
export interface ActivityIdentity {
  /** The catalog sport, when the name IS one — the most specific axis. */
  sport: string | null;
  /** Coarse modality: an endurance mode, `"sport"` (a timed catalog sport), or
   *  `"other"` when the name tells us nothing. */
  mode: CardioDiscipline;
  /** Resistance training. */
  strength: boolean;
}

/**
 * Read one activity name. `discipline` is the block's STAMPED modality where a
 * session has one — always preferred over re-deriving it from the name, per
 * `CardioBlock.discipline`.
 */
export function activityIdentity(name: string, discipline?: CardioDiscipline): ActivityIdentity {
  const label = (name || "").trim();
  const sport = sportForDeviceActivity(label);
  return {
    sport,
    mode: discipline ?? cardioDiscipline(sport ?? label),
    strength: STRENGTH_RE.test(label),
  };
}

/** The coarsest thing an identity commits to, or null when it commits to
 *  nothing. `"sport"` counts: a timed catalog sport is a real claim. */
const coarse = (i: ActivityIdentity): string | null =>
  i.strength ? "strength" : i.mode === "other" ? null : i.mode;

/** True when an identity says ANYTHING we can compare. */
const named = (i: ActivityIdentity): boolean => i.sport != null || coarse(i) != null;

/**
 * Are these two the same kind of training? `null` means "not enough named on
 * one side to say" — never treat it as a no.
 *
 * Compared on the most specific axis BOTH sides have. Two catalog sports settle
 * it outright (Tennis is not Table Tennis, even though both are timed sports);
 * otherwise the coarse modality decides, which is what lets a session logged as
 * "Bike intervals" recognise a recording labelled "Cycling".
 */
export function sameActivity(a: ActivityIdentity, b: ActivityIdentity): boolean | null {
  if (!named(a) || !named(b)) return null;
  if (a.sport && b.sport) return a.sport === b.sport;
  const ca = coarse(a);
  const cb = coarse(b);
  if (ca && cb) return ca === cb;
  return false;
}

/**
 * Everything a logged session claims to be: its title plus each block's own
 * name (cardio and conditioning by name + stamped discipline, strength as
 * itself). A hybrid session genuinely IS several things, so the recording only
 * has to agree with ONE of them.
 *
 * Deduped, and names that say nothing ("Morning session") drop out — an empty
 * result is the honest "we don't know what this session was".
 */
export function sessionActivities(session: Pick<LoggedSession, "title" | "blocks">): ActivityIdentity[] {
  const out: ActivityIdentity[] = [];
  const seen = new Set<string>();
  const add = (i: ActivityIdentity) => {
    if (!named(i)) return;
    const key = `${i.sport ?? ""}|${coarse(i) ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(i);
  };
  add(activityIdentity(session.title ?? ""));
  for (const b of session.blocks ?? []) {
    if (b.kind === "strength") add({ sport: null, mode: "other", strength: true });
    else add(activityIdentity(b.name, b.kind === "cardio" ? b.discipline : undefined));
  }
  return out;
}

/** The three-valued answer. `"unknown"` must be treated as permission. */
export type DeviceActivityVerdict = "same" | "different" | "unknown";

/**
 * Could this recording be this session? The verdict both the picker's ranking
 * and the unattended attach are built on — one rule, so the sheet can never
 * recommend a pairing the importer would refuse, or the other way round.
 */
export function deviceActivityVerdict(
  session: Pick<LoggedSession, "title" | "blocks">,
  workout: { activityLabel?: string | null },
): DeviceActivityVerdict {
  const w = activityIdentity(workout.activityLabel ?? "");
  if (!named(w)) return "unknown";
  const mine = sessionActivities(session);
  if (mine.length === 0) return "unknown";
  let sawUnknown = false;
  for (const i of mine) {
    const verdict = sameActivity(i, w);
    if (verdict === true) return "same";
    if (verdict == null) sawUnknown = true;
  }
  return sawUnknown ? "unknown" : "different";
}
