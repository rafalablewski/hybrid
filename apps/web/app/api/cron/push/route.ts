import { NextResponse } from "next/server";
import { checkinNudgePush, nudgeDecision, NUDGE_HOUR, NUDGE_WINDOW_HOURS } from "@hybrid/core";
import { prisma } from "@/lib/db";
import { verifyBearerSecret } from "@/lib/crypto";
import { langFromLocale, localClock, localDayIn, pushConfigured } from "@/lib/push";
import { apnsConfig, apnsSendBatch, asApnsEnvironment } from "@/lib/apns";

export const runtime = "nodejs";
// Sequential sends over one HTTP/2 session, a few hundred at most (see MAX_SENDS).
export const maxDuration = 60;

/**
 * THE MORNING READINESS NUDGE — the one notification the app owes.
 *
 * Hit HOURLY by the .github/workflows/push-nudge.yml schedule, authenticated by
 * CRON_SECRET like the agent jobs beside it. NOT a Vercel Cron, and that is a
 * plan limit rather than a preference: Vercel validates vercel.json's schedules
 * at DEPLOY time against the account's plan, and an hourly entry on Hobby fails
 * the whole deployment instantly — it took production down for three PRs before
 * anyone connected the two. Hourly, because 07:00 is a promise about the
 * ATHLETE's morning: there is no single server hour at which it is 07:00, so the
 * job wakes up every hour and sends to whichever timezones have just reached it.
 * 07:00 UTC would be 02:00 in Los Angeles, and one notification at two in the
 * morning spends the push permission for good.
 *
 * Every rule about WHETHER to send lives in core (`nudgeDecision`, tested there)
 * — the window, the once-per-local-day guard, and the give-up after a week of
 * silence. This route is only the query, the clock resolution and the writes,
 * in that order:
 *
 *   1. Every live device that still wants the nudge and told us its timezone.
 *   2. Resolve each device's own wall clock; drop the ones outside the window
 *      BEFORE touching training data, because that filter removes ~7/8 of them
 *      for the cost of an Intl call.
 *   3. For the survivors' accounts, the two facts the decision needs: when they
 *      last checked in, and whether they have any history at all.
 *   4. Decide, send, and write back the stamp + the streak.
 *
 * A device with no timezone is skipped rather than guessed at, and reported in
 * the response — silent exclusions are how a channel becomes inexplicable.
 */

