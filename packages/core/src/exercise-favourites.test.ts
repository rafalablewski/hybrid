import { describe, it, expect } from "vitest";
import {
  MAX_EXERCISE_FAVOURITES,
  exerciseFavouritesFull,
  isExerciseFavourite,
  normalizeExerciseFavourites,
  toggleExerciseFavourite,
} from "./exercise-favourites";

describe("normalizeExerciseFavourites", () => {
  it("keeps strings, trims them and drops blanks + non-strings", () => {
    expect(normalizeExerciseFavourites([" Back Squat ", "", 7, null, "Run"])).toEqual(["Back Squat", "Run"]);
  });

  it("de-duplicates case-insensitively, first spelling wins", () => {
    expect(normalizeExerciseFavourites(["Back Squat", "back squat"])).toEqual(["Back Squat"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: MAX_EXERCISE_FAVOURITES + 4 }, (_, i) => `Lift ${i}`);
    expect(normalizeExerciseFavourites(many)).toHaveLength(MAX_EXERCISE_FAVOURITES);
  });

  it("survives a corrupt stored value", () => {
    expect(normalizeExerciseFavourites(undefined)).toEqual([]);
    expect(normalizeExerciseFavourites({ nope: true })).toEqual([]);
  });
});

describe("toggleExerciseFavourite", () => {
  it("appends a new pin, so the rail keeps pin order", () => {
    expect(toggleExerciseFavourite(["Run"], "Deadlift")).toEqual(["Run", "Deadlift"]);
  });

  it("removes an existing pin, whatever the casing", () => {
    expect(toggleExerciseFavourite(["Run", "Deadlift"], "run")).toEqual(["Deadlift"]);
  });

  it("refuses a new pin at the cap rather than silently unpinning one", () => {
    const full = Array.from({ length: MAX_EXERCISE_FAVOURITES }, (_, i) => `Lift ${i}`);
    expect(exerciseFavouritesFull(full)).toBe(true);
    expect(toggleExerciseFavourite(full, "Deadlift")).toEqual(full);
    // …but unpinning still works at the cap.
    expect(toggleExerciseFavourite(full, "Lift 0")).toHaveLength(MAX_EXERCISE_FAVOURITES - 1);
  });

  it("ignores a blank name", () => {
    expect(toggleExerciseFavourite(["Run"], "   ")).toEqual(["Run"]);
  });
});

describe("isExerciseFavourite", () => {
  it("matches case-insensitively", () => {
    expect(isExerciseFavourite(["Back Squat"], "back squat")).toBe(true);
    expect(isExerciseFavourite(["Back Squat"], "Front Squat")).toBe(false);
  });
});
