// Device IMPORT — the workouts your watch already recorded, brought into the
// log without typing them.
//
// session-device.ts is the other half of this story: you logged a session in
// HYBRID and you attach the watch's read of it afterwards. This module is the
// direction the athlete actually asked for — the training STARTS on the wrist
// (Apple Watch, and the same shape later for Garmin/WHOOP), and the app pulls
// the recording in with every value it carries. Nothing to type at all.
//
// The one hard problem is DOUBLE-COUNTING: an athlete who quick-logged "Tennis,
// 60 min" and also wore the watch must not end up with two tennis sessions. So
// an import is never a blind create — every device workout is first PLANNED
// against what is already in the log:
//
//   linked  — a session already carries this recording (uuid match) → nothing.
//   attach  — a session the athlete logged IS this workout → the recording goes
//             onto that row (Session.device), exactly as the match sheet would.
//   create  — nothing in the log is this workout → a new session, built from
//             the recording, with the recording attached so the MEASUREMENT
//             WINS everywhere downstream (see session-device.ts).
//
// The plan is pure and shared: the server runs it on import (so a replayed or
// concurrent sync is idempotent) and both clients run it to SHOW what an import
// will do before the athlete taps. Same function, same answer.

import { doneReceipt } from "./done-receipt";
import type { LoggedSession, SessionBlock } from "./engines/session";
import { cardioDiscipline } from "./engines/session";
import { kmValue } from "./distance";
import { displaySportDistance, olympicSport, sportDistanceUnit } from "./olympic-sports";
import type { DeviceWorkout } from "./session-device";

/** How far back an import reads the device store, days. Two weeks covers a
 *  holiday away from the phone without re-planning a year of history. */
export const DEVICE_IMPORT_DAYS = 14;

/** Recordings shorter than this are not sessions — they are the watch noticing
 *  you walked to the car. Filtered before anything else so neither the picker
 *  nor an auto-import ever offers them. */
export const DEVICE_IMPORT_MIN_MIN = 5;

/** How far a POINT-logged session (startedAt == completedAt — quick-logged after
 *  the fact) may sit from a recording and still be considered the same session,
 *  hours. Deliberately much tighter than DEVICE_MATCH_WINDOW_H: that window is
 *  for a human picking from a ranked list, this one decides unattended. */
export const DEVICE_IMPORT_ATTACH_H = 3;

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

/** What the imported session is CALLED: the catalog sport when the recording is
 *  one, else the device's own label ("Functional Strength Training"). */
export function deviceWorkoutTitle(w: DeviceWorkout): string {
  return sportForDeviceActivity(w.activityLabel) || w.activityLabel.trim() || "Workout";
}


/**
 * The session body an imported recording becomes: ONE cardio block carrying
 * every figure the device measured that the block shape can hold. The rest of
 * the recording (heart rate, calories, steps, METs, climb…) is not duplicated
 * here — it rides on Session.device, which outranks the block anyway.
 */
export function deviceWorkoutBlocks(w: DeviceWorkout): SessionBlock[] {
  const name = deviceWorkoutTitle(w);
  return [
    {
      kind: "cardio",
      name,
      discipline: cardioDiscipline(name),
      minutes: w.durationMin,
      ...(w.distanceKm != null ? { distance: w.distanceKm } : {}),
      ...(w.elevationM != null ? { elevation: w.elevationM } : {}),
    },
  ];
}

/**
 * Is this session's "logged" side just an ECHO of its own recording?
 *
 * True for a session the import CREATED: its one cardio block was written from
 * the device workout (`deviceWorkoutBlocks`), so the athlete never typed a
 * figure — the block's minutes/distance/elevation ARE the recording's, rounded.
 * The summary's comparison panel must not present those echoes as "you logged"
 * next to the measurement they were copied from; it renders the measured column
 * alone instead.
 *
 * Decided from the shape, not a stored flag, so it also covers sessions
 * imported before this check existed — and self-heals the moment the athlete
 * genuinely edits a figure (a corrected distance or duration makes the logged
 * column worth showing again). Two signals, both required:
 *
 *   • the session's interval IS the recording's, to the millisecond — only the
 *     import writes `startedAt`/`completedAt` from the workout; a quick log is
 *     stamped at typing time and a live log by human fingers, so neither lands
 *     on the recording's exact clock. This is what separates an import from a
 *     hand-logged "Tennis, 60 min" that HAPPENS to match its recording's length.
 *   • the block's figures are the recording's, unedited.
 */
