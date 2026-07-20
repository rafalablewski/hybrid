/**
 * SESSION SIGNATURE — a per-session "effort fingerprint": one bar per logged
 * set (and per cardio/conditioning effort), heighted by how hard that piece was.
 * Deterministic + pure (NO randomness) so the same session always draws the same
 * ribbon on both clients — the generative-looking graphic in the Wrapped recap.
 *
 * Effort source, in order of trust: logged RPE (rpe/10) → load relative to the
 * heaviest set of that lift → a neutral mid. Real data only — a session that
 * logged nothing expressive just draws a flatter ribbon.
 */
import type { LoggedSession } from "./engines/session";

const clamp = (n: number) => Math.max(0.12, Math.min(1, n));

/** Bar heights (0..1) for the session's effort ribbon, in logged order. */
export function sessionSignature(session: LoggedSession): number[] {
  const bars: number[] = [];
  for (const b of session.blocks) {
    if (b.kind === "strength") {
      const loads = b.sets.map((s) => Number.parseFloat(s.load) || 0);
      const maxLoad = Math.max(1, ...loads);
      for (const s of b.sets) {
        const rpe = Number.parseFloat(s.rpe ?? "");
        if (rpe > 0) {
          bars.push(clamp(rpe / 10));
        } else {
          const load = Number.parseFloat(s.load) || 0;
          bars.push(load > 0 ? clamp(0.35 + 0.65 * (load / maxLoad)) : 0.5);
        }
      }
    } else {
      // Cardio / conditioning efforts count as one bar, RPE-heighted when logged.
      const rpe = Number.parseFloat((b as { rpe?: string }).rpe ?? "");
      bars.push(rpe > 0 ? clamp(rpe / 10) : 0.6);
    }
  }
  return bars;
}

/** The ribbon only reads as a "signature" with enough bars; below this it's just
 *  a couple of sticks, so callers hide it. */
export const SIGNATURE_MIN_BARS = 4;
