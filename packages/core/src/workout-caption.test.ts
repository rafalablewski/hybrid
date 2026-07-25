import { describe, it, expect } from "vitest";
import { workoutShareCaption } from "./workout-caption";

const t = (k: string) =>
  ({ "share.done": "done.", "share.tracked": "Tracked with HYBRID.", "share.firstWorkout": "My first HYBRID workout 💪", "summary.sets": "SETS", "share.workoutFallback": "Workout" })[k] ?? k;

describe("workoutShareCaption", () => {
  it("builds the caption both clients share", () => {
    expect(workoutShareCaption({ title: "Morning workout", minutes: 59, sets: 19, volume: 7100, headline: "🏆 Barbell Deadlift 100 kg" }, "kg", t))
      .toBe("💪 Morning workout — done.\n59 min – 19 sets – 7.1 t\n🏆 Barbell Deadlift 100 kg\nTracked with HYBRID.");
  });

  it("drops the clock segment rather than claiming 0 min", () => {
    expect(workoutShareCaption({ title: "W", minutes: 0, sets: 3, volume: 1000 }, "kg", t)).not.toContain("0 min");
  });

  it("leads with the first-workout line and omits an absent headline", () => {
    const out = workoutShareCaption({ title: "W", minutes: 10, sets: 3, volume: 1000, firstEver: true, headline: null }, "kg", t);
    expect(out.split("\n")[0]).toBe("My first HYBRID workout 💪");
    expect(out.split("\n")).toHaveLength(4);
  });

  it("falls back to a localized title when the workout is untitled", () => {
    expect(workoutShareCaption({ title: "", minutes: 5, sets: 1, volume: 100 }, "kg", t)).toContain("💪 Workout — done.");
  });
});
