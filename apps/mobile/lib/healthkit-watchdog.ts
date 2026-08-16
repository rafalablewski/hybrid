import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * THE NATIVE WATCHDOG — what the app was doing when the process disappeared.
 *
 * Everything in lib/healthkit.ts eventually calls Swift, and a Swift abort
 * (`try!` on an error, a continuation resumed twice, an Objective-C exception
 * HealthKit raises out of a query) does not become a JS exception. It calls
 * `abort()`. The process is gone: no rejected promise, no `.catch()`, no error
 * boundary, nothing written to any log the phone will still have afterwards.
 * From the outside it is indistinguishable from the athlete being thrown out of
 * the app — which is exactly how the watch import was reported ("I tapped it and
 * the app closed"), and exactly why there was nothing to read afterwards. This
 * app has no crash reporter yet (see the `crash-reporting` capability), so the
 * only thing that survives a native abort is what was written to disk BEFORE it.
 *
 * So every native span writes down what it is about to do, and clears it when it
 * comes back. A marker still on disk at the next launch names the call the
 * process died inside — the whole diagnosis, in one string, from a build already
 * in a tester's hands.
 *
 * TWO HONEST LIMITS, and the design follows from them:
 *
 *  • A leftover marker is not PROOF of a crash. iOS can suspend and then
 *    terminate an app mid-read, and force-quitting looks identical. So a fault
 *    is never called a crash in front of anybody, and it never disables
 *    anything the feature needs to work at all.
 *  • Which is why only the OPTIONAL span acts on it. `streams` — the heart-rate
 *    trace and the GPS track read after the sessions have already landed — is
 *    skipped once it has been implicated, because the athlete's sessions are
 *    the point and the trace under them is not worth a second ejection from the
 *    app. `auth` and `workouts` are the feature; they are recorded and retried.
 */

/** The native spans worth naming. Coarse on purpose: one AsyncStorage write per
 *  span, so the granularity has to be worth its own IO. */
export type HealthStep =
  /** requestAuthorization — the permission sheet. */
  | "auth"
  /** queryWorkoutSamples + the per-recording read behind it. */
  | "workouts"
  /** The per-workout series: heart rate, power, cadence, and the route. */
  | "streams"
  /** The daily biometrics relay (quantity + category samples). */
  | "signals";

/** What is in flight right now — survives the process, which is the point. */
const INFLIGHT_KEY = "hybrid.healthkit.inflight";
/** How many times each span was in flight when the process vanished. */
const FAULTS_KEY = "hybrid.healthkit.faults";

type Faults = Partial<Record<HealthStep, number>>;

let faults: Faults = {};
let settling: Promise<void> | null = null;

/**
 * Promote a marker left over from a previous process into a fault, ONCE per
 * launch. It runs before the first span writes anything, so it can never
 * mistake this process's own marker for a dead one.
 */
function settleOnce(): Promise<void> {
  if (settling) return settling;
  settling = (async () => {
    try {
      const raw = await AsyncStorage.getItem(FAULTS_KEY);
      faults = raw ? (JSON.parse(raw) as Faults) : {};
    } catch {
      faults = {};
    }
    let stale: string | null = null;
    try {
      stale = await AsyncStorage.getItem(INFLIGHT_KEY);
    } catch {
      stale = null;
    }
    if (!stale) return;
    await AsyncStorage.removeItem(INFLIGHT_KEY).catch(() => {});
    const step = stale as HealthStep;
    faults = { ...faults, [step]: (faults[step] ?? 0) + 1 };
    await AsyncStorage.setItem(FAULTS_KEY, JSON.stringify(faults)).catch(() => {});
    // The one place this is ever said out loud. A native abort leaves nothing
    // else behind, so a tester on a debug build gets the answer here.
    console.warn(`[healthkit] the previous run did not return from "${step}"`);
  })();
  return settling;
}

/**
 * Run a native span under the watchdog.
 *
 * `fallback` is what the caller gets when the span is skipped — which happens
 * only for a span marked `optional` that has already been implicated. Everything
 * else runs, every time; the watchdog's job there is to remember, not to refuse.
 */
export async function nativeSpan<T>(
  step: HealthStep,
  run: () => Promise<T>,
  fallback: T,
  opts: { optional?: boolean } = {},
): Promise<T> {
  await settleOnce();
  if (opts.optional && (faults[step] ?? 0) > 0) return fallback;
  // Awaited, not fired: a marker that lands after the crash it was meant to
  // describe is no marker at all.
  await AsyncStorage.setItem(INFLIGHT_KEY, step).catch(() => {});
  try {
    return await run();
  } finally {
    await AsyncStorage.removeItem(INFLIGHT_KEY).catch(() => {});
  }
}

/** Which spans have been implicated, for a surface that wants to say so. Empty
 *  until `settleOnce` has run — call `readHealthFaults()` to be sure. */
export function healthFaults(): Faults {
  return faults;
}

/** The same, having first read the record off disk. */
export async function readHealthFaults(): Promise<Faults> {
  await settleOnce();
  return faults;
}

/** Forget the record — for a "try it anyway" the athlete asked for. */
export async function forgetHealthFaults(): Promise<void> {
  faults = {};
  await AsyncStorage.removeItem(FAULTS_KEY).catch(() => {});
  await AsyncStorage.removeItem(INFLIGHT_KEY).catch(() => {});
}
