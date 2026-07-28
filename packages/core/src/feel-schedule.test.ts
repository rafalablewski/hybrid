import { describe, it, expect } from "vitest";
import {
  feelSchedule,
  hasImmediateRead,
  msUntilNextRead,
  IMMEDIATE_WINDOW_H,
  RECOVERY_DUE_H,
  RECOVERY_WINDOW_H,
  type FeelSessionRef,
} from "./feel-schedule";

const H = 3_600_000;
const NOW = Date.parse("2026-07-28T20:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const session = (over: Partial<FeelSessionRef> = {}): FeelSessionRef => ({
  id: "s1",
  title: "Lower",
  startedAt: iso(2 * H),
  completedAt: iso(1 * H),
  ...over,
});

describe("asking twice", () => {
  it("asks how it felt the moment the session ends", () => {
    const s = feelSchedule({ sessions: [session()], now: NOW });
    const imm = s.due.find((p) => p.kind === "immediate");
    expect(imm).toBeTruthy();
    expect(imm!.session.id).toBe("s1");
  });

  it("stops asking for the immediate read once it stops being immediate", () => {
    // Four hours out, "how did that feel right after" is no longer answerable.
    const s = feelSchedule({ sessions: [session({ completedAt: iso(4 * H) })], now: NOW });
    const imm = s.prompts.find((p) => p.kind === "immediate")!;
    expect(imm.due).toBe(false);
    expect(imm.missed).toBe(true);
    expect(IMMEDIATE_WINDOW_H).toBe(3);
  });

  it("holds the recovery read back until the acute spike has drained", () => {
    // One hour after training the answer is the session talking, not recovery.
    const soon = feelSchedule({ sessions: [session()], now: NOW });
    expect(soon.due.some((p) => p.kind === "recovery")).toBe(false);

    const later = feelSchedule({ sessions: [session({ completedAt: iso(7 * H) })], now: NOW });
    expect(later.due.some((p) => p.kind === "recovery")).toBe(true);
    expect(RECOVERY_DUE_H).toBe(6);
  });

  it("tells the client exactly when to come back", () => {
    const s = feelSchedule({ sessions: [session()], now: NOW });
    // Session ended an hour ago; the recovery read opens five hours from now.
    expect(msUntilNextRead(s, NOW)).toBe(5 * H);
    expect(s.next!.kind).toBe("recovery");
  });

  it("nothing scheduled once both reads are in", () => {
    const s = feelSchedule({
      sessions: [session({ completedAt: iso(8 * H), fatigue: 3, feelLoggedAt: iso(7.5 * H) })],
      lastCheckinAt: iso(1 * H),
      now: NOW,
    });
    expect(s.due).toEqual([]);
    expect(s.next).toBeNull();
    expect(msUntilNextRead(s, NOW)).toBeNull();
  });
});

describe("what counts as an immediate read", () => {
  it("a spentness answer given in the gym does", () => {
    expect(hasImmediateRead(session({ fatigue: 4, feelLoggedAt: iso(0.5 * H) }))).toBe(true);
  });

  it("the same answer given the next morning does not", () => {
    // It is kept and used — it just isn't the read the card was asking for.
    const s = session({ completedAt: iso(20 * H), fatigue: 4, feelLoggedAt: iso(1 * H) });
    expect(hasImmediateRead(s)).toBe(false);
  });

  it("a row from before timestamps existed is trusted rather than re-asked", () => {
    expect(hasImmediateRead(session({ fatigue: 4, feelLoggedAt: null }))).toBe(true);
  });

  it("effort alone is not a spentness read", () => {
    expect(hasImmediateRead(session({ feel: 4, feelLoggedAt: iso(0.5 * H) }))).toBe(false);
  });
});

describe("the recovery read is per day, not per session", () => {
  it("two sessions get two immediate reads and one recovery read", () => {
    const s = feelSchedule({
      sessions: [
        session({ id: "a", completedAt: iso(9 * H) }),
        session({ id: "b", completedAt: iso(7 * H) }),
      ],
      now: NOW,
    });
    expect(s.prompts.filter((p) => p.kind === "immediate")).toHaveLength(2);
    const rec = s.prompts.filter((p) => p.kind === "recovery");
    expect(rec).toHaveLength(1);
    // Anchored to the LAST session to finish — you do not recover one at a time.
    expect(rec[0]!.session.id).toBe("b");
  });

  it("a check-in written BEFORE the read comes due is not that read", () => {
    // Trained at 13:00, checked in at 14:00, it is now 20:00. That check-in
    // cannot be the recovery report on a session it barely post-dates.
    const s = feelSchedule({
      sessions: [session({ completedAt: iso(7 * H) })],
      lastCheckinAt: iso(6 * H),
      now: NOW,
    });
    expect(s.due.some((p) => p.kind === "recovery")).toBe(true);
  });

  it("gives up rather than collecting a memory", () => {
    const s = feelSchedule({
      sessions: [session({ completedAt: iso((RECOVERY_WINDOW_H + 1) * H) })],
      now: NOW,
      lookbackH: 200,
    });
    const rec = s.prompts.find((p) => p.kind === "recovery")!;
    expect(rec.due).toBe(false);
    expect(rec.missed).toBe(true);
  });
});

describe("nothing to ask about", () => {
  it("no sessions, no prompts", () => {
    const s = feelSchedule({ sessions: [], now: NOW });
    expect(s.prompts).toEqual([]);
    expect(s.next).toBeNull();
  });

  it("a session in the future is not asked about yet", () => {
    const s = feelSchedule({ sessions: [session({ startedAt: iso(-H), completedAt: iso(-H) })], now: NOW });
    expect(s.prompts).toEqual([]);
  });
});
