import { describe, it, expect, beforeEach } from "vitest";
import { clearPersonSeeds, peekPerson, seedPerson, PERSON_SEED_MAX } from "./person-seed";

beforeEach(clearPersonSeeds);

describe("person seed", () => {
  it("hands a row's identity to the page it opens", () => {
    seedPerson({ handle: "ada", displayName: "Ada Ruiz", avatarUrl: "a.png", coachVerified: true });
    expect(peekPerson("ada")).toEqual({ handle: "ada", displayName: "Ada Ruiz", avatarUrl: "a.png", coachVerified: true });
  });

  it("is case- and whitespace-insensitive, because handles arrive from anywhere", () => {
    seedPerson({ handle: "Ada" });
    expect(peekPerson(" ADA ")).not.toBeNull();
  });

  it("peeking does not consume — opening the same person twice paints the same", () => {
    seedPerson({ handle: "ada", displayName: "Ada Ruiz" });
    expect(peekPerson("ada")?.displayName).toBe("Ada Ruiz");
    expect(peekPerson("ada")?.displayName).toBe("Ada Ruiz");
  });

  it("returns null for someone never seeded — a cold link still fetches", () => {
    expect(peekPerson("nobody")).toBeNull();
  });

  it("ignores an empty handle rather than seeding a blank entry", () => {
    seedPerson({ handle: "" });
    seedPerson({ handle: "   " });
    expect(peekPerson("")).toBeNull();
  });

  it("normalises the missing fields, so the page never paints `undefined`", () => {
    seedPerson({ handle: "bo" });
    expect(peekPerson("bo")).toEqual({ handle: "bo", displayName: null, avatarUrl: null, coachVerified: false });
  });

  it("is bounded — a long feed scroll cannot grow it forever", () => {
    for (let i = 0; i < PERSON_SEED_MAX + 15; i++) seedPerson({ handle: `a${i}` });
    expect(peekPerson("a0")).toBeNull();
    expect(peekPerson(`a${PERSON_SEED_MAX + 14}`)).not.toBeNull();
  });

  it("re-seeding keeps a person alive against the bound", () => {
    seedPerson({ handle: "ada" });
    for (let i = 0; i < PERSON_SEED_MAX - 1; i++) seedPerson({ handle: `f${i}` });
    seedPerson({ handle: "ada", displayName: "Ada Ruiz" }); // opened again
    for (let i = 0; i < PERSON_SEED_MAX - 1; i++) seedPerson({ handle: `g${i}` });
    expect(peekPerson("ada")?.displayName).toBe("Ada Ruiz");
  });
});
