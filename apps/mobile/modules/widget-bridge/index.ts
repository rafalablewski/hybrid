import { requireOptionalNativeModule } from "expo-modules-core";

// The phone-side bridge that feeds the home-screen widget and the Watch app.
// One call, three deliveries: the snapshot JSON is written to the App Group's
// UserDefaults (the widget's timeline reads it), WidgetKit is told to reload,
// and WatchConnectivity pushes the same JSON as applicationContext (the Watch
// app's only data path — an App Group does NOT span two devices).
//
// requireOptionalNativeModule: the native half only exists in a build that ran
// prebuild with WITH_APPLE_TARGETS=1 (see app.config.js) — in Expo Go, on a
// build without the targets, this is a silent no-op, never a crash.

const Native = requireOptionalNativeModule<{ publish(json: string): void }>("WidgetBridge");

/** The compact "today at a glance" payload both native surfaces render.
 *  Keep it flat and tiny — it crosses two serialization boundaries. */
export interface TodayWidgetSnapshot {
  /** Headline: today's session title, or the rest-day line. */
  title: string;
  /** Second line: plan/day context or the readiness sentence. */
  sub: string;
  /** Current training streak, in days. */
  streak: number;
  /** Whether today's training is already done. */
  done: boolean;
  /** ISO timestamp the snapshot was built — surfaces staleness honestly. */
  updatedAt: string;
}

export function publishTodaySnapshot(snapshot: TodayWidgetSnapshot): void {
  try {
    Native?.publish(JSON.stringify(snapshot));
  } catch {
    // A widget is a nicety — it must never take the app down with it.
  }
}
