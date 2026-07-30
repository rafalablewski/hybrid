import { describe, expect, it } from "vitest";
import {
  editableBlockFields,
  sanitizeSessionBlocks,
  sessionEditDirty,
  sessionEditDraft,
  sessionEditPatch,
} from "./session-edit";
import type { LoggedSession } from "./engines/session";

const swim = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Swimming",
  startedAt: "2026-07-30T16:00:00.000Z",
  completedAt: "2026-07-30T16:02:00.000Z",
  blocks: [{ kind: "cardio", name: "Swimming", discipline: "swimming", minutes: 2, stroke: "Free" }],
  ...over,
});

const lift = (): LoggedSession => ({
  id: "s2",
  title: "Push day",
  startedAt: "2026-07-28T10:00:00.000Z",
  completedAt: "2026-07-28T11:00:00.000Z",
  blocks: [
    {
      kind: "strength",
      name: "Bench Press",
      group: "A",
      sets: [
        { load: "60", reps: "5", role: "warmup" },
        { load: "80", reps: "5", rest: 120, vel: "0.42" },
        { load: "80", reps: "3" },
      ],
    },
  ],
});

describe("sessionEditDraft", () => {
  it("holds distance in the sport's own unit", () => {
    const d = sessionEditDraft(swim({ blocks: [{ kind: "cardio", name: "Swimming", distance: 0.5, minutes: 20 }] }));
    expect(d.blocks[0]!.distance).toBe("500");
    expect(d.blocks[0]!.minutes).toBe("20");
  });

  it("leaves an unlogged figure blank rather than zero", () => {
    const d = sessionEditDraft(swim());
    expect(d.blocks[0]!.distance).toBe("");
    expect(d.blocks[0]!.rpe).toBe("");
  });
});

describe("sessionEditPatch", () => {
  it("adds the distance that never got typed, in the sport's unit", () => {
    const s = swim();
    const d = sessionEditDraft(s);
    d.blocks[0]!.distance = "30";
    const out = sessionEditPatch(s, d);
    expect(out.blocks[0]).toMatchObject({ kind: "cardio", distance: 0.03, minutes: 2 });
  });

  it("keeps everything the sheet never showed", () => {
    const s = swim();
    const d = sessionEditDraft(s);
    d.blocks[0]!.minutes = "3";
    const b = sessionEditPatch(s, d).blocks[0]!;
    expect(b.kind === "cardio" && b.stroke).toBe("Free");
    expect(b.kind === "cardio" && b.discipline).toBe("swimming");
  });

  it("clears a figure the athlete blanked, leaving no key behind", () => {
    const s = swim({ blocks: [{ kind: "cardio", name: "Swimming", distance: 0.5, minutes: 20 }] });
    const d = sessionEditDraft(s);
    d.blocks[0]!.distance = "";
    const b = sessionEditPatch(s, d).blocks[0]!;
    expect("distance" in b).toBe(false);
    expect(b.kind === "cardio" && b.minutes).toBe(20);
  });

  it("edits a set's load and reps while its role, rest and velocity survive", () => {
    const s = lift();
    const d = sessionEditDraft(s);
    d.blocks[0]!.sets[1]!.load = "85";
    const b = sessionEditPatch(s, d).blocks[0]!;
    expect(b.kind === "strength" && b.sets[1]).toMatchObject({ load: "85", reps: "5", rest: 120, vel: "0.42" });
    expect(b.kind === "strength" && b.sets[0]!.role).toBe("warmup");
    expect(b.kind === "strength" && b.group).toBe("A");
  });

  it("deletes an emptied set without shifting the rest onto the wrong original", () => {
    const s = lift();
    const d = sessionEditDraft(s);
    // Empty the MIDDLE set — the one carrying the measured rest + velocity.
    d.blocks[0]!.sets[1]!.load = "";
    d.blocks[0]!.sets[1]!.reps = "";
    const b = sessionEditPatch(s, d).blocks[0]!;
    expect(b.kind === "strength" && b.sets).toHaveLength(2);
    expect(b.kind === "strength" && b.sets[0]).toMatchObject({ load: "60", reps: "5", role: "warmup" });
    // The survivor is the THIRD set — plain, and it must not inherit set 2's rest.
    expect(b.kind === "strength" && b.sets[1]).toMatchObject({ load: "80", reps: "3" });
    expect(b.kind === "strength" && "rest" in b.sets[1]!).toBe(false);
  });

  it("leaves a block alone when the draft no longer lines up with the session", () => {
    const s = lift();
    const d = sessionEditDraft(s);
    d.blocks[0]!.name = "Overhead Press";
    d.blocks[0]!.sets[0]!.load = "999";
    expect(sessionEditPatch(s, d).blocks[0]).toBe(s.blocks[0]);
  });

  it("falls back to the stored title when the field is emptied", () => {
    const s = swim();
    const d = sessionEditDraft(s);
    d.title = "   ";
    expect(sessionEditPatch(s, d).title).toBe("Swimming");
  });
});

