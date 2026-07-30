import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { healthKitAvailability, healthKitConnected, queryRecentDeviceWorkouts } from "./healthkit";
import { importDeviceWorkouts, type DeviceImportResult } from "./api";
import { useLoggerPrefs } from "./logger-prefs";

/**
 * AUTO-IMPORT — the "and I don't want to think about it" half of device import.
 *
 * With the preference on, every foreground reads the device's recent workouts
 * and hands them to the server, which plans them against the database and
 * writes what's new (see the import route + core/device-import.ts). The athlete
 * finishes a run on the watch, opens HYBRID, and the run is simply there.
 *
 * Three deliberate restraints:
 *  - It never opens a permission sheet. An unprompted iOS dialog on app open is
 *    exactly the thing that makes people deny Health access forever, so this
 *    runs only for an athlete who already connected through the hub or the
 *    import sheet.
 *  - It plans nothing locally. The server decides against the database, so a
 *    second phone syncing at the same moment can't duplicate a session.
 *  - It is throttled, and silent on failure. A background pull that can't reach
 *    the network is not an error worth a banner — the next foreground retries.
 */
const LAST_RUN_KEY = "hybrid.deviceImport.lastRun";
const MIN_INTERVAL_MS = 30 * 60 * 1000;

/** Read the device and import, ignoring the throttle. Returns null when it
 *  didn't run (not connected / no module / unreachable). */
export async function runDeviceImport(): Promise<DeviceImportResult | null> {
  if (healthKitAvailability() !== "ready") return null;
  if (!(await healthKitConnected())) return null;
  const workouts = await queryRecentDeviceWorkouts();
  if (workouts == null) return null;
  const res = await importDeviceWorkouts(workouts);
  if (res) await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now())).catch(() => {});
  return res;
}

async function dueForRun(): Promise<boolean> {
  try {
    const last = Number(await AsyncStorage.getItem(LAST_RUN_KEY));
    return !Number.isFinite(last) || Date.now() - last > MIN_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * Run the auto-import on mount and on every return to the foreground, when the
 * athlete has switched it on. `onImported` fires only when something actually
 * landed, so a screen can refetch without flickering on every no-op sync.
 */
export function useDeviceAutoImport(onImported?: (res: DeviceImportResult) => void): void {
  const { deviceAutoImport } = useLoggerPrefs();
  // Held in a ref so a re-rendered callback never re-arms the listener.
  const cb = useRef(onImported);
  cb.current = onImported;
  const running = useRef(false);

  useEffect(() => {
    if (!deviceAutoImport) return;
    let alive = true;

    const attempt = async () => {
      if (running.current || !(await dueForRun())) return;
      running.current = true;
      const res = await runDeviceImport().catch(() => null);
      running.current = false;
      if (alive && res && res.created + res.attached > 0) cb.current?.(res);
    };

    void attempt();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void attempt();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [deviceAutoImport]);
}
