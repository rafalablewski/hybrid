"use client";

import { useCallback, useEffect, useState } from "react";
import { toBiometrics, type Signal } from "@hybrid/core";

// API rows carry userId + ts as an ISO string; map them to the core Signal
// shape the ontology helpers expect.
type ApiSignal = {
  id: string;
  userId: string;
  kind: Signal["kind"];
  value: number;
  unit: string;
  source: string;
  ts: string;
};

/**
 * The athlete's persisted Signal ontology + the engine Biometrics built from it
 * (null until at least one recovery signal exists). This is the path that
 * wearable sync will feed; manual check-in writes here too.
 */
export function useSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      if (res.ok) {
        const d = (await res.json()) as { signals?: ApiSignal[] };
        setSignals(
          (d.signals ?? []).map((s) => ({
            athleteId: s.userId,
            kind: s.kind,
            value: s.value,
            unit: s.unit,
            source: s.source,
            ts: s.ts,
          })),
        );
      } else setSignals([]);
    } catch {
      setSignals([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { signals, bio: toBiometrics(signals) ?? null, refresh };
}
