import { describe, it, expect } from "vitest";
import { sessionCelebration } from "./session-celebration";
import type { PrHit, CardioPrHit } from "./engines/records";

describe("sessionCelebration", () => {
  it("returns null when there are no records", () => {
    expect(sessionCelebration([], [])).toBeNull();
  });

  it("headlines the heaviest lift ACTUALLY moved, not the biggest gain", () => {
    // Bench is the bigger gain (+20) but Squat is the heavier lift — the heavier
    // bar headlines, since that reads as the more "hero" record.
    const prs: PrHit[] = [
      { lift: "Bench", e1rm: 80, previous: 60, topLoad: 70, previousTopLoad: 55 },
      { lift: "Squat", e1rm: 140, previous: 135, topLoad: 120, previousTopLoad: 115 },
    ];
    const c = sessionCelebration(prs, []);
    expect(c).toMatchObject({ kind: "strength", lift: "Squat", topLoad: 120, firstEver: false, total: 2 });
  });

  it("headlines the weight lifted, never the estimated 1RM (#231)", () => {
    // The reported bug: 5 deadlift sets topping out at 100 kg were headlined as
    // "120 kg" because e1RM led. The hero must be the 100 kg that was lifted.
    const prs: PrHit[] = [{ lift: "Barbell Deadlift", e1rm: 120, previous: null, topLoad: 100, previousTopLoad: null }];
    const c = sessionCelebration(prs, []);
    expect(c).toMatchObject({ kind: "strength", topLoad: 100, firstEver: true, repPr: false });
    // e1RM is still carried — it's what DETECTED the record — just not headlined.
    expect(c).toMatchObject({ e1rm: 120 });
  });

  it("picks by weight lifted even when another lift has a higher e1RM", () => {
    // A high-rep set can out-estimate a genuinely heavier bar. The heavier bar
    // wins the headline, so the biggest number on screen is the one chosen.
    const prs: PrHit[] = [
      { lift: "Deadlift", e1rm: 150, previous: 140, topLoad: 100, previousTopLoad: 95 },
      { lift: "Squat", e1rm: 130, previous: 120, topLoad: 125, previousTopLoad: 120 },
    ];
    expect(sessionCelebration(prs, [])).toMatchObject({ lift: "Squat", topLoad: 125 });
  });

  it("flags a rep PR — same bar, more reps — so the hero can't claim +0 kg", () => {
    // 100 kg × 5 → 100 kg × 8 is a real record that no weight comparison finds.
    const prs: PrHit[] = [{ lift: "Bench", e1rm: 124, previous: 117, topLoad: 100, previousTopLoad: 100 }];
    expect(sessionCelebration(prs, [])).toMatchObject({ repPr: true, firstEver: false, topLoad: 100 });
  });

  it("does not flag a heavier lift as a rep PR", () => {
    const prs: PrHit[] = [{ lift: "Bench", e1rm: 90, previous: 80, topLoad: 82, previousTopLoad: 76 }];
    expect(sessionCelebration(prs, [])).toMatchObject({ repPr: false });
  });

  it("marks a never-trained lift as firstEver", () => {
    const prs: PrHit[] = [{ lift: "Deadlift", e1rm: 100, previous: null, topLoad: 90, previousTopLoad: null }];
    const c = sessionCelebration(prs, []);
    expect(c).toMatchObject({ kind: "strength", firstEver: true, previous: null, previousTopLoad: null, repPr: false, total: 1 });
  });

  it("counts strength + cardio records in total", () => {
    const prs: PrHit[] = [{ lift: "Bench", e1rm: 80, previous: 75, topLoad: 70, previousTopLoad: 65 }];
    const cardio: CardioPrHit[] = [{ move: "5K", kind: "distance", value: 5, previous: 4 }];
    expect(sessionCelebration(prs, cardio)?.total).toBe(2);
  });

  it("headlines cardio only when there's no strength PR", () => {
    const cardio: CardioPrHit[] = [{ move: "5K", kind: "pace", value: 270, previous: 300 }];
    const c = sessionCelebration([], cardio);
    expect(c).toMatchObject({ kind: "cardio", move: "5K", prKind: "pace", firstEver: false, total: 1 });
  });
});