describe("load units", () => {
  it("shows and stores loads in the athlete's own unit", () => {
    const s = lift();
    const d = sessionEditDraft(s, { units: "lb" });
    // 80 kg round-trips as pounds on screen…
    expect(d.blocks[0]!.sets[1]!.load).toBe("176");
    d.blocks[0]!.sets[1]!.load = "185";
    const b = sessionEditPatch(s, d, { units: "lb" }).blocks[0]!;
    // …and comes back as kg in storage.
    expect(b.kind === "strength" && Number(b.sets[1]!.load)).toBeCloseTo(83.91, 1);
    // An untouched lb draft is not a change.
    expect(sessionEditDirty(s, sessionEditDraft(s, { units: "lb" }), { units: "lb" })).toBe(false);
  });
});

describe("sessionEditDirty", () => {
  it("is false for an untouched draft and true once a figure changes", () => {
    const s = swim();
    const d = sessionEditDraft(s);
    expect(sessionEditDirty(s, d)).toBe(false);
    d.blocks[0]!.distance = "30";
    expect(sessionEditDirty(s, d)).toBe(true);
  });
});

describe("editableBlockFields", () => {
  it("offers no distance for a timed-only sport", () => {
    expect(editableBlockFields({ kind: "cardio", name: "Judo" }).distance).toBe(false);
    expect(editableBlockFields({ kind: "cardio", name: "Running" }).distance).toBe(true);
  });

  it("labels a swim in metres and a run in km", () => {
    expect(editableBlockFields({ kind: "cardio", name: "Swimming" }).distanceUnit).toBe("m");
    expect(editableBlockFields({ kind: "cardio", name: "Running" }).distanceUnit).toBe("km");
  });

  it("hides climb for a pool swim but never strands a value already logged", () => {
    expect(editableBlockFields({ kind: "cardio", name: "Swimming" }).elevation).toBe(false);
    expect(editableBlockFields({ kind: "cardio", name: "Swimming", elevation: 4 }).elevation).toBe(true);
  });

  it("gives conditioning rounds and strength sets", () => {
    expect(editableBlockFields({ kind: "conditioning", name: "EMOM" }).rounds).toBe(true);
    expect(editableBlockFields({ kind: "strength", name: "Back Squat" }).sets).toBe(true);
  });
});

describe("sanitizeSessionBlocks", () => {
  it("passes a clean edit through", () => {
    const out = sanitizeSessionBlocks([
      { kind: "cardio", name: "Swimming", discipline: "swimming", distance: 0.03, minutes: 2, stroke: "Free" },
      { kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5", role: "working", rest: 120 }] },
    ]);
    expect(out).toEqual([
      { kind: "cardio", name: "Swimming", discipline: "swimming", distance: 0.03, minutes: 2, stroke: "Free" },
      { kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5", rest: 120, role: "working" }] },
    ]);
  });

  it("refuses anything that isn't a block list", () => {
    expect(sanitizeSessionBlocks(null)).toBeNull();
    expect(sanitizeSessionBlocks("blocks")).toBeNull();
    expect(sanitizeSessionBlocks([{ kind: "nonsense", name: "x" }])).toBeNull();
    expect(sanitizeSessionBlocks([{ kind: "cardio" }])).toBeNull();
  });

  it("drops out-of-range figures and unknown keys instead of storing them", () => {
    const out = sanitizeSessionBlocks([
      { kind: "cardio", name: "Running", distance: 5000, minutes: 30, rpe: 99, sneaky: "<script>" },
    ]);
    expect(out).toEqual([{ kind: "cardio", name: "Running", minutes: 30 }]);
  });

  it("drops a blank set rather than storing an empty row", () => {
    const out = sanitizeSessionBlocks([{ kind: "strength", name: "Squat", sets: [{ load: "", reps: "" }, { load: "100", reps: "3" }] }]);
    expect(out).toEqual([{ kind: "strength", name: "Squat", sets: [{ load: "100", reps: "3" }] }]);
  });
});
