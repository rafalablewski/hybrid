"use client";

import { useQueryClient } from "@tanstack/react-query";
import { sessionsKey } from "./use-sessions";
import { signalsKey } from "./use-signals";
import { biometricsKey } from "./use-biometrics";
import { macrocycleKey } from "./use-macrocycle";

/**
 * Mutation → cache invalidation. Any component that writes athlete data calls
 * the matching method after a successful save, and EVERY consumer of that query
 * (across the whole app, regardless of prop wiring) revalidates. This replaces
 * the old onSaved/refresh prop-drilling — the canonical TanStack pattern.
 */
export function useRevalidate() {
  const qc = useQueryClient();
  return {
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
