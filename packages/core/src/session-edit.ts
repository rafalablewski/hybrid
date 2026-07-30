/**
 * SESSION EDIT — correcting a workout you already logged.
 *
 * Logging is a hurry. A distance gets skipped, minutes get fat-fingered, a set
 * lands with the wrong load — and until now the only remedies were to live with
 * it or delete the whole workout and log it again, which throws away the PRs,
 * the feel report and any device match attached to it. This module is the small
 * pure model behind an "Edit workout" sheet on both clients: turn a stored
 * session into editable strings, and fold the edited strings back onto the
 * ORIGINAL blocks.
 *
 * FOLD, DON'T REBUILD. The draft carries only the figures a human corrects
 * (title, distance, time, climb, rounds, RPE, load × reps). Everything else the
 * block holds — stroke, incline, zone, superset group, planned rest, a set's
 * role/drop flag, the live logger's measured rest and bar velocity — is
 * preserved untouched, because none of it is on screen and an editor must never
 * silently drop what it didn't show. That is why `sessionEditPatch` merges over
 * the original blocks instead of constructing new ones.
 *
 * THE ATHLETE'S COLUMN, NOT THE DEVICE'S. A draft is always built from the RAW
 * session, never from `deviceTrueSession` — editing a projected session would
 * have the athlete "correct" their own log to whatever the watch said, and then
 * store it as if they had typed it. On a matched session what is edited here is
 * the logged column of the comparison panel; the measurement still outranks it
 * everywhere else (see done-receipt.ts).
 *
 * Distance is held in the SPORT's own unit (metres for swimming and rowing, km
 * elsewhere) because that is what the athlete typed and what they will read
 * back; storage stays kilometres, converted at the edges by olympic-sports.ts.
 */
import type { LoggedSession, SessionBlock, StrengthSet } from "./engines/session";
import { displaySportDistance, parseSportDistance, sportDistanceUnit, timedSportOnly } from "./olympic-sports";
import { displayLoad, storeLoad, type WeightUnit } from "./units";

/** How the editor is shown: loads in the athlete's own unit, stored as kg. */
export interface SessionEditOptions {
  units?: WeightUnit;
}

/** One strength set, as the editor holds it. */
export interface EditableSetDraft {
  load: string;
  reps: string;
  rpe: string;
}

/** One block, as the editor holds it — every field a string, blank = "not set". */
export interface EditableBlockDraft {
  kind: SessionBlock["kind"];
  /** Read-only here: renaming an exercise is the logger's job, not a correction. */
  name: string;
  /** In the SPORT's display unit (metres for swimming / rowing, km elsewhere). */
  distance: string;
  minutes: string;
  /** Elevation gain, metres. */
  elevation: string;
  rounds: string;
  rpe: string;
  sets: EditableSetDraft[];
}

export interface SessionEditDraft {
  title: string;
  blocks: EditableBlockDraft[];
}

/** Which inputs a block puts on screen — one answer for both clients, so the
 *  sheet can't offer a distance field for judo on one and not the other. */
export interface EditableBlockFields {
  distance: boolean;
  /** The unit label the distance field carries ("m" / "km"). */
  distanceUnit: "m" | "km";
  minutes: boolean;
  elevation: boolean;
  rounds: boolean;
  rpe: boolean;
  sets: boolean;
}

export function editableBlockFields(block: { kind: SessionBlock["kind"]; name: string; elevation?: number }): EditableBlockFields {
  const unit = sportDistanceUnit(block.name);
  if (block.kind === "strength")
    return { distance: false, distanceUnit: unit, minutes: false, elevation: false, rounds: false, rpe: false, sets: true };
  if (block.kind === "conditioning")
    return { distance: false, distanceUnit: unit, minutes: true, elevation: false, rounds: true, rpe: true, sets: false };
  // Cardio: a KNOWN timed-only sport (tennis, judo, football) has no distance to
  // give — the same rule the loggers use, so a typed-in "Run" keeps its field.
  const distance = !timedSportOnly(block.name);
  return {
    distance,
    distanceUnit: unit,
    minutes: true,
    // Climb is an outdoor-km-sport figure; a pool swim has none. Shown anyway
    // when the block already carries one, so an existing value is never
    // strandable behind a hidden field.
    elevation: (distance && unit === "km") || (block.elevation ?? 0) > 0,
    rounds: false,
    rpe: true,
    sets: false,
  };
}

const numStr = (v: number | undefined | null): string =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : "";

/** The stored session as editable strings. Built from the RAW session — see the
 *  module note on why a device projection must never reach here. */
