import { describe, it, expect } from "vitest";
import {
  sanitizeMood,
  sanitizeTags,
  sanitizeNote,
  moodDef,
  tagLabelKey,
  hasNote,
  MAX_TAGS,
  MAX_NOTE_LEN,
} from "./notes";

describe("sanitizeMood", () => {
  it("accepts integers 1..4 and rejects everything else", () => {
    expect(sanitizeMood(1)).toBe(1);
    expect(sanitizeMood(4)).toBe(4);
    expect(sanitizeMood(0)).toBeNull();
    expect(sanitizeMood(5)).toBeNull();
    expect(sanitizeMood(2.5)).toBeNull();
    expect(sanitizeMood("3")).toBeNull();
    expect(sanitizeMood(null)).toBeNull();
  });
});

describe("sanitizeTags", () => {
  it("lower-cases, strips '#', keeps slug chars, de-dupes", () => {
    expect(sanitizeTags(["#PR", "pr", "Ni gg le!", "form"])).toEqual(["pr", "niggle", "form"]);
  });
  it("caps the count and ignores non-arrays / non-strings", () => {
    expect(sanitizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
    expect(sanitizeTags("pr")).toEqual([]);
    expect(sanitizeTags([1, 2, {}])).toEqual([]);
  });
});

describe("sanitizeNote", () => {
  it("trims, drops blanks, and caps the length", () => {
    expect(sanitizeNote("  legs fried  ")).toBe("legs fried");
    expect(sanitizeNote("   ")).toBeNull();
    expect(sanitizeNote(42)).toBeNull();
    expect(sanitizeNote("x".repeat(MAX_NOTE_LEN + 50))!.length).toBe(MAX_NOTE_LEN);
  });
});

describe("moodDef / tagLabelKey", () => {
  it("resolves a mood value to its emoji + tone, null otherwise", () => {
    expect(moodDef(1)?.tone).toBe("red");
    expect(moodDef(4)?.emoji).toBe("💪");
    expect(moodDef(null)).toBeNull();
    expect(moodDef(9)).toBeNull();
  });
  it("maps a known tag to an i18n key and a custom one to null", () => {
    expect(tagLabelKey("pr")).toBe("w.train.note.tag-pr");
    expect(tagLabelKey("whatever")).toBeNull();
  });
});

describe("hasNote", () => {
  it("is true when any of note/mood/tags carry content", () => {
    expect(hasNote({ note: "hi" })).toBe(true);
    expect(hasNote({ mood: 3 })).toBe(true);
    expect(hasNote({ tags: ["pr"] })).toBe(true);
    expect(hasNote({ note: "   ", mood: null, tags: [] })).toBe(false);
    expect(hasNote({})).toBe(false);
  });
});
