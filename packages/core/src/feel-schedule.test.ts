import { describe, it, expect } from "vitest";
import {
  feelSchedule,
  hasImmediateRead,
  isRated,
  unratedSessions,
  msUntilNextRead,
  IMMEDIATE_WINDOW_H,
  RECOVERY_DUE_H,
  RECOVERY_WINDOW_H,
  recoveryReminderAt,
  clampToWaking,
  WAKING_FROM_H,
  WAKING_TO_H,
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

describe("the rating backlog — a session nobody was ever asked about", () => {
  it("is about EFFORT, not about which window the answer landed in", () => {
    // The next morning's answer misses the immediate read and still rates the
    // session: the load model wants the number, not the punctuality.
    const late = session({ completedAt: iso(20 * H), feel: 3, feelLoggedAt: iso(1 * H) });
    expect(hasImmediateRead(late)).toBe(false);
    expect(isRated(late)).toBe(true);
  });

  it("an imported workout lands unrated — nobody typed it, so nobody was asked", () => {
    expect(isRated(session())).toBe(false);
    expect(isRated(session({ feel: 0 }))).toBe(false);
    expect(isRated(session({ fatigue: 4 }))).toBe(false);
  });

  it("hands back only the unrated ones, freshest first", () => {
    const rows = [
      session({ id: "old", completedAt: iso(30 * H) }),
      session({ id: "rated", completedAt: iso(2 * H), feel: 4 }),
      session({ id: "new", completedAt: iso(1 * H) }),
    ];
    expect(unratedSessions(rows).map((s) => s.id)).toEqual(["new", "old"]);
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

describe("when to fire the recovery reminder", () => {
  const H_MS = 3_600_000;
  /** A local-time instant, built so these tests hold in any timezone. */
  const localAt = (dayOffset: number, hour: number, min = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, min, 0, 0);
    return d.getTime();
  };

  it("fires six hours after a session that ends in the morning", () => {
    const end = localAt(0, 9);
    const at = recoveryReminderAt(end, end + 60_000);
    expect(at).not.toBeNull();
    expect(at! - end).toBe(RECOVERY_DUE_H * H_MS);
    expect(new Date(at!).getHours()).toBe(15);
  });

  it("THE POINT: never in the middle of the night", () => {
    // Six hours after a 21:00 session is 03:00. Sending then does not get a
    // considered answer, it gets the notification permission revoked — and the
    // read stays useful for 36 h, so the morning costs the model almost nothing.
    const end = localAt(0, 21);
    const at = recoveryReminderAt(end, end + 60_000)!;
    const h = new Date(at).getHours();
    expect(h).toBeGreaterThanOrEqual(WAKING_FROM_H);
    expect(h).toBeLessThan(WAKING_TO_H);
    expect(at).toBeGreaterThan(end + RECOVERY_DUE_H * H_MS);
    // …and still well inside the window the answer is a measurement in.
    expect(at - end).toBeLessThan(RECOVERY_WINDOW_H * H_MS);
  });

  it("holds every clamped time inside waking hours, whatever hour you train", () => {
    for (let hour = 0; hour < 24; hour++) {
      const end = localAt(0, hour);
      const at = recoveryReminderAt(end, end + 60_000);
      if (at == null) continue;
      const h = new Date(at).getHours();
      expect(h, `session ending at ${hour}:00`).toBeGreaterThanOrEqual(WAKING_FROM_H);
      expect(h, `session ending at ${hour}:00`).toBeLessThan(WAKING_TO_H);
      expect(at, `session ending at ${hour}:00`).toBeGreaterThanOrEqual(end + RECOVERY_DUE_H * H_MS);
    }
  });

  it("does not schedule a reminder for a moment already past", () => {
    // The athlete is holding the phone and the read is already due — that is
    // the card's job, not a notification's.
    const end = localAt(-1, 10);
    expect(recoveryReminderAt(end, Date.now())).toBeNull();
  });

  it("does not schedule one for a session whose window has closed", () => {
    const end = localAt(-3, 10);
    expect(recoveryReminderAt(end, Date.now())).toBeNull();
  });

  it("refuses an unparseable or missing session end", () => {
    expect(recoveryReminderAt(null)).toBeNull();
    expect(recoveryReminderAt(undefined)).toBeNull();
    expect(recoveryReminderAt("not a date")).toBeNull();
  });

  it("accepts an ISO string as readily as an epoch", () => {
    const end = localAt(0, 9);
    expect(recoveryReminderAt(new Date(end).toISOString(), end + 60_000)).toBe(
      recoveryReminderAt(end, end + 60_000),
    );
  });

  it("leaves an hour already inside the window alone", () => {
    const noon = localAt(0, 12);
    expect(clampToWaking(noon)).toBe(noon);
  });

  it("moves a late-evening hour to the NEXT morning, not the same one", () => {
    const late = localAt(0, 23, 30);
    const moved = clampToWaking(late);
    expect(moved).toBeGreaterThan(late);
    expect(new Date(moved).getHours()).toBe(WAKING_FROM_H);
  });

  it("moves a pre-dawn hour forward to the same morning", () => {
    const small = localAt(0, 3);
    const moved = clampToWaking(small);
    expect(moved).toBeGreaterThan(small);
    expect(new Date(moved).getDate()).toBe(new Date(small).getDate());
    expect(new Date(moved).getHours()).toBe(WAKING_FROM_H);
  });
});
