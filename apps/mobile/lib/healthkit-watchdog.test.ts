import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE WATCHDOG IS THE ONLY WITNESS, SO IT HAS TO BE RIGHT.
 *
 * Three builds have now chased the watch import closing the app, and each one
 * shipped a better marker instead of a proven fix — because a native abort takes
 * the process and leaves nothing else behind. The string this module writes to
 * disk IS the diagnosis: it is what the next report will consist of, and every
 * decision after it is made on that one word.
 *
 * Which makes an unexamined watchdog the worst thing in the flow. A marker naming
 * the WRONG span does not merely fail to help — it sends the next build to harden
 * a call that already returned, while the one that actually died looks innocent.
 * That is not hypothetical: `pop()` did exactly this the moment two spans could
 * be in flight at once, which is the case the stack was introduced to handle.
 *
 * Unlike everything else on this path, none of it needs HealthKit. It is a stack,
 * a JSON blob and an AsyncStorage key, so it can be RUN rather than read as text
 * — the one part of this crash hunt that a test can actually settle.
 */

const memory = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => memory.get(k) ?? null,
    setItem: async (k: string, v: string) => void memory.set(k, v),
    removeItem: async (k: string) => void memory.delete(k),
  },
}));

const INFLIGHT = "hybrid.healthkit.inflight";
const FAULTS = "hybrid.healthkit.faults";

/** A fresh module, i.e. a fresh launch — the module holds the stack and the
 *  settled faults in closure, and `settleOnce` runs at most once per process. */
async function launch() {
  vi.resetModules();
  return import("./healthkit-watchdog");
}

