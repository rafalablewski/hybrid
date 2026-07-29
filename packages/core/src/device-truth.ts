/**
 * DEVICE TRUTH — the athlete's device outranks the athlete's typing, all the
 * way down into the engines.
 *
 * session-device.ts attaches a matched recording to `Session.device`, and
 * done-receipt/energy already read the SESSION-level figures from it (duration,
 * distance, climb, kcal). But most of the engine layer doesn't ask a session for
 * its duration — it walks the BLOCKS: weekly mileage sums `b.distance`, cardio
 * PRs derive pace from `b.minutes`, the 5 km-equivalent fitness estimate reads
 * both, the endurance hub tallies efforts per discipline. Those all kept reading
 * what was typed, which meant a matched session was measured on the summary and
 * estimated everywhere else.
 *
 * This module closes that gap with ONE pure projection: `deviceTrueSession`
 * returns the session with its activity block rewritten to what the device
 * measured. Engines apply it at their entry point, so a single call makes every
 * downstream figure — mileage, pace, PRs, training load, fitness level, recaps
 * — measured rather than typed.
 *
 * ATTRIBUTION IS THE WHOLE PROBLEM. A device recording is ONE interval; a
 * logged session can hold several efforts. Rewriting is therefore only done
 * when the mapping is unambiguous:
 *
 *   • exactly one timed (cardio/conditioning) block → it gets the measurement;
 *     strength blocks in the same session are untouched (a watch measures the
 *     hour, not the bench press).
 *   • zero timed blocks (a pure lifting session) → blocks are left alone; the
 *     measured duration still reaches the engines through done-receipt and
 *     `sessionMinutes`, which read `session.device` directly.
 *   • two or more timed blocks → left alone. Splitting one recording across a
 *     run AND a row would be guessing, and guessing is what this whole feature
 *     exists to stop.
 *
 * Only figures the device actually MEASURES are projected (minutes, distance,
 * elevation). Everything subjective stays the athlete's: RPE, zone, stroke,
 * incline, the name of the thing they did.
 *
 * The projection is idempotent and never mutates: `deviceTrueSession(s)` on an
 * unmatched session returns `s` itself, so mapping a whole history is cheap.
 *
 * NEVER combine a projected session with `ignoreDevice: true` — that flag means
 * "read what the athlete logged", and on a projected session the logged values
 * are gone. The one caller that wants the typed figures (the summary's
 * comparison panel) reads the RAW session, which is why this is a read-time
 * projection and not something written back to the row.
 */
import type { CardioBlock, LoggedSession, SessionBlock } from "./engines/session";

/** The blocks a device recording can speak for — the timed ones. A strength
 *  block carries sets, not minutes, so nothing there is the device's to say. */
const isTimed = (b: SessionBlock): b is CardioBlock | Extract<SessionBlock, { kind: "conditioning" }> =>
  b.kind === "cardio" || b.kind === "conditioning";

/**
 * One session as the device measured it. Returns the SAME object when there is
 * nothing to project (no match, or ambiguous attribution) so callers can map
 * freely without copying a whole history.
 */
export function deviceTrueSession(session: LoggedSession): LoggedSession {
  const d = session.device;
  if (!d || !(d.durationMin > 0)) return session;

  const timed = session.blocks.filter(isTimed);
  if (timed.length !== 1) return session;
  const target = timed[0]!;

  const measured: SessionBlock =
    target.kind === "cardio"
      ? {
          ...target,
          minutes: d.durationMin,
          ...(d.distanceKm != null ? { distance: d.distanceKm } : {}),
          ...(d.elevationM != null ? { elevation: d.elevationM } : {}),
        }
      : { ...target, minutes: d.durationMin };

  return { ...session, blocks: session.blocks.map((b) => (b === target ? measured : b)) };
}

/** The same projection across a history. Returns the same array when no session
 *  in it is matched — the common case, and the one worth not copying. */
export function deviceTrueSessions(sessions: LoggedSession[]): LoggedSession[] {
  let changed = false;
  const out = sessions.map((s) => {
    const t = deviceTrueSession(s);
    if (t !== s) changed = true;
    return t;
  });
  return changed ? out : sessions;
}
