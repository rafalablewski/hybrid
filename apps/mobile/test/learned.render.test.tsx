import { describe, expect, it, vi } from "vitest";
import { checkinFromSoreness, type LoggedSession } from "@hybrid/core";
import { renderScreen } from "./render";

/**
 * WHAT WE LEARNED ABOUT YOU — the screen whose whole job is not overstating
 * itself.
 *
 * The engine's own tests (core engines/learned.test.ts) prove the claims are
 * built honestly. This gate proves they SURVIVE the render: that a figure never
 * appears without its interval, that the layer it came from is printed beside
 * it, and that a claim with no evidence shows up as a row saying so with the
 * thing that would settle it — rather than being quietly dropped, which is the
 * one failure mode that would make the screen a marketing surface.
 */

const H = 3_600_000;
const DAY = 24 * H;
const WEEK = 7 * DAY;
const iso = (ms: number) => new Date(ms).toISOString();

/** Ten weeks of squats, absorbed: sets ramp, the top set climbs, the mornings
 *  stay fresh — with an in-the-gym read and the next morning's check-in, which
 *  is what makes a recovery PAIR. */
function history(now: number) {
  const sessions: LoggedSession[] = [];
  const checkins: { weekOf: string; soreness: number; energy: number; createdAt: string }[] = [];
  const start = now - 10 * WEEK;
  for (let w = 0; w < 10; w++) {
    for (let d = 0; d < 3; d++) {
      const end = start + w * WEEK + d * 2 * DAY + 18 * H;
      if (end > now) continue;
      sessions.push({
        id: `w${w}d${d}`,
        title: "Lower",
        startedAt: iso(end - 90 * 60_000),
        completedAt: iso(end),
        fatigue: 3,
        feelLoggedAt: iso(end + 10 * 60_000),
        blocks: [{
          kind: "strength",
          name: "Back Squat",
          sets: Array.from({ length: Math.min(3 + w, 8) }, () => ({ reps: "5", load: String(120 + w * 2.5) })),
        }],
      } as LoggedSession);
      const at = end + 14 * H;
      if (at > now) continue;
      checkins.push({ weekOf: iso(at), soreness: checkinFromSoreness(2) ?? 4, energy: 4, createdAt: iso(at) });
    }
  }
  return { sessions, checkins };
}

const NOW = Date.now();
const { sessions, checkins } = history(NOW);

vi.mock("../lib/api", () => ({
  fetchFlagState: async () => ({ flags: {}, values: {} }),
  fetchTranslationOverrides: async () => ({}),
  // The volume model hydrates the questionnaire from the account on first use
  // (lib/questionnaire.ts). Empty here: this fixture's athlete is defined by the
  // log and the on-device profile, and a server answer arriving mid-assert would
  // be a second source for the same numbers.
  fetchQuestionnaire: async () => ({}),
  saveQuestionnaire: async () => true,
}));

vi.mock("../lib/queries", () => ({
  useSessionsQuery: () => ({ data: sessions, isFetching: false, refetch: () => {} }),
  useHeatSignalsQuery: () => ({ data: [] }),
  // The food log, which the volume model reads for energy availability (the
  // nutrition → training join). Empty here: this fixture's athlete logs
  // training and check-ins, so the scale is what answers that question.
  useNutritionSignalsQuery: () => ({ data: [] }),
  useCheckinsQuery: () => ({ data: checkins }),
}));

vi.mock("../lib/query", async () => ({ ...(await vi.importActual("../lib/query")), useRefreshOnFocus: () => {} }));

vi.mock("../lib/use-bodyweight", () => ({
  useBodyweight: () => 82,
  useBodyweightPoints: () => [],
  useAthleteHeight: () => 180,
  // No composition logged: the body-mass factor reads raw mass against the
  // frame exactly as it did before body fat could sharpen it, which keeps this
  // fixture's figures the ones the assertions below were written against.
  useBodyFatPct: () => null,
  useBodyweightLookup: () => () => 82,
  refreshBodyweight: () => {},
}));

const { default: AuroraLearned, LearnedLead } = await import("../components/aurora/learned");

const text = (el: HTMLElement) => el.textContent ?? "";

describe("the monthly story", () => {
  it("leads with how much of the athlete has actually been measured", async () => {
    const { container } = renderScreen(<AuroraLearned />);
    await vi.waitFor(() => expect(text(container)).toContain("of you, measured"));
    // A percentage, not a boast: the figure is beside the label.
    expect(text(container)).toMatch(/\d+%/);
  });

  it("names all three chapters and the sentence that says where each comes from", async () => {
    const { container } = renderScreen(<AuroraLearned />);
    await vi.waitFor(() => expect(text(container)).toContain("Your volume ceilings"));
    for (const s of ["How fast you clear a session", "Your readiness pattern"]) {
      expect(text(container)).toContain(s);
    }
    expect(text(container)).toContain("A ceiling is only ever found by running into one");
  });

  it("prints the LAYER a figure came from, not just the figure", async () => {
    const { container } = renderScreen(<AuroraLearned />);
    // The absorbed ramp tests the quads ceiling, so at least one claim is the
    // athlete's own rather than the table's.
    await vi.waitFor(() => expect(text(container)).toContain("Learned from your training"));
    expect(text(container)).toContain("confidence");
  });

  it("never states a figure without its interval, and says which KIND of interval", async () => {
    const { container } = renderScreen(<AuroraLearned />);
    await vi.waitFor(() => expect(text(container)).toContain("probably between"));
    // …and the readiness mean carries a SPREAD, which is a different claim.
    expect(text(container)).toContain("your day-to-day range");
  });

  it("shows what it has NOT learned as a row, with what would settle it", async () => {
    const { container } = renderScreen(<AuroraLearned />);
    await vi.waitFor(() => expect(text(container)).toContain("Not enough evidence yet"));
    // The untested muscles: the whole point is that this is actionable rather
    // than absent.
    expect(text(container)).toContain("A ceiling shows up in a week that carried at least the top of your productive band");
  });
});

describe("the You tab's lead", () => {
  it("carries the claim itself — a figure and its movement, not just a link", async () => {
    const { container } = renderScreen(<LearnedLead sessions={sessions} onOpen={() => {}} />);
    await vi.waitFor(() => expect(text(container)).toContain("What we learned about you"));
    expect(text(container)).toMatch(/\d/);
    expect(text(container)).toContain("measured");
  });

  it("still shows with no history at all — the loop has to be visible from day one", () => {
    const { container } = renderScreen(<LearnedLead sessions={[]} onOpen={() => {}} />);
    expect(text(container)).toContain("What we learned about you");
    expect(text(container)).toContain("Your model fills in as you log.");
  });
});
