import { describe, it, expect, afterEach } from "vitest";
import { GYM_EXERCISES } from "./exercise-db";
import {
  exerciseMedia,
  hasExerciseMedia,
  mediaSlot,
  registerSketchMedia,
  resetSketchMedia,
  setExerciseMediaCatalog,
  resetExerciseMediaCatalog,
  sketchBrief,
  sketchCoverage,
  sketchShotList,
} from "./exercise-media";

afterEach(() => {
  resetSketchMedia();
  resetExerciseMediaCatalog();
});

describe("exercise media", () => {
  it("resolves a placeholder with a procedural fallback for every gym exercise", () => {
    for (const e of GYM_EXERCISES) {
      const m = exerciseMedia(e.name);
      expect(m.status, e.name).toBe("pending");
      expect(m.asset, e.name).toBeNull();
      expect(m.source, e.name).toBeNull();
      expect(m.fallback, e.name).not.toBeNull();
      expect(m.slot, e.name).toMatch(/^[a-z0-9-]+$/);
      expect(m.archetype, e.name).not.toBeNull();
      expect(m.alt, e.name).toBe(e.name);
    }
  });

  it("never returns null — an unknown name still resolves, with no demo at all", () => {
    const m = exerciseMedia("Interpretive Dance");
    expect(m.status).toBe("pending");
    expect(m.asset).toBeNull();
    expect(m.fallback).toBeNull();
    expect(m.archetype).toBeNull();
    expect(m.slot).toBe("interpretive-dance");
  });

  it("canonicalizes an aliased name to the DB entry and its slot", () => {
    const m = exerciseMedia("bench press");
    expect(m.name).toBe("Bench Press");
    expect(m.slot).toBe("bench-press");
  });

  it("makes file-safe slots", () => {
    expect(mediaSlot("Back Squat")).toBe("back-squat");
    expect(mediaSlot("Seesaw KB Press")).toBe("seesaw-kb-press");
    expect(mediaSlot("Farmer's Carry")).toBe("farmers-carry");
    expect(mediaSlot("Pull-Up")).toBe("pull-up");
  });

  it("returns a registered sketch for the exact lift", () => {
    registerSketchMedia({ "Back Squat": { kind: "loop", frames: ["a.webp"], cycleMs: 2000 } });
    const m = exerciseMedia("Back Squat");
    expect(m.status).toBe("drawn");
    expect(m.source).toBe("sketch");
    expect(m.asset).toEqual({ kind: "loop", frames: ["a.webp"], cycleMs: 2000 });
    expect(hasExerciseMedia("Back Squat")).toBe(true);
    // its neighbours are untouched
    expect(exerciseMedia("Front Squat").status).toBe("pending");
  });

  it("falls back to an archetype stand-in, and the exact drawing wins over it", () => {
    registerSketchMedia({ squat: { kind: "still", src: "pattern-squat.png" } });
    const stand = exerciseMedia("Front Squat");
    expect(stand.status).toBe("pattern");
    expect(stand.source).toBe("pattern");
    expect(stand.asset).toEqual({ kind: "still", src: "pattern-squat.png" });

    registerSketchMedia({ "Front Squat": { kind: "still", src: "front-squat.png" } });
    const exact = exerciseMedia("Front Squat");
    expect(exact.status).toBe("drawn");
    expect(exact.source).toBe("sketch");
    expect(exact.asset).toEqual({ kind: "still", src: "front-squat.png" });
  });

  it("builds the right asset kind from an admin library row, and outranks a sketch", () => {
    registerSketchMedia({ "Back Squat": { kind: "still", src: "sketch.png" } });
    setExerciseMediaCatalog([
      { name: "Back Squat", videoUrl: "https://cdn/back-squat.mp4", thumbUrl: "https://cdn/back-squat.png" },
      { name: "Deadlift", videoUrl: "https://cdn/deadlift.webp" },
      { name: "Bench Press", videoUrl: "https://youtube.com/watch?v=abc" },
      { name: "Overhead Press", thumbUrl: "https://cdn/ohp.png" },
      { name: "Hip Thrust", videoUrl: "   " },
    ]);

    const squat = exerciseMedia("Back Squat");
    expect(squat.source).toBe("library");
    expect(squat.asset).toEqual({ kind: "clip", src: "https://cdn/back-squat.mp4", poster: "https://cdn/back-squat.png" });

    expect(exerciseMedia("Deadlift").asset).toEqual({ kind: "loop", frames: ["https://cdn/deadlift.webp"], cycleMs: 2200, poster: undefined });
    expect(exerciseMedia("Bench Press").asset).toEqual({ kind: "link", href: "https://youtube.com/watch?v=abc", poster: undefined });
    expect(exerciseMedia("Overhead Press").asset).toEqual({ kind: "still", src: "https://cdn/ohp.png" });
    // an empty video URL is not media
    expect(exerciseMedia("Hip Thrust").status).toBe("pending");
  });

  it("resets the library overlay", () => {
    setExerciseMediaCatalog([{ name: "Back Squat", thumbUrl: "https://cdn/x.png" }]);
    expect(hasExerciseMedia("Back Squat")).toBe(true);
    resetExerciseMediaCatalog();
    expect(hasExerciseMedia("Back Squat")).toBe(false);
  });
});

describe("the illustrator's brief", () => {
  it("lists every gym lift once, with a unique slot", () => {
    const rows = sketchShotList();
    expect(rows.length).toBe(GYM_EXERCISES.length);
    expect(new Set(rows.map((r) => r.slot)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
  });

  it("groups the shot list by archetype so one sitting covers a pattern", () => {
    const archetypes = sketchShotList().map((r) => r.archetype);
    expect([...archetypes].sort((a, b) => a.localeCompare(b))).toEqual(archetypes);
  });

  it("counts coverage, with a pattern stand-in worth half a drawing", () => {
    const empty = sketchCoverage();
    expect(empty.total).toBe(GYM_EXERCISES.length);
    expect(empty.pending).toBe(empty.total);
    expect(empty.pct).toBe(0);
    expect(empty.byArchetype.reduce((n, a) => n + a.total, 0)).toBe(empty.total);

    registerSketchMedia({ squat: { kind: "still", src: "s.png" } });
    const withPattern = sketchCoverage();
    expect(withPattern.pattern).toBeGreaterThan(0);
    expect(withPattern.drawn).toBe(0);
    expect(withPattern.pending).toBe(withPattern.total - withPattern.pattern);
    expect(withPattern.pct).toBe(Math.round((withPattern.pattern / 2 / withPattern.total) * 100));

    registerSketchMedia({ "Back Squat": { kind: "still", src: "bs.png" } });
    expect(sketchCoverage().drawn).toBe(1);
  });

  it("writes a brief of what's still to draw, keyed by delivery slot", () => {
    const before = sketchBrief();
    expect(before).toContain("slot,name,archetype,equipment,measure");
    expect(before).toContain("back-squat,Back Squat,squat,barbell,reps");

    registerSketchMedia({ "Back Squat": { kind: "still", src: "bs.png" } });
    const after = sketchBrief();
    expect(after).not.toContain("back-squat,Back Squat,");
    expect(after.split("\n").length).toBe(before.split("\n").length - 1);
  });
});
