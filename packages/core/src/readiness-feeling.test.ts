import { describe, it, expect } from "vitest";
import { checkinEmoji, checkinRating, feelingFromRating, READINESS_EMOJI } from "./readiness-feeling";

describe("readiness-feeling", () => {
  it("round-trips the picker's four levels to their emoji", () => {
    // The quick picker writes all four sub-scores equal to the level rating.
    expect(checkinEmoji({ energy: 5, sleep: 5, soreness: 5, mood: 5 })).toBe(READINESS_EMOJI.primed);
    expect(checkinEmoji({ energy: 4, sleep: 4, soreness: 4, mood: 4 })).toBe(READINESS_EMOJI.good);
    expect(checkinEmoji({ energy: 3, sleep: 3, soreness: 3, mood: 3 })).toBe(READINESS_EMOJI.flat);
    expect(checkinEmoji({ energy: 2, sleep: 2, soreness: 2, mood: 2 })).toBe(READINESS_EMOJI.wrecked);
  });

  it("averages mixed sub-scores from the full weekly form", () => {
    expect(checkinRating({ energy: 4, sleep: 4, soreness: 3, mood: 5 })).toBe(4);
    expect(feelingFromRating(4)).toBe("good");
    expect(checkinEmoji({ energy: 1, sleep: 2, soreness: 2, mood: 1 })).toBe(READINESS_EMOJI.wrecked);
  });

  it("ignores missing sub-scores and returns null when none are present", () => {
    expect(checkinRating({ energy: null, sleep: undefined })).toBeNull();
    expect(checkinEmoji({})).toBeNull();
    expect(checkinRating({ energy: 5, sleep: null, soreness: undefined, mood: 3 })).toBe(4);
  });

  it("handles a null/undefined check-in without throwing", () => {
    expect(checkinRating(null)).toBeNull();
    expect(checkinRating(undefined)).toBeNull();
    expect(checkinEmoji(null)).toBeNull();
    expect(checkinEmoji(undefined)).toBeNull();
  });
});
