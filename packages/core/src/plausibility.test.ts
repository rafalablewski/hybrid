import { describe, expect, it } from "vitest";
import {
  allowsTyping,
  checkEffort,
  checkSet,
  distanceBounds,
  judge,
  judgeText,
  keep,
  loadBounds,
  repsBounds,
  signalBounds,
  BODY_MASS_BOUNDS,
  PLAN_MAX_BOUNDS,
  RPE_BOUNDS,
  SIGNAL_FALLBACK,
} from "./plausibility";
import { foodLogSignals } from "./engines/nutrition";
import { sanitizeSessionBlocks } from "./session-edit";
import type { SessionBlock } from "./engines/session";

describe("judge — the two tiers", () => {
  const b = { min: 0, max: 100, softMax: 50, unit: "x" };

  it("passes the ordinary, questions the improbable, refuses the impossible", () => {
    expect(judge(10, b)).toBe("ok");
    expect(judge(60, b)).toBe("check");
    expect(judge(200, b)).toBe("refuse");
  });

  it("refuses anything that isn't a finite number", () => {
    // A NaN in a stored column is the same class of problem as a 70 000 kg
    // bench and travels further — every average it touches becomes NaN.
    expect(judge(NaN, b)).toBe("refuse");
    expect(judge(Infinity, b)).toBe("refuse");
    expect(judge("50", b)).toBe("refuse");
    expect(judge(null, b)).toBe("refuse");
  });

  it("keeps a storable value and DROPS an impossible one — never clamps", () => {
    expect(keep(60, b)).toBe(60);
    // 100 is not more true than 200; a made-up number is worse than an absent
    // one because nothing downstream can tell it was invented.
    expect(keep(200, b)).toBeNull();
  });

  it("treats a blank string as fine — an empty field is not a wrong one", () => {
    expect(judgeText("", b)).toBe("ok");
    expect(judgeText(undefined, b)).toBe("ok");
    expect(judgeText("200", b)).toBe("refuse");
    // The app ships in Polish and German, where 5,2 is how 5.2 is written.
    expect(judgeText("60,5", b)).toBe("check");
  });
});

describe("load — judged against the implement", () => {
  it("reads the same number differently on a barbell and a kettlebell", () => {
    expect(judge(120, loadBounds("Back Squat"))).toBe("ok");
    expect(judge(120, loadBounds("Dumbbell Bench Press"))).toBe("check");
    expect(judge(150, loadBounds("KB Swing"))).toBe("refuse");
  });

  it("refuses the fat-finger and keeps the real outlier", () => {
    expect(judge(70000, loadBounds("Bench Press"))).toBe("refuse");
    // A 500 kg leg press is a real thing somebody does.
    expect(judge(500, loadBounds("Leg Press"))).not.toBe("refuse");
  });

  it("judges ADDED weight on a bodyweight lift, not a barbell's ceiling", () => {
    // The field holds the belt, not the athlete: 400 kg hanging off a pull-up
    // belt is nobody, even though 400 on a bar is merely strong.
    expect(judge(40, loadBounds("Weighted Pull-Up"))).toBe("ok");
    expect(judge(400, loadBounds("Weighted Pull-Up"))).toBe("refuse");
  });

  it("gives an unknown lift the LOOSEST bound, never a looser one", () => {
    expect(judge(300, loadBounds("Zercher Something"))).toBe("ok");
    expect(judge(70000, loadBounds("Zercher Something"))).toBe("refuse");
  });
});

describe("reps — the field does not always hold reps", () => {
  it("counts reps for a rep-counted lift", () => {
    expect(judge(8, repsBounds("Back Squat"))).toBe("ok");
    expect(judge(300, repsBounds("Back Squat"))).toBe("check");
    expect(judge(5000, repsBounds("Back Squat"))).toBe("refuse");
  });

  it("counts SECONDS for a hold — a 90-second plank is not 90 reps", () => {
    expect(judge(90, repsBounds("Plank"))).toBe("ok");
    expect(judge(90, repsBounds("Back Squat"))).toBe("ok");
    // Two hours is a forgotten timer, not a hold.
    expect(judge(9000, repsBounds("Plank"))).toBe("refuse");
  });
});