/** A promise plus the handle to settle it, so a test can hold a span open. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => memory.clear());

describe("what is in flight", () => {
  it("records the span while it runs and clears it when it returns", async () => {
    const { nativeSpan } = await launch();
    const seen: (string | null)[] = [];
    await nativeSpan("workouts", async () => void seen.push(memory.get(INFLIGHT) ?? null), undefined);
    expect(seen).toEqual(["workouts"]);
    expect(memory.get(INFLIGHT)).toBeUndefined();
  });

  it("nests as a path, deepest last", async () => {
    const { nativeSpan } = await launch();
    let inner: string | null = null;
    await nativeSpan(
      "workouts",
      () =>
        nativeSpan("stream-read", async () => void (inner = memory.get(INFLIGHT) ?? null), undefined),
      undefined,
    );
    expect(inner).toBe("workouts>stream-read");
  });

  it("clears the marker even when the span throws", async () => {
    const { nativeSpan } = await launch();
    await expect(
      nativeSpan("workouts", async () => {
        throw new Error("the store said no");
      }, undefined),
    ).rejects.toThrow();
    // A rejected promise is not a crash, so it must not leave a crash marker —
    // otherwise every ordinary HealthKit error would quarantine a span.
    expect(memory.get(INFLIGHT)).toBeUndefined();
  });

  it("HARD — a finishing span never removes another chain's frame", async () => {
    // THE BUG THIS FILE EXISTS FOR. Two independent chains overlap: the import
    // sheet's gate while the auto-import's foreground pull is still reading. A
    // popped stack deletes whatever frame is LAST, which is the other chain's, so
    // the call still running loses its marker — and if the process then dies, the
    // report names a call that already returned.
    const { nativeSpan } = await launch();
    const gate = deferred<void>();
    const read = deferred<void>();

    const a = nativeSpan("auth-status", () => gate.promise, undefined);
    const b = nativeSpan("workouts", () => read.promise, undefined);
    // Let both spans get their marker written before either finishes.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(memory.get(INFLIGHT)).toBe("auth-status>workouts");

    gate.resolve();
    await a;
    // `workouts` is STILL RUNNING. It must still be the marker on disk.
    expect(memory.get(INFLIGHT)).toBe("workouts");

    read.resolve();
    await b;
    expect(memory.get(INFLIGHT)).toBeUndefined();
  });
});

describe("a marker that outlived its process", () => {
  it("becomes a fault at the next launch, attributed to the deepest segment", async () => {
    memory.set(INFLIGHT, "workouts>stream-route");
    const { readHealthFaults } = await launch();
    // The call that was RUNNING is the deepest one; the path is how it got there.
    expect(await readHealthFaults()).toEqual({ "stream-route": 1 });
    // Consumed, so the same marker can't be counted twice.
    expect(memory.get(INFLIGHT)).toBeUndefined();
  });

  it("attributes a bare span with no path", async () => {
    memory.set(INFLIGHT, "auth-status");
    const { readHealthFaults } = await launch();
    expect(await readHealthFaults()).toEqual({ "auth-status": 1 });
  });

  it("reads the previous build's flat name as all three stream calls", async () => {
    // A phone that met the crash under the build that wrote one word for three
    // native calls is carrying that word right now. Without this the new
    // sub-spans each look untried and the new build re-runs what already killed
    // it.
    memory.set(INFLIGHT, "streams");
    const { readHealthFaults } = await launch();
    expect(await readHealthFaults()).toEqual({
      "stream-auth": 1,
      "stream-read": 1,
      "stream-route": 1,
    });
  });

  it("counts across launches rather than overwriting", async () => {
    memory.set(FAULTS, JSON.stringify({ "stream-route": 1 }));
    memory.set(INFLIGHT, "stream-route");
    const { readHealthFaults } = await launch();
    expect(await readHealthFaults()).toEqual({ "stream-route": 2 });
  });

  it("survives a corrupt record instead of taking the launch with it", async () => {
    memory.set(FAULTS, "{not json");
    memory.set(INFLIGHT, "workouts");
    const { readHealthFaults } = await launch();
    expect(await readHealthFaults()).toEqual({ workouts: 1 });
  });

  it("a clean launch reports nothing", async () => {
    const { readHealthFaults } = await launch();
    expect(await readHealthFaults()).toEqual({});
  });
});

describe("what a fault is allowed to change", () => {
  it("skips an OPTIONAL span that has been implicated, and returns the fallback", async () => {
    memory.set(INFLIGHT, "stream-route");
    const { nativeSpan } = await launch();
    let ran = false;
    const out = await nativeSpan(
      "stream-route",
      async () => {
        ran = true;
        return "read";
      },
      "skipped",
      { optional: true },
    );
    expect(ran).toBe(false);
    expect(out).toBe("skipped");
  });

  it("still runs a span the FEATURE needs, however often it has been implicated", async () => {
    // `auth`, `auth-status` and `workouts` are the import. Quarantining those
    // would not make the app safer, it would make the feature permanently dead —
    // and a leftover marker is not proof of a crash anyway (iOS terminating a
    // suspended app mid-read leaves an identical trace).
    memory.set(FAULTS, JSON.stringify({ "auth-status": 3, workouts: 3, auth: 3 }));
    const { nativeSpan } = await launch();
    for (const step of ["auth", "auth-status", "workouts"] as const) {
      let ran = false;
      await nativeSpan(step, async () => void (ran = true), undefined);
      expect(ran, `${step} must still run`).toBe(true);
    }
  });

  it("a try-anyway forgets only the spans it was asked about", async () => {
    memory.set(FAULTS, JSON.stringify({ "stream-route": 1, workouts: 2, streams: 1 }));
    const { readHealthFaults, forgetHealthFaults, STREAM_HEALTH_STEPS } = await launch();
    await readHealthFaults();
    await forgetHealthFaults(STREAM_HEALTH_STEPS);
    // The trace spans are cleared — including the previous build's flat name, or
    // the record would outlive its meaning — and the workouts fault is untouched.
    expect(await readHealthFaults()).toEqual({ workouts: 2 });
  });

  it("a forgotten optional span runs again", async () => {
    memory.set(INFLIGHT, "stream-route");
    const { nativeSpan, forgetHealthFaults, readHealthFaults, STREAM_HEALTH_STEPS } = await launch();
    await readHealthFaults();
    await forgetHealthFaults(STREAM_HEALTH_STEPS);
    let ran = false;
    await nativeSpan("stream-route", async () => void (ran = true), undefined, { optional: true });
    expect(ran).toBe(true);
  });
});
