"use client";

import { useCallback, useEffect, useState } from "react";
import { buildBiometrics, type BiometricEntry } from "@hybrid/core";

/** The user's biometric readings + the engine Biometrics built from them
 *  (null until at least one reading exists). */
export function useBiometrics() {
  const [entries, setEntries] = useState<BiometricEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/biometrics");
      if (res.ok) {
        const d = (await res.json()) as { entries?: BiometricEntry[] };
        setEntries(d.entries ?? []);
      } else setEntries([]);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { bio: buildBiometrics(entries), entries, refresh };
}