describe("checkSet — the PAIR, not the parts", () => {
  it("refuses a load × reps implying a max past what the implement holds", () => {
    // 60 kg and 40 reps each pass their own DUMBBELL bound. Together they imply
    // a 233 kg per-bell max — a reps field with a load typed into it.
    expect(judge(60, loadBounds("Dumbbell Bench Press"))).toBe("ok");
    expect(judge(40, repsBounds("Dumbbell Bench Press"))).toBe("ok");
    expect(checkSet("Dumbbell Bench Press", "60", "40")).toBe("refuse");
  });

  it("questions — not refuses — a pair that is merely absurd", () => {
    // 200 kg × 60 implies a 600 kg squat. Nobody has done it, but calling it
    // impossible would be this file asserting physiology it cannot know, and
    // the cost of being wrong is deleting a real athlete's real set.
    expect(checkSet("Back Squat", "200", "60")).toBe("check");
  });

  it("leaves ordinary and heroic sets alone", () => {
    expect(checkSet("Back Squat", "100", "5")).toBe("ok");
    expect(checkSet("Back Squat", "300", "3")).toBe("ok"); // strong, not wrong
  });

  it("has no opinion about a hold's load × seconds", () => {
    // A plate on the back of a plank for 60 s has no meaningful one-rep max.
    expect(checkSet("Plank", "40", "60")).toBe("ok");
  });

  it("still refuses on either half alone", () => {
    expect(checkSet("Bench Press", "70000", "5")).toBe("refuse");
    expect(checkSet("Bench Press", "80", "99999")).toBe("refuse");
  });
});

describe("distance — the discipline decides what far means", () => {
  it("refuses the swim unit slip that a shared bound would wave through", () => {
    // 5 200 typed into a km field is 5.2 km in metres, and pool distances ARE
    // quoted in metres everywhere else in the product.
    expect(judge(5200, distanceBounds("swimming"))).toBe("refuse");
    expect(judge(5.2, distanceBounds("swimming"))).toBe("ok");
  });

  it("lets a real ultra and a real ride through", () => {
    expect(judge(160, distanceBounds("running"))).toBe("check");
    expect(judge(500, distanceBounds("running"))).toBe("refuse");
    expect(judge(400, distanceBounds("cycling"))).toBe("check");
  });

  it("refuses a swim longer than anyone has swum, at any tier", () => {
    expect(judge(120, distanceBounds("swimming"))).toBe("refuse");
  });
});

describe("checkEffort — the speed sanity check", () => {
  it("refuses a distance and a time that cannot both be true", () => {
    // 10 km and 5 min are each perfectly ordinary figures.
    expect(checkEffort({ discipline: "running", distanceKm: 10, minutes: 5 })).toBe("refuse");
    expect(checkEffort({ discipline: "running", distanceKm: 10, minutes: 50 })).toBe("ok");
  });

  it("questions a pace nobody has sustained, which the hard bound cannot see", () => {
    // 10 km in 25 min is 6.7 m/s — FASTER than the 10 000 m world record. The
    // refusal sits at sprint speed (a 100 m really does average 10 m/s), so
    // only the soft tier can catch this one.
    expect(checkEffort({ discipline: "running", distanceKm: 10, minutes: 25 })).toBe("check");
    expect(checkEffort({ discipline: "running", distanceKm: 10, minutes: 40 })).toBe("ok");
  });

  it("holds each discipline to its own ceiling", () => {
    // 40 km/h is a hard ride and an impossible swim.
    const fast = { distanceKm: 40, minutes: 60 };
    expect(checkEffort({ ...fast, discipline: "cycling" })).toBe("ok");
    expect(checkEffort({ ...fast, discipline: "swimming" })).toBe("refuse");
  });

  it("says nothing when only half the pair is there", () => {
    expect(checkEffort({ discipline: "running", distanceKm: 10 })).toBe("ok");
    expect(checkEffort({ discipline: "running", minutes: 5 })).toBe("ok");
    expect(checkEffort({})).toBe("ok");
  });

  it("prefers the device's exact seconds when it has them", () => {
    expect(checkEffort({ discipline: "running", distanceKm: 10, seconds: 300 })).toBe("refuse");
  });
});

describe("the body and the models it feeds", () => {
  it("has a FLOOR on bodyweight, which is the half that was missing", () => {
    // A near-zero bodyweight silently zeroes the effective load of every
    // pull-up, dip and assisted rep the athlete has ever logged.
    expect(judge(0.5, BODY_MASS_BOUNDS)).toBe("refuse");
    expect(judge(80, BODY_MASS_BOUNDS)).toBe("ok");
    expect(judge(250, BODY_MASS_BOUNDS)).toBe("check");
    expect(judge(900, BODY_MASS_BOUNDS)).toBe("refuse");
  });

  it("refuses a typed 1RM no barbell has held", () => {
    // This number is MULTIPLIED into every working set a percent plan writes.
    expect(judge(99999, PLAN_MAX_BOUNDS)).toBe("refuse");
    expect(judge(505, PLAN_MAX_BOUNDS)).toBe("check");
    expect(judge(140, PLAN_MAX_BOUNDS)).toBe("ok");
  });

  it("bounds every signal kind, and gives an unknown one the fallback", () => {
    expect(judge(9999, signalBounds("hrv"))).toBe("refuse");
    expect(judge(45, signalBounds("hrv"))).toBe("ok");
    expect(judge(2, signalBounds("restingHr"))).toBe("refuse");
    expect(signalBounds("somethingNew")).toBe(SIGNAL_FALLBACK);
    // Even the fallback stops a sentinel value from becoming a baseline.
    expect(judge(1e18, signalBounds("somethingNew"))).toBe("refuse");
  });

  it("keeps RPE on its scale with no soft band — an 11 is a mis-tap", () => {
    expect(judge(8, RPE_BOUNDS)).toBe("ok");
    expect(judge(10, RPE_BOUNDS)).toBe("ok");
    expect(judge(11, RPE_BOUNDS)).toBe("refuse");
  });
});