/** Devices considered in one invocation. Well past current need; a real bound. */
const MAX_DEVICES = 5_000;
/** Notifications actually sent per invocation, so one run can't run long. */
const MAX_SENDS = 200;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (!verifyBearerSecret(request.headers.get("authorization"), secret))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cfg = apnsConfig();
  if (!cfg) return NextResponse.json({ sent: 0, reason: "push not configured", configured: pushConfigured() });

  const now = new Date();

  let devices: {
    id: string;
    userId: string;
    token: string;
    locale: string | null;
    timezone: string | null;
    environment: string | null;
    lastNudgeAt: Date | null;
    nudgeStreak: number;
  }[];
  try {
    devices = await prisma.pushDevice.findMany({
      where: { retiredAt: null, notifyCheckin: true },
      select: {
        id: true, userId: true, token: true, locale: true, timezone: true,
        environment: true, lastNudgeAt: true, nudgeStreak: true,
      },
      take: MAX_DEVICES,
    });
  } catch {
    return NextResponse.json({ sent: 0, reason: "PushDevice table missing (run reference/sql-push-device.sql)" });
  }

  // ---- 2) the clock filter, before any training query -----------------------
  let noZone = 0;
  const inWindow = devices.flatMap((d) => {
    if (!d.timezone) {
      noZone++;
      return [];
    }
    const clock = localClock(d.timezone, now);
    if (!clock) {
      noZone++;
      return [];
    }
    if (clock.hour < NUDGE_HOUR || clock.hour > NUDGE_HOUR + NUDGE_WINDOW_HOURS) return [];
    // The once-a-day guard needs the last nudge in the SAME zone as today.
    const lastNudgeDay = d.lastNudgeAt ? localDayIn(d.timezone, d.lastNudgeAt) : null;
    if (lastNudgeDay === clock.day) return [];
    return [{ device: d, clock, lastNudgeDay, timezone: d.timezone }];
  });

  if (!inWindow.length)
    return NextResponse.json({ sent: 0, considered: devices.length, window: 0, noZone });

  // ---- 3) the two facts the decision needs, in two grouped queries ----------
  const userIds = [...new Set(inWindow.map((c) => c.device.userId))];
  const [checkins, sessions] = await Promise.all([
    prisma.checkin.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { createdAt: true } }),
    prisma.session.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { startedAt: true } }),
  ]);
  // `createdAt`, not `weekOf`: the day column is keyed on a UTC calendar day
  // around the submission (lib/checkin-reads.ts dayWindow), and "did they check
  // in since their own midnight" is a question about an INSTANT.
  const lastCheckin = new Map(checkins.map((c) => [c.userId, c._max.createdAt]));
  const lastSession = new Map(sessions.map((s) => [s.userId, s._max.startedAt]));

  // ---- 4) decide -----------------------------------------------------------
  const due = inWindow.flatMap(({ device, clock, lastNudgeDay, timezone }) => {
    const checkedIn = lastCheckin.get(device.userId) ?? null;
    const decision = nudgeDecision({
      localHour: clock.hour,
      localDay: clock.day,
      lastCheckinDay: checkedIn ? localDayIn(timezone, checkedIn) : null,
      lastNudgeDay,
      nudgeStreak: device.nudgeStreak,
      active: !!checkedIn || !!lastSession.get(device.userId),
    });
    return decision.send ? [{ device, decision, day: clock.day }] : [];
  });

  const sending = due.slice(0, MAX_SENDS);
  const deferred = due.length - sending.length;
  if (deferred > 0) {
    // Not silent: the next hourly run picks these up (they are still inside the
    // window), but a truncated batch that says nothing reads as a full one.
    console.warn(`[cron push] deferring ${deferred} nudges past the ${MAX_SENDS} per-run cap`);
  }
  if (!sending.length)
    return NextResponse.json({ sent: 0, considered: devices.length, window: inWindow.length, due: 0, noZone });

  const outcomes = await apnsSendBatch(
    cfg,
    sending.map(({ device, day }) => {
      const m = checkinNudgePush({ lang: langFromLocale(device.locale), day });
      return {
        notification: {
          token: device.token,
          title: m.title,
          body: m.body,
          data: { kind: m.kind, route: m.route },
          collapseId: m.collapseId,
        },
        known: asApnsEnvironment(device.environment),
      };
    }),
  );

  let sent = 0;
  let retired = 0;
  let failed = 0;
  await Promise.all(
    outcomes.map((o, i) => {
      const target = sending[i];
      if (!target) return Promise.resolve();
      const { device, decision } = target;
      if (o.ok) {
        sent++;
        // The stamp AND the streak, together: they are the same fact (this
        // morning was asked about and not yet answered), and a stamp written
        // without the count would nudge forever.
        return prisma.pushDevice
          .update({
            where: { id: device.id },
            data: { lastNudgeAt: now, lastPushAt: now, nudgeStreak: decision.streak, environment: o.environment },
          })
          .catch(() => {});
      }
      if (o.retire) {
        retired++;
        return prisma.pushDevice.update({ where: { id: device.id }, data: { retiredAt: now } }).catch(() => {});
      }
      failed++;
      console.warn("[cron push] send failed", o.reason);
      // No stamp on a failure: the athlete never heard from us, so the next
      // hourly run inside the window should try again.
      return Promise.resolve();
    }),
  );

  return NextResponse.json({
    sent,
    retired,
    failed,
    deferred,
    considered: devices.length,
    window: inWindow.length,
    due: due.length,
    noZone,
  });
}