export function deviceImportedSession(
  session: Pick<LoggedSession, "blocks" | "device" | "startedAt" | "completedAt">,
): boolean {
  const d = session.device;
  if (!d) return false;
  if (Date.parse(session.startedAt) !== Date.parse(d.start)) return false;
  if (!session.completedAt || Date.parse(session.completedAt) !== Date.parse(d.end)) return false;
  if (session.blocks.length !== 1) return false;
  const b = session.blocks[0]!;
  if (b.kind !== "cardio") return false;
  const same = (typed: number | undefined, measured: number | undefined) =>
    typed == null ? measured == null : measured != null && Math.abs(typed - measured) < 1e-9;
  return b.minutes === d.durationMin && same(b.distance, d.distanceKm) && same(b.elevation, d.elevationM);
}

/**
 * WHERE a recording can come from.
 *
 * `live` — the app can actually read this device today.
 * `placeholder` — the shape is wired end to end (the plan, the route, the mark,
 *   the row rendering all take it unchanged) but there is no data source yet,
 *   because the connector needs credentials nobody has set. Listed anyway, and
 *   labelled as such: an athlete looking for their Garmin should find out where
 *   it stands here, not by importing nothing and guessing why.
 *
 * Nothing downstream branches on this — it drives the provider strip's copy and
 * nothing else. A provider goes `live` by gaining a reader, not by being
 * special-cased.
 */
export type DeviceImportProviderStatus = "live" | "placeholder";

export interface DeviceImportProvider {
  /** Matches DeviceWorkout.provider, PROVIDER_DEVICE and the mark registry. */
  id: string;
  status: DeviceImportProviderStatus;
}

export const DEVICE_IMPORT_PROVIDERS: DeviceImportProvider[] = [
  { id: "apple", status: "live" },
  { id: "garmin", status: "placeholder" },
];

/** What an import will DO with one recording. */
export type DeviceImportAction = "create" | "attach" | "linked";

/** One planned recording — what it is, and what importing it changes. */
export interface DeviceImportItem {
  workout: DeviceWorkout;
  action: DeviceImportAction;
  /** The session this recording belongs to — set for `attach` and `linked`. */
  sessionId?: string;
  /** That session's title, for the picker's "joins your X" line. */
  sessionTitle?: string;
  /** The title a `create` would use (and the sport it resolved to, if any). */
  title: string;
  sport: string | null;
}

/** The logged duration of a session as the athlete recorded it — never the
 *  device's, or a session already matched would look like a perfect fit for the
 *  NEXT recording too. */
const loggedMinutes = (s: LoggedSession): number | null => {
  const min = doneReceipt(s, { ignoreDevice: true }).durationMin;
  return min != null && min > 0 ? min : null;
};

/**
 * Is this logged session the same training as this recording?
 *
 * Two shapes of "yes", because sessions reach the log two very different ways:
 *
 *  1. A session with a REAL interval (live-logged, or finished in the app):
 *     the recording overlaps it by at least half the recording's length. Clock
 *     against clock — the strongest evidence there is.
 *  2. A POINT log (startedAt == completedAt — the quick-log sheet stamps both
 *     at the moment of typing, hours after the game): no interval to overlap,
 *     so it needs BOTH a close-enough stamp and a duration that agrees within
 *     30%. That pairing is what separates the 60-min tennis match logged in the
 *     evening from the 12-min walk the watch also caught that afternoon.
 *
 * Anything short of these stays unmatched and imports as its own session — a
 * duplicate the athlete can delete is recoverable; a recording silently welded
 * onto the wrong session is not.
 */
function sameSession(session: LoggedSession, w: DeviceWorkout): boolean {
  const s0 = Date.parse(session.startedAt);
  const s1 = session.completedAt ? Date.parse(session.completedAt) : s0;
  const w0 = Date.parse(w.start);
  const w1 = Date.parse(w.end);
  if (![s0, s1, w0, w1].every(Number.isFinite)) return false;

  const spanMs = Math.max(0, s1 - s0);
  if (spanMs >= 60_000) {
    const overlapMs = Math.min(s1, w1) - Math.max(s0, w0);
    return overlapMs >= Math.max(0, w1 - w0) * 0.5;
  }

  // Point log: how far the stamp sits from the recording's interval.
  const gapMs = Math.max(0, Math.max(w0 - s0, s0 - w1));
  if (gapMs > DEVICE_IMPORT_ATTACH_H * 3600_000) return false;
  const logged = loggedMinutes(session);
  if (logged == null) return false;
  const ratio = Math.min(logged, w.durationMin) / Math.max(logged, w.durationMin);
  return ratio >= 0.7;
}

