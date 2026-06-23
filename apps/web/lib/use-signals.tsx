"use client";

import { useQuery } from "@tanstack/react-query";
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

/** Query key for the user's Signal ontology. */
export const signalsKey = ["signals"] as const;

async function fetchSignals(): Promise<Signal[]> {
  const res = await fetch("/api/signals");
  if (res.ok) {
    const d = (await res.json()) as { signals?: ApiSignal[] };
    return (d.signals ?? []).map((s) => ({
      athleteId: s.userId,
      kind: s.kind,
      value: s.value,
      unit: s.unit,
      source: s.source,
      ts: s.ts,
    }));
  }
  if (res.status === 401) return [];
  throw new Error(`HTTP ${res.status}`);
}

/**
 * The athlete's persisted Signal ontology + the engine Biometrics built from it
 * (null until at least one recovery signal exists). This is the path that
 * wearable sync will feed; manual check-in writes here too. Backed by the shared
 * query cache.
 */
export function useSignals() {
  const q = useQuery({ queryKey: signalsKey, queryFn: fetchSignals });
  const signals = q.data ?? [];
  return { signals, bio: toBiometrics(signals) ?? null, refresh: () => q.refetch() };
}