describe("allowsTyping — a field being typed into", () => {
  const b = { min: 0, max: 1500, unit: "kg" };

  it("allows the states on the way to a value", () => {
    expect(allowsTyping("", b)).toBe(true);
    expect(allowsTyping("7", b)).toBe(true);
    expect(allowsTyping("700", b)).toBe(true);
    // A decimal point has to be typeable before the digit after it exists.
    expect(allowsTyping("70.", b)).toBe(true);
    expect(allowsTyping("70,", b)).toBe(true);
  });

  it("refuses the keystroke that puts it past the ceiling", () => {
    expect(allowsTyping("7000", b)).toBe(false);
    expect(allowsTyping("70000", b)).toBe(false);
  });

  it("refuses junk that is not on the way to a number", () => {
    expect(allowsTyping("12kg", b)).toBe(false);
  });
});

describe("foodLogSignals — a diary entry cannot move a baseline", () => {
  it("drops a per-100 g panel filed as per-serving", () => {
    // A serving count of 400 on a 1 000 kcal food is 400 000 kcal, and these
    // rows are Signals: one bad log would redefine the athlete's normal.
    const out = foodLogSignals({ kcal: 1000, protein: 50, carbs: 100, fat: 30 }, 400);
    expect(out.find((r) => r.kind === "energyIntake")).toBeUndefined();
  });

  it("leaves a real meal alone, including a big one", () => {
    const out = foodLogSignals({ kcal: 950, protein: 55, carbs: 90, fat: 38 }, 2);
    expect(out.find((r) => r.kind === "energyIntake")!.value).toBe(1900);
    expect(out.find((r) => r.kind === "protein")!.value).toBe(110);
  });
});

/* ── the write path, end to end ──────────────────────────────────────────── */

const blocks = (b: unknown): SessionBlock[] | null => sanitizeSessionBlocks(b);

describe("sanitizeSessionBlocks — the one definition of a storable workout", () => {
  it("drops a 70 000 kg bench press and KEEPS the workout", () => {
    const out = blocks([
      { kind: "strength", name: "Bench Press", sets: [{ load: "70000", reps: "5" }, { load: "80", reps: "5" }] },
    ]);
    const sets = (out![0] as unknown as { sets: { load: string; reps: string }[] }).sets;
    // The impossible figure goes; the set, the second set and the session stay.
    expect(sets[0]!.load).toBe("");
    expect(sets[0]!.reps).toBe("5");
    expect(sets[1]!.load).toBe("80");
  });

  it("drops a 5 200 km swim without touching the time beside it", () => {
    const out = blocks([
      { kind: "cardio", name: "Swimming", discipline: "swimming", distance: 5200, minutes: 45 },
    ]);
    const b = out![0] as { distance?: number; minutes?: number };
    expect(b.distance).toBeUndefined();
    expect(b.minutes).toBe(45);
  });

  it("drops a distance whose PACE is impossible, even though both figures pass", () => {
    const out = blocks([{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 5 }]);
    const b = out![0] as { distance?: number; minutes?: number };
    expect(b.distance).toBeUndefined();
    expect(b.minutes).toBe(5);
  });

  it("leaves a real hard session completely alone", () => {
    const input = [
      { kind: "strength", name: "Back Squat", sets: [{ load: "220", reps: "3", rpe: "9" }] },
      { kind: "cardio", name: "Running", discipline: "running", distance: 21.1, minutes: 85, elevation: 300 },
    ];
    expect(blocks(input)).toEqual(input);
  });

  it("still refuses a malformed SHAPE outright", () => {
    expect(blocks("nope")).toBeNull();
    expect(blocks([{ kind: "strength", sets: [] }])).toBeNull(); // no name
    expect(blocks([{ kind: "strength", name: "X", sets: "no" }])).toBeNull();
  });

  it("does not let a text field smuggle a number past the bound", () => {
    const out = blocks([
      { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5", rpe: "99", vel: "50" }] },
    ]);
    const set = (out![0] as unknown as { sets: Record<string, unknown>[] }).sets[0]!;
    expect(set.rpe).toBeUndefined();
    expect(set.vel).toBeUndefined();
  });

  it("preserves the text a value was typed as", () => {
    // "2.50" must not silently become "2.5" — the athlete typed a precision.
    const out = blocks([{ kind: "strength", name: "Back Squat", sets: [{ load: "102.50", reps: "5" }] }]);
    expect((out![0] as unknown as { sets: { load: string }[] }).sets[0]!.load).toBe("102.50");
  });
});
