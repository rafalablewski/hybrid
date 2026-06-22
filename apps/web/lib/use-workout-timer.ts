"use client";

import { useEffect, useRef, useState } from "react";
import { useLoggerPrefs } from "./logger-prefs";

/**
 * The live workout timer (web) — the twin of the mobile live logger's clock
 * (apps/mobile/app/workout.tsx). On entry it runs a get-ready COUNT-IN
 * (5→1→GO, gated by the shared `countIn` logger pref) and then ticks an
 * elapsed stopwatch. `startedAt` is the real wall-clock the session began (at
 * GO, or the instant logging opened when the count-in is off), so a saved
 * session records true training duration — not the moment you tapped Save.
 *
 * Returns the running clock + the (nullable) count-in number; the consumer
 * renders the header clock + a full-screen 5→GO overlay from these.
 */
export function useWorkoutTimer() {
  const prefs = useLoggerPrefs();
  const startedAt = useRef<Date>(new Date());
  const [elapsed, setElapsed] = useState(0);
  // null = no count-in running (clock is live). >0 = ticking down. 0 = "GO".
  const [countdown, setCountdown] = useState<number | null>(null);
  const [running, setRunning] = useState(true);
  const begun = useRef(false);

  // Begin once, client-side (so there's no SSR/hydration mismatch): count the
  // athlete in, or — when the count-in is off — start the clock immediately.
  // By the time this passive effect runs, the prefs store has hydrated from
  // localStorage (useSyncExternalStore subscribes during commit), so
  // `prefs.countIn` is the user's real setting here.
  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    startedAt.current = new Date();
    if (prefs.countIn) setCountdown(5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the count-in: 5→1, a brief "GO", then start the clock from zero so
  // the elapsed time reflects actual training, not the count-in.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      startedAt.current = new Date();
      setElapsed(0);
      const id = setTimeout(() => setCountdown(null), 700);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Tick the elapsed stopwatch once the count-in (if any) has finished.
  useEffect(() => {
    if (!running || countdown !== null) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [running, countdown]);

  /** Halt the clock — call when the session finishes so it stops re-rendering. */
  const stop = () => setRunning(false);

  return { elapsed, countdown, startedAt, stop };
}

/** m:ss for the elapsed clock (mirrors the mobile logger's `mmss`). */
export const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
