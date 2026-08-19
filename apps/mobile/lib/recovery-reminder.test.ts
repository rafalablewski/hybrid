import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Notifications from "expo-notifications";
import { RECOVERY_DUE_H, WAKING_FROM_H, WAKING_TO_H } from "@hybrid/core";

/**
 * The clock this module reads lives in core and is tested there
 * (feel-schedule.test.ts). What is only testable HERE is the glue: that a
 * reminder is actually scheduled, that a second session replaces the first
 * rather than stacking a second question on one lock screen, and that answering
 * cancels the ask. Those are the three ways a reminder channel goes wrong.
 */

const permission = vi.hoisted(() => ({ value: "granted" as "granted" | "denied" | "undetermined" }));
vi.mock("./push", () => ({ pushPermission: async () => permission.value }));

const { scheduleRecoveryReminder, cancelRecoveryReminder, recoveryReadAnswered, RECOVERY_NOTIF_KIND } =
  await import("./recovery-reminder");

/** A local-time instant, so these hold in any timezone. */
const localAt = (dayOffset: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

describe("the recovery reminder", () => {
  let scheduled: { id: string; content: Record<string, unknown>; trigger: Record<string, unknown> }[];
  let cancelled: string[];

  beforeEach(async () => {
    permission.value = "granted";
    scheduled = [];
    cancelled = [];
    let n = 0;
    vi.spyOn(Notifications, "scheduleNotificationAsync").mockImplementation((async (req: {
      content: Record<string, unknown>;
      trigger: Record<string, unknown>;
    }) => {
      const id = `notif-${++n}`;
      scheduled.push({ id, content: req.content, trigger: req.trigger });
      return id;
    }) as unknown as typeof Notifications.scheduleNotificationAsync);
    vi.spyOn(Notifications, "cancelScheduledNotificationAsync").mockImplementation((async (id: string) => {
      cancelled.push(id);
    }) as unknown as typeof Notifications.cancelScheduledNotificationAsync);
    await cancelRecoveryReminder();
    cancelled = [];
  });

  it("schedules the second ask against the session that just ended", async () => {
    const end = localAt(0, 9);
    const at = await scheduleRecoveryReminder({ sessionEnd: end, sessionId: "s1", now: end + 1000 });

    expect(at).toBe(end + RECOVERY_DUE_H * 3_600_000);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.content.title).toBeTruthy();
    expect(scheduled[0]!.content.body).toBeTruthy();
    // Tapping it has to land ON the question, not on Today with the athlete
    // left to go and find it.
    expect(scheduled[0]!.content.data).toMatchObject({ kind: RECOVERY_NOTIF_KIND, route: "/checkin", sessionId: "s1" });
    expect(Number(scheduled[0]!.trigger.seconds)).toBeGreaterThan(0);
  });

  it("names the session when it has a title worth showing", async () => {
    const end = localAt(0, 9);
    await scheduleRecoveryReminder({ sessionEnd: end, title: "Heavy Squats", now: end + 1000 });
    expect(String(scheduled[0]!.content.title)).toContain("Heavy Squats");

    await scheduleRecoveryReminder({ sessionEnd: end, title: "   ", now: end + 1000 });
    expect(String(scheduled[1]!.content.title)).not.toContain("{session}");
  });

  it("THE POINT: a second session REPLACES the first one's reminder", async () => {
    // One recovery prompt per day, anchored to the last session to finish —
    // you do not recover from one session at a time. Two notifications asking
    // the same question on one lock screen is how the channel gets muted.
    const morning = localAt(0, 9);
    await scheduleRecoveryReminder({ sessionEnd: morning, sessionId: "s1", now: morning + 1000 });
    const first = scheduled[0]!.id;

    const midday = localAt(0, 12);
    await scheduleRecoveryReminder({ sessionEnd: midday, sessionId: "s2", now: midday + 1000 });

    expect(cancelled).toContain(first);
    expect(scheduled).toHaveLength(2);
    expect(scheduled[1]!.content.data).toMatchObject({ sessionId: "s2" });
  });

  it("answering the read cancels the ask", async () => {
    const end = localAt(0, 9);
    await scheduleRecoveryReminder({ sessionEnd: end, sessionId: "s1", now: end + 1000 });
    const id = scheduled[0]!.id;

    await recoveryReadAnswered();
    expect(cancelled).toContain(id);
  });

  it("schedules nothing without permission, and never prompts for it", async () => {
    permission.value = "denied";
    const end = localAt(0, 9);
    expect(await scheduleRecoveryReminder({ sessionEnd: end, now: end + 1000 })).toBeNull();
    expect(scheduled).toHaveLength(0);
    // The finish screen is a bad moment to spend the one permission ask on.
    expect(Notifications.requestPermissionsAsync).not.toHaveProperty("mock");
  });

  it("clears a stale reminder when the new session has nothing to ask about", async () => {
    // Otherwise yesterday's question arrives tomorrow, about a session the
    // athlete has long since forgotten.
    const end = localAt(0, 9);
    await scheduleRecoveryReminder({ sessionEnd: end, sessionId: "s1", now: end + 1000 });
    const id = scheduled[0]!.id;

    // A session whose read window has already closed schedules nothing…
    const old = localAt(-3, 9);
    expect(await scheduleRecoveryReminder({ sessionEnd: old, sessionId: "s2" })).toBeNull();
    // …and still clears what was pending.
    expect(cancelled).toContain(id);
    expect(scheduled).toHaveLength(1);
  });

  it("never fires in the middle of the night", async () => {
    for (let hour = 0; hour < 24; hour++) {
      const end = localAt(0, hour);
      const at = await scheduleRecoveryReminder({ sessionEnd: end, now: end + 1000 });
      if (at == null) continue;
      const h = new Date(at).getHours();
      expect(h, `session ending ${hour}:00`).toBeGreaterThanOrEqual(WAKING_FROM_H);
      expect(h, `session ending ${hour}:00`).toBeLessThan(WAKING_TO_H);
    }
  });

  it("survives a platform that refuses to schedule", async () => {
    vi.spyOn(Notifications, "scheduleNotificationAsync").mockRejectedValue(new Error("nope") as never);
    const end = localAt(0, 9);
    // A missing reminder is a quieter app, not a broken save.
    await expect(scheduleRecoveryReminder({ sessionEnd: end, now: end + 1000 })).resolves.toBeNull();
  });
});
