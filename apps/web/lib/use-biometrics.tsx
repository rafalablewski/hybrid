"use client";

import { useQuery } from "@tanstack/react-query";
import { buildBiometrics, type BiometricEntry } from "@hybrid/core";

/** Query key for the user's biometric readings. */
export const biometricsKey = ["biometrics"] as const;

async function fetchBiometrics(): Promise<BiometricEntry[]> {
  const res = await fetch("/api/biometrics");
  if (res.ok) {
    const d = (await res.json()) as { entries?: BiometricEntry[] };
    return d.entries ?? [];
  }
  if (res.status === 401) return [];
  throw new Error(`HTTP ${res.status}`);
}

/** The user's biometric readings + the engine Biometrics built from them (null
 *  until at least one reading exists). Backed by the shared query cache. */
export function useBiometrics() {
  const q = useQuery({ queryKey: biometricsKey, queryFn: fetchBiometrics });
  const entries = q.data ?? [];
  return { bio: buildBiometrics(entries), entries, refresh: () => q.refetch() };
}
