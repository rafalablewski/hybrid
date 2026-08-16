import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE TAP PATH ASKS FOR THE WORKOUT TYPES AND NOTHING ELSE.
 *
 * The watch import worked, and the next build exited the app when an athlete
 * tapped it. The read behind that tap did not change between the two builds —
 * `readWorkout`, `workoutDistanceKm` and `queryRecentDeviceWorkouts` are
 * byte-identical across the commit — so the only new thing standing between the
 * tap and the list of workouts was a SECOND `requestAuthorization`, for the
 * stream types (route, cycling power, cycling cadence), fired immediately after
 * the first. There was nothing else there to be the cause.
 *
 * So the rule is: `requestDeviceReadAuth` — the one both device sheets call on
 * open — asks for WORKOUT_READ_TYPES only. STREAM_READ_TYPES is asked for at
 * the point of use, inside `readWorkoutStreams`, which runs after the sessions
 * have already landed and is the one span the watchdog can switch off for good.
 * The half that is not needed to import cannot be reached from the tap.
 *
 * This reads the source as TEXT, like design-tokens.test.ts and
 * commit-state.test.ts, because the thing worth pinning is the SHAPE of the
 * call rather than a value any unit test could observe: nothing in JS can catch
 * the failure this prevents, and nothing in this repo can run HealthKit.
 */

const SRC = readFileSync(join(__dirname, "healthkit.ts"), "utf8");

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

  it("the stream types are asked for at the point of use", () => {
    const lazy = body("ensureStreamAuth");
    expect(lazy).toContain("STREAM_READ_TYPES");
  });

  it("only the skippable span reaches the stream ask", () => {
    // `ensureStreamAuth` must be called from inside readWorkoutStreams' span and
    // nowhere else — a caller outside it would put a permission sheet back on a
    // path that cannot afford one.
    const calls = SRC.match(/ensureStreamAuth\(/g) ?? [];
    // One declaration, one call site.
    expect(calls.length).toBe(2);
    expect(body("readWorkoutStreams")).toContain("ensureStreamAuth(hk)");
  });

  it("the two old split entry points are gone", () => {
    // Their names are the regression: two requestAuthorization calls in a row,
    // at both call sites.
    expect(SRC).not.toMatch(/export async function requestWorkoutReadAuth/);
    expect(SRC).not.toMatch(/export async function requestStreamReadAuth/);
  });
});