export function sessionEditDraft(session: LoggedSession, opts: SessionEditOptions = {}): SessionEditDraft {
  const units = opts.units ?? "kg";
  return {
    title: session.title ?? "",
    blocks: session.blocks.map((b) => ({
      kind: b.kind,
      name: b.name,
      distance: b.kind === "cardio" ? displaySportDistance(b.distance, b.name) : "",
      minutes: b.kind === "strength" ? "" : numStr(b.minutes),
      elevation: b.kind === "cardio" ? numStr(b.elevation) : "",
      rounds: b.kind === "conditioning" ? numStr(b.rounds) : "",
      rpe: b.kind === "strength" ? "" : numStr(b.rpe),
      sets:
        b.kind === "strength"
          ? // Loads are STORED in kg and typed in the athlete's own unit — the
            // same conversion both loggers do, so an lb athlete edits pounds.
            b.sets.map((s) => ({ load: displayLoad(s.load ?? "", units), reps: s.reps ?? "", rpe: s.rpe ?? "" }))
          : [],
    })),
  };
}

/** A typed number, or undefined when the field is blank / not a number. Zero and
 *  negatives read as "cleared" — nobody swims −3 km, and a 0 is the athlete
 *  deleting the figure rather than claiming they covered nothing. */
const parseNum = (v: string): number | undefined => {
  const n = Number.parseFloat((v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Fold the draft back onto the session: the same blocks, with only the edited
 *  figures replaced. Fields the editor never showed are carried through. */
export function sessionEditPatch(
  session: LoggedSession,
  draft: SessionEditDraft,
  opts: SessionEditOptions = {},
): { title: string; blocks: SessionBlock[] } {
  const units = opts.units ?? "kg";
  const blocks = session.blocks.map((b, i) => {
    const d = draft.blocks[i];
    // A draft that doesn't line up with the session (a refetch landed mid-edit)
    // leaves the block exactly as it was rather than guessing.
    if (!d || d.kind !== b.kind || d.name !== b.name) return b;

    if (b.kind === "strength") {
      const sets: StrengthSet[] = d.sets
        // Merge BEFORE dropping empties, so each row still lines up with the set
        // it came from — filtering first would shift every later row onto the
        // wrong original and re-attach its role and measured rest.
        .map((s, j) => {
          const rpe = (s.rpe ?? "").trim();
          // Everything the sheet doesn't show — role, drop, the live logger's
          // measured rest, velocity, ROM — survives the edit.
          const { rpe: _dropped, ...rest } = b.sets[j] ?? ({ load: "", reps: "" } as StrengthSet);
          const typed = (s.load ?? "").trim();
          // An UNTOUCHED field keeps the stored string verbatim. kg → lb → kg
          // does not round-trip (80 kg shows as 176 lb and comes back 79.83), so
          // converting unconditionally would quietly rewrite every load of an
          // lb athlete who opened the sheet to fix one distance.
          const load = typed === displayLoad(rest.load ?? "", units) ? (rest.load ?? "") : storeLoad(typed, units);
          return { ...rest, load, reps: (s.reps ?? "").trim(), ...(rpe ? { rpe } : {}) };
        })
        // An emptied row is a deleted set — that IS the correction when a set
        // got banked twice.
        .filter((s) => s.load || s.reps);
      return { ...b, sets };
    }

    const minutes = parseNum(d.minutes);
    const rpe = parseNum(d.rpe);
    if (b.kind === "conditioning") {
      const rounds = parseNum(d.rounds);
      return stripUndefined({ ...b, minutes, rounds, rpe });
    }
    const distance = parseSportDistance(d.distance, b.name);
    const elevation = parseNum(d.elevation);
    return stripUndefined({ ...b, distance, minutes, elevation, rpe });
  });
  return { title: (draft.title ?? "").trim() || session.title, blocks };
}

/** Drop the keys the edit cleared, so a blanked field leaves NO key behind
 *  rather than a `{ distance: undefined }` that JSON.stringify would erase
 *  anyway but every in-memory reader would see as present. */
function stripUndefined<T extends object>(o: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** True when the draft says something different from the stored session — so the
 *  sheet's Save can stay inert until there is an actual correction to send. */
export function sessionEditDirty(session: LoggedSession, draft: SessionEditDraft, opts: SessionEditOptions = {}): boolean {
  const next = sessionEditPatch(session, draft, opts);
  return next.title !== session.title || JSON.stringify(next.blocks) !== JSON.stringify(session.blocks);
}

// ---- API-side validation ----------------------------------------------------

const bounded = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

const SET_ROLES = new Set(["warmup", "working", "cooldown"]);

/**
 * Coerce arbitrary input into clean `Session.blocks`, or null when it isn't a
 * block list at all. The write path for an EDIT, which is the first time a
 * client hands the server blocks for a session that already exists — so unlike
 * the create route (which stores what the logger built) this one is checked:
 * a malformed edit must never overwrite a good workout with junk.
 *
 * Bounds are sanity caps, not physiology: a 24 h effort, 1 000 km, 10 000 m of
 * climb, RPE 1–10, 200 sets. Unknown keys are dropped rather than passed
 * through — the stored shape is the one this file documents.
 */
export function sanitizeSessionBlocks(input: unknown): SessionBlock[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > 100) return null;
  const out: SessionBlock[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const b = raw as Record<string, unknown>;
    const name = str(b.name, 120);
    if (!name) return null;

    if (b.kind === "strength") {
      if (!Array.isArray(b.sets) || b.sets.length > 200) return null;
      const sets: StrengthSet[] = [];
      for (const rs of b.sets) {
        if (typeof rs !== "object" || rs === null) return null;
        const s = rs as Record<string, unknown>;
        const load = typeof s.load === "string" ? s.load.trim().slice(0, 24) : "";
        const reps = typeof s.reps === "string" ? s.reps.trim().slice(0, 24) : "";
        if (!load && !reps) continue;
        const role = typeof s.role === "string" && SET_ROLES.has(s.role) ? (s.role as StrengthSet["role"]) : undefined;
        sets.push({
          load,
          reps,
          ...(str(s.rpe, 8) ? { rpe: str(s.rpe, 8)! } : {}),
          ...(str(s.vel, 8) ? { vel: str(s.vel, 8)! } : {}),
          ...(str(s.peakVel, 8) ? { peakVel: str(s.peakVel, 8)! } : {}),
          ...(str(s.rom, 8) ? { rom: str(s.rom, 8)! } : {}),
          ...(s.drop === true ? { drop: true } : {}),
          ...(bounded(s.rest, 0, 3600) != null ? { rest: bounded(s.rest, 0, 3600)! } : {}),
          ...(role ? { role } : {}),
        });
      }
      out.push({
        kind: "strength",
        name,
        sets,
        ...(str(b.note, 500) ? { note: str(b.note, 500)! } : {}),
        ...(bounded(b.restSec, 0, 3600) != null ? { restSec: bounded(b.restSec, 0, 3600)! } : {}),
        ...(str(b.group, 24) ? { group: str(b.group, 24)! } : {}),
      });
      continue;
    }

    if (b.kind === "cardio") {
      out.push({
        kind: "cardio",
        name,
        ...(str(b.discipline, 24) ? { discipline: b.discipline as never } : {}),
        ...(bounded(b.distance, 0.001, 1000) != null ? { distance: bounded(b.distance, 0.001, 1000)! } : {}),
        ...(bounded(b.minutes, 0.1, 1440) != null ? { minutes: bounded(b.minutes, 0.1, 1440)! } : {}),
        ...(bounded(b.rpe, 1, 10) != null ? { rpe: bounded(b.rpe, 1, 10)! } : {}),
        ...(bounded(b.incline, 0, 45) != null ? { incline: bounded(b.incline, 0, 45)! } : {}),
        ...(str(b.stroke, 24) ? { stroke: str(b.stroke, 24)! } : {}),
        ...(bounded(b.zone, 1, 5) != null ? { zone: bounded(b.zone, 1, 5)! } : {}),
        ...(bounded(b.elevation, 1, 10000) != null ? { elevation: bounded(b.elevation, 1, 10000)! } : {}),
      });
      continue;
    }

    if (b.kind === "conditioning") {
      out.push({
        kind: "conditioning",
        name,
        ...(str(b.format, 60) ? { format: str(b.format, 60)! } : {}),
        ...(bounded(b.work, 1, 7200) != null ? { work: bounded(b.work, 1, 7200)! } : {}),
        ...(bounded(b.rest, 0, 7200) != null ? { rest: bounded(b.rest, 0, 7200)! } : {}),
        ...(bounded(b.rounds, 1, 500) != null ? { rounds: bounded(b.rounds, 1, 500)! } : {}),
        ...(bounded(b.minutes, 0.1, 1440) != null ? { minutes: bounded(b.minutes, 0.1, 1440)! } : {}),
        ...(bounded(b.rpe, 1, 10) != null ? { rpe: bounded(b.rpe, 1, 10)! } : {}),
      });
      continue;
    }
    return null;
  }
  return out;
}
