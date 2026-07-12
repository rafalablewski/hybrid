import { describe, it, expect } from "vitest";
import { checkinFeeling, checkinRating, feelingFromRating, READINESS_FACE } from "./readiness-feeling";

describe("readiness-feeling", () => {
  it("round-trips the picker's four levels to their feeling", () => {
    // The quick picker writes all four sub-scores equal to the level rating.
    expect(checkinFeeling({ energy: 5, sleep: 5, soreness: 5, mood: 5 })).toBe("primed");
    expect(checkinFeeling({ energy: 4, sleep: 4, soreness: 4, mood: 4 })).toBe("good");
    expect(checkinFeeling({ energy: 3, sleep: 3, soreness: 3, mood: 3 })).toBe("flat");
    expect(checkinFeeling({ energy: 2, sleep: 2, soreness: 2, mood: 2 })).toBe("wrecked");
  });

  it("maps every feeling to a face expression + accent", () => {
    expect(READINESS_FACE.primed).toEqual({ mouth: "grin", accent: "lime" });
    expect(READINESS_FACE.wrecked).toEqual({ mouth: "frown", accent: "red" });
  });

  it("averages mixed sub-scores from the full weekly form", () => {
    expect(checkinRating({ energy: 4, sleep: 4, soreness: 3, mood: 5 })).toBe(4);
    expect(feelingFromRating(4)).toBe("good");
    expect(checkinFeeling({ energy: 1, sleep: 2, soreness: 2, mood: 1 })).toBe("wrecked");
  });

  it("ignores missing sub-scores and returns null when none are present", () => {
    expect(checkinRating({ energy: null, sleep: undefined })).toBeNull();
    expect(checkinFeeling({})).toBeNull();
    expect(checkinRating({ energy: 5, sleep: null, soreness: undefined, mood: 3 })).toBe(4);
  });

  it("handles a null/undefined check-in without throwing", () => {
    expect(checkinRating(null)).toBeNull();
    expect(checkinRating(undefined)).toBeNull();
    expect(checkinFeeling(null)).toBeNull();
    expect(checkinFeeling(undefined)).toBeNull();
  });
});
