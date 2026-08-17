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
 *  • Only the OPTIONAL spans act on it. The trace under a session — the
 *    heart-rate series and the GPS track, read after the sessions have already
 *    landed — is skipped once it has been implicated, because the athlete's
 *    sessions are the point and the trace under them is not worth a second
 *    ejection from the app. `auth` and `workouts` are the feature; they are
 *    recorded and retried.
 *
 * THE MARKER IS A PATH, NOT A WORD, and that is what the first version got
 * wrong. One flat key meant two spans in flight at once (a sync in one screen
 * while an import runs in another) had the first to finish clear the other's
 * marker — a crash could go unnamed. The spans are a STACK now: entering pushes a
 * frame, leaving removes ITS OWN, and what is written is the whole path
 * ("streams>stream-route"). A crash is attributed to the DEEPEST segment, which is
 * the call that was actually running, and the path is kept so the report says how
 * it got there. (Leaving used to `pop()`, which reproduced the original bug in a
 * subtler form — see the note on `stack`. healthkit-watchdog.test.ts runs it.)
 *
 * AND THE WATCHDOG ITSELF IS TESTED, because it is the only witness. A marker
 * naming the wrong span is worse than no marker: it sends the next build to
 * harden a call that already returned while the one that died looks innocent.
 * Nothing in here touches a native module — a stack, a JSON blob and one
 * AsyncStorage key — so unlike the calls it watches, it can be RUN.
 */

/** The native spans worth naming. One AsyncStorage write per span, so the
 *  granularity has to be worth its own IO — but coarser than this is what cost
 *  the last build its diagnosis: "streams" named three different native calls
 *  (a permission sheet, a sample query, a route query), and knowing the process
 *  died in one of three places is not knowing where it died. */
export type HealthStep =
  /** requestAuthorization for the workout/daily types — the permission sheet. */
  | "auth"
  /**
   * getRequestStatusForAuthorization — the GATE every read is behind.
   *
   * It was the one native call in the bridge with no name, and it is the FIRST
   * one the import tap makes. So the span the athlete's crash happened in could
   * not be recorded, and the previous build's whole diagnosis — a marker on disk
   * naming the call — was blind to exactly the call that runs first.
   */
  | "auth-status"
  /** queryWorkoutSamples + the per-recording read behind it. */
  | "workouts"
  /** The daily biometrics relay (quantity + category samples). */
  | "signals"
  /** requestAuthorization for the route + cycling series types, on its own. */
  | "stream-auth"
  /** The per-workout sample series: heart rate, power, cadence. */
  | "stream-read"
  /** HKWorkoutRouteQuery — the GPS track. */
  | "stream-route";

/**
 * The span the build before this one wrote for ALL THREE of the stream steps.
 *
 * A phone that met the crash under that build is carrying this fault right now,
 * and the whole point of the record is that it survives the build that wrote
 * it: without this the new sub-spans would each look untried, and the first
 * thing the new build would do is run the call that already took the process.
 */
const LEGACY_STREAM_STEP = "streams";
const STREAM_STEPS: HealthStep[] = ["stream-auth", "stream-read", "stream-route"];

/** What is in flight right now — survives the process, which is the point. */
const INFLIGHT_KEY = "hybrid.healthkit.inflight";
/** How many times each span was in flight when the process vanished. */
const FAULTS_KEY = "hybrid.healthkit.faults";

type Faults = Partial<Record<HealthStep, number>>;

let faults: Faults = {};
let settling: Promise<void> | null = null;
/**
 * The spans in flight, outermost first. Written to disk as one path.
 *
 * FRAMES, NOT NAMES, and each span removes ITS OWN — because `pop()` was wrong
 * the moment two spans could be in flight at once, which is the exact case this
 * stack was introduced for. Two independent chains (the import sheet loading
 * while the auto-import's foreground pull is still running) interleave: A pushes,
 * B pushes, A finishes and `pop()` deletes B's frame. The path then names a call
 * that already returned, and the one still running has no marker at all — a
 * watchdog reporting the wrong span is worse than one reporting none, because the
 * next build goes and hardens the innocent call.
 *
 * The concatenated path is still best-effort under concurrency: it can only say
 * what was in flight, not which chain each frame belongs to. What it can no
 * longer do is lose a frame that is still running.
 */
