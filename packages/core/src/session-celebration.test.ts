import { describe, it, expect } from "vitest";
import { sessionCelebration } from "./session-celebration";
import type { PrHit, CardioPrHit } from "./engines/records";

describe("sessionCelebration", () => {
  it("returns null when there are no records", () => {
    expect(sessionCelebration([], [])).toBeNull();
  });

  it("headlines the heaviest strength e1RM, not the biggest gain", () => {
    // Bench is the bigger gain (+20) but Squat is the heavier lift — the heavier
    // e1RM headlines, since that reads as the more "hero" record.
    const prs: PrHit[] = [
      { lift: "Bench", e1rm: 80, previous: 60 },
      { lift: "Squat", e1rm: 140, previous: 135 },
    ];
    const c = sessionCelebration(prs, []);
    expect(c).toMatchObject({ kind: "strength", lift: "Squat", e1rm: 140, firstEver: false, total: 2 });
  });

  it("marks a never-trained lift as firstEver", () => {
    const prs: PrHit[] = [{ lift: "Deadlift", e1rm: 100, previous: null }];
    const c = sessionCelebration(prs, []);
    expect(c).toMatchObject({ kind: "strength", firstEver: true, previous: null, total: 1 });
  });

  it("counts strength + cardio records in total", () => {
    const prs: PrHit[] = [{ lift: "Bench", e1rm: 80, previous: 75 }];
    const cardio: CardioPrHit[] = [{ move: "5K", kind: "distance", value: 5, previous: 4 }];
    expect(sessionCelebration(prs, cardio)?.total).toBe(2);
  });

  it("headlines cardio only when there's no strength PR", () => {
    const cardio: CardioPrHit[] = [{ move: "5K", kind: "pace", value: 270, previous: 300 }];
    const c = sessionCelebration([], cardio);
    expect(c).toMatchObject({ kind: "cardio", move: "5K", prKind: "pace", firstEver: false, total: 1 });
  });
});