/** Closeness of a candidate pair, for resolving which recording claims which
 *  session when several are in the air — smaller is better (ms between the
 *  two start stamps). */
const pairDistance = (session: LoggedSession, w: DeviceWorkout): number =>
  Math.abs(Date.parse(session.startedAt) - Date.parse(w.start));

/**
 * Plan an import: what each recording will do to the log.
 *
 * Pairing is one-to-one and greedy on closeness — the nearest (session,
 * recording) pair is settled first, and both drop out of the pool — so two runs
 * the same morning can't both claim the same logged session. Recordings under
 * DEVICE_IMPORT_MIN_MIN are dropped entirely, and the newest is planned first
 * so a list rendered straight from this reads newest-down.
 */
export function planDeviceImport(
  workouts: DeviceWorkout[],
  sessions: LoggedSession[],
): DeviceImportItem[] {
  const usable = workouts
    .filter((w) => w.durationMin >= DEVICE_IMPORT_MIN_MIN && Number.isFinite(Date.parse(w.start)))
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  // Already on a row: the uuid is the device store's own id, so this survives a
  // re-read, a re-install and a concurrent sync from a second phone.
  const linkedTo = new Map<string, LoggedSession>();
  for (const s of sessions) if (s.device?.uuid) linkedTo.set(s.device.uuid, s);

  // Candidate pairs over the sessions that could still take a recording.
  const open = sessions.filter((s) => !s.device && Number.isFinite(Date.parse(s.startedAt)));
  const pairs: { w: DeviceWorkout; s: LoggedSession; d: number }[] = [];
  for (const w of usable) {
    if (linkedTo.has(w.uuid)) continue;
    for (const s of open) if (sameSession(s, w)) pairs.push({ w, s, d: pairDistance(s, w) });
  }
  pairs.sort((a, b) => a.d - b.d);

  const claimedWorkout = new Map<string, LoggedSession>();
  const claimedSession = new Set<string>();
  for (const p of pairs) {
    if (claimedWorkout.has(p.w.uuid) || claimedSession.has(p.s.id)) continue;
    claimedWorkout.set(p.w.uuid, p.s);
    claimedSession.add(p.s.id);
  }

  return usable.map((workout) => {
    const title = deviceWorkoutTitle(workout);
    const sport = sportForDeviceActivity(workout.activityLabel);
    const already = linkedTo.get(workout.uuid);
    if (already)
      return { workout, action: "linked" as const, sessionId: already.id, sessionTitle: already.title, title, sport };
    const target = claimedWorkout.get(workout.uuid);
    if (target)
      return { workout, action: "attach" as const, sessionId: target.id, sessionTitle: target.title, title, sport };
    return { workout, action: "create" as const, title, sport };
  });
}

/** How a planned import breaks down — drives the CTA ("Import 3") and the
 *  "nothing new" empty state without the caller re-counting. */
export function deviceImportCounts(items: DeviceImportItem[]): {
  create: number;
  attach: number;
  linked: number;
  /** create + attach — everything a tap would actually change. */
  pending: number;
} {
  const create = items.filter((i) => i.action === "create").length;
  const attach = items.filter((i) => i.action === "attach").length;
  const linked = items.filter((i) => i.action === "linked").length;
  return { create, attach, linked, pending: create + attach };
}

/**
 * The measured figures worth showing on an import row, in display order.
 * Joined by the caller — never with a middot.
 *
 * Distance reads in the ACTIVITY's own unit, the same language the summary's
 * comparison panel speaks (session-device.ts): a pool swim is "510 m", not
 * "0.51 km". The two surfaces describe the SAME recording, so a swim that reads
 * in metres on the summary and kilometres on the import sheet would look like
 * two different numbers. Unknown labels fall back to km.
 */
export function deviceImportMeta(w: DeviceWorkout): string[] {
  const dist = (km: number): string =>
    sportDistanceUnit(w.activityLabel) === "m"
      ? `${displaySportDistance(km, w.activityLabel)} m`
      : km < 1
        ? `${Math.round(km * 1000)} m`
        : `${kmValue(km)} km`;
  return [
    `${w.durationMin} min`,
    ...(w.distanceKm != null ? [dist(w.distanceKm)] : []),
    ...(w.kcal != null ? [`${w.kcal} kcal`] : []),
    ...(w.avgHr != null ? [`♥ ${w.avgHr}`] : []),
  ];
}
