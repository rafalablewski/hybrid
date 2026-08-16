import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO READ PATH ASKS FOR ANYTHING, AND NO READ RUNS ON OUR OWN SAY-SO.
 *
 * Two builds' worth of evidence, and it points one way. The watch import worked;
 * the next build added the stream half (a second `requestAuthorization` for the
 * route + cycling types, and the reads behind it) and the app started closing
 * when an athlete tapped import. The build after that moved the second ask off
 * the tap and down to its point of use — and the crash moved with it exactly:
 * the sheet opened, the list appeared, the sessions landed, and the process went
 * as the trace read started. Nothing in JS can catch that; a Swift abort takes
 * the process, so there is no exception, no rejected promise and no error
 * boundary between it and the athlete.
 *
 * So the rules this file pins are the ones that survive not knowing which native
 * call it is:
 *
 *  1. `requestDeviceReadAuth` — what both device sheets call on open — asks for
 *     WORKOUT_READ_TYPES and nothing else. That is the shape that has always
 *     worked.
 *  2. The stream types are asked for in `requestStreamReadAuth` and NOWHERE
 *     else, and no read path calls it. A permission sheet is raised by a tap on
 *     a control that says what it is for, never behind an import.
 *  3. Every read is gated on the STORE's answer (`storeHasAsked` →
 *     getRequestStatusForAuthorization), not on a flag this file wrote after
 *     calling requestAuthorization. The bridge silently drops identifiers it
 *     can't build, so those two claims come apart — and querying a type the
 *     store was never asked about is the library's own documented crash.
 *
 * This reads the source as TEXT, like design-tokens.test.ts and
 * commit-state.test.ts, because the thing worth pinning is the SHAPE of the
 * calls rather than a value any unit test could observe: nothing in this repo
 * can run HealthKit, and nothing in JS can observe the failure it prevents.
 */

const SRC = readFileSync(join(__dirname, "healthkit.ts"), "utf8");
/** Everything in the bridge that opens a permission sheet. */
const STREAM_ASKERS = ["connectHealthKit", "requestDeviceReadAuth", "requestStreamReadAuth"];
/** The screens that can reach the trace path at all. */
const SCREEN = (f: string) => readFileSync(join(__dirname, "..", "components", f), "utf8");

/** A function body, from its signature to the closing brace at column 0. */
function body(name: string): string {
  const m = SRC.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, "m"));
  expect(m, `${name} not found`).toBeTruthy();
  const from = m!.index!;
  return SRC.slice(from, SRC.indexOf("\n}\n", from));
}

describe("HealthKit authorization is split where the crash was", () => {
  it("the ask both device sheets make on open carries no stream types", () => {
    const ask = body("requestDeviceReadAuth");
    expect(ask).toContain("WORKOUT_READ_TYPES");
    expect(ask).not.toContain("STREAM_READ_TYPES");
  });

  it("the stream types are asked for in exactly one place", () => {
    expect(body("requestStreamReadAuth")).toContain("STREAM_READ_TYPES");
    // Three `requestAuthorization` call sites in the whole bridge: connect, the
    // device sheets' workout ask, and the stream ask. A fourth is a sheet
    // somebody didn't ask for.
    const asks = SRC.match(/requestAuthorization\(/g) ?? [];
    expect(asks.length).toBe(3);
    // And ONE of those three may name the series types. The connect sheet used
    // to include them so a later match wouldn't prompt — which put one of the
    // three calls the app may still be dying inside behind "Connect Apple
    // Health", a button pressed long before anybody wants a GPS track.
    const streamAsks = STREAM_ASKERS.filter((fn) => body(fn).includes("STREAM_READ_TYPES"));
    expect(streamAsks).toEqual(["requestStreamReadAuth"]);
  });

  it("no read path asks for a permission", () => {
    // The regression this replaces was named `ensureStreamAuth`: an ask called
    // from inside the stream read, which is what put a permission sheet on the
    // tail of every import.
    expect(SRC).not.toMatch(/ensureStreamAuth/);
    for (const fn of ["readWorkoutStreams", "readWorkouts", "refreshMatchedWorkouts", "readWindow"])
      expect(body(fn), `${fn} must not request authorization`).not.toContain("requestAuthorization");
  });

  it("the reads are gated on the store's own answer, not a flag of ours", () => {
    expect(body("storeHasAsked")).toContain("getRequestStatusForAuthorization");
    for (const fn of ["readWorkouts", "refreshMatchedWorkouts", "readWorkoutStreams"])
      expect(body(fn), `${fn} must gate on storeHasAsked`).toContain("storeHasAsked");
    // The flag that used to answer this question, gone rather than left to rot.
    expect(SRC).not.toMatch(/askedLevel|ASKED_KEY/);
  });

  it("the trace read is quarantined until it has returned once", () => {
    // The unattended pass may not be the first thing on a phone to meet that
    // native call — see `streamsProven`.
    expect(body("backfillWorkoutStreams")).toContain("streamsProven");
  });

  it("only the control that says what it does can take the first trace read", () => {
    // THE INVARIANT THIS WHOLE FIX RESTS ON, and it spans files, so it is
    // checked across them: every caller of the trace path other than the import
    // sheet's own trace row must be behind `streamsProven` — the flag set by a
    // read that has already come back on this phone. Otherwise the first
    // encounter with the call the app may still be dying inside happens on a
    // tap that never mentioned recordings (matching a workout), or on no tap at
    // all (a foreground sync).
    const match = SCREEN("device-match.tsx");
    expect(match).toContain("uploadWorkoutStreams");
    expect(match, "device-match must gate its upload on streamsProven").toContain("streamsProven");

    const sheet = SCREEN("device-import.tsx");
    // The sheet uploads in two places: automatically once proven, and from the
    // trace row. The automatic one is the guarded one.
    expect(sheet).toMatch(/trace\.granted && trace\.proven/);
    // The stream ask is reached from the trace row and nowhere else in the app.
    const askers = ["device-import.tsx", "device-match.tsx"].filter((f) =>
      SCREEN(f).includes("requestStreamReadAuth"),
    );
    expect(askers).toEqual(["device-import.tsx"]);
  });

  it("the stream spans are named one native call at a time", () => {
    // "streams" named three different calls, so a marker left on disk could not
    // say which of them the process died inside. Each has its own name now.
    for (const step of ["stream-auth", "stream-read", "stream-route"])
      expect(SRC, `${step} span missing`).toContain(`"${step}"`);
    expect(SRC).not.toMatch(/nativeSpan\(\s*"streams"/);
  });

  it("the two old split entry points are gone", () => {
    // Their names are the regression: two requestAuthorization calls in a row,
    // at both call sites.
    expect(SRC).not.toMatch(/export async function requestWorkoutReadAuth/);
  });
});
