"use client";

import { useQueryClient } from "@tanstack/react-query";
import { sessionsKey } from "./use-sessions";
import { signalsKey } from "./use-signals";
import { biometricsKey } from "./use-biometrics";
import { macrocycleKey } from "./use-macrocycle";
import { checkinsKey } from "./use-checkins";

/**
 * Mutation → cache invalidation. Any component that writes athlete data calls
 * the matching method after a successful save, and EVERY consumer of that query
 * (across the whole app, regardless of prop wiring) revalidates. This replaces
 * the old onSaved/refresh prop-drilling — the canonical TanStack pattern.
 *
 * This map is what makes the cache SAFE rather than merely fast: a cached value
 * is only trustworthy if every write that could falsify it drops it. So it must
 * stay TOTAL — a write path with no matching entry here is a real staleness
 * bug, not a missing optimisation. When you add an endpoint that mutates
 * athlete data, add its key and its invalidator here in the same change.
 * Mirrors mobile's useRevalidate().
 */
export function useRevalidate() {
  const qc = useQueryClient();
  return {
    /** A readiness face was saved — today's feeling drives the prescription. */
    checkins: () => qc.invalidateQueries({ queryKey: checkinsKey }),
    /** A logged/edited/archived workout changed the session list. */
    sessions: () => qc.invalidateQueries({ queryKey: sessionsKey }),
    /** A check-in / weigh-in / nutrition log wrote recovery + body-mass signals
     *  that drive the Performance State on Today. */
    recovery: () => {
      qc.invalidateQueries({ queryKey: signalsKey });
      qc.invalidateQueries({ queryKey: biometricsKey });
    },
    /** Enrolling/clearing a plan changed the macrocycle. */
    macrocycle: () => qc.invalidateQueries({ queryKey: macrocycleKey }),
  };
}