const stack: { step: HealthStep }[] = [];

/** What is in flight, outermost first, as the one string that goes to disk. */
const inflightPath = (): string => stack.map((f) => f.step).join(">");

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
    // The DEEPEST segment is the call that was running; the path is what it was
    // running under. A marker written by the previous build is one flat word,
    // which this reads unchanged.
    const path = stale.split(">").filter(Boolean);
    const step = path[path.length - 1] ?? stale;
    const implicated = step === LEGACY_STREAM_STEP ? STREAM_STEPS : [step as HealthStep];
    for (const s of implicated) faults = { ...faults, [s]: (faults[s] ?? 0) + 1 };
    await AsyncStorage.setItem(FAULTS_KEY, JSON.stringify(faults)).catch(() => {});
    // The one place this is ever said out loud. A native abort leaves nothing
    // else behind, so a tester on a debug build gets the answer here.
    console.warn(`[healthkit] the previous run did not return from "${stale}"`);
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
  const frame = { step };
  stack.push(frame);
  // Awaited, not fired: a marker that lands after the crash it was meant to
  // describe is no marker at all.
  await AsyncStorage.setItem(INFLIGHT_KEY, inflightPath()).catch(() => {});
  try {
    return await run();
  } finally {
    // By IDENTITY — see the note on `stack`. `pop()` here removed whatever frame
    // happened to be last, which under two concurrent chains is somebody else's.
    const at = stack.indexOf(frame);
    if (at >= 0) stack.splice(at, 1);
    await (stack.length
      ? AsyncStorage.setItem(INFLIGHT_KEY, inflightPath())
      : AsyncStorage.removeItem(INFLIGHT_KEY)
    ).catch(() => {});
  }
}

/** Has this span already been implicated in a vanished process? For a caller
 *  that wants to say so, or skip the work before setting anything up. */
export function healthStepFaulted(step: HealthStep): boolean {
  return (faults[step] ?? 0) > 0;
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

/**
 * Forget the record — for a "try it anyway" the athlete asked for.
 *
 * WITHOUT THIS THE QUARANTINE IS A LIFE SENTENCE, which is not what it is for.
 * A marker is evidence that a span did not return, not proof it can never
 * return: iOS terminating a suspended app mid-read leaves exactly the same
 * trace, and so does a force-quit. So a span that has been implicated is one an
 * athlete may still ask for by name — and the only sane place to decide that is
 * in front of the control that runs it, which is why the import sheet's trace
 * row turns into "Try anyway" rather than going quietly dead.
 *
 * Scoped, because "try the recording again" must not also clear the record of a
 * different span dying somewhere else.
 */
export async function forgetHealthFaults(steps?: HealthStep[]): Promise<void> {
  if (!steps) faults = {};
  else {
    const next = { ...faults };
    // The previous build's flat name covered all three stream calls, so a retry
    // of any of them has to clear it too or the record outlives its meaning.
    for (const s of steps) delete next[s];
    if (steps.some((s) => STREAM_STEPS.includes(s))) delete (next as Faults & Record<string, number>)[LEGACY_STREAM_STEP];
    faults = next;
  }
  await AsyncStorage.setItem(FAULTS_KEY, JSON.stringify(faults)).catch(() => {});
  await AsyncStorage.removeItem(INFLIGHT_KEY).catch(() => {});
}

/** The spans behind a recording's trace — what a "try anyway" on the trace row
 *  clears, and what the sheet checks before offering one. */
export const STREAM_HEALTH_STEPS: HealthStep[] = STREAM_STEPS;
