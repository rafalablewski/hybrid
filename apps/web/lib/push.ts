import { PUSH_PREF_KEY, type Lang, type PushKind, type PushMessage } from "@hybrid/core";
import { prisma } from "@/lib/db";
import { apnsConfig, apnsSendBatch, asApnsEnvironment, pushConfigured, type ApnsNotification } from "@/lib/apns";
import { langFromLocale } from "@/lib/push-clock";

/**
 * SENDING one of the three notifications to one athlete.
 *
 * core/push.ts decides WHAT a notification says; lib/apns.ts knows how to hand
 * a payload to Apple; this is the layer in between that knows about ATHLETES:
 * which of their phones are alive, which of them still wants this kind, what
 * language each reads, and what to write back when a token turns out to be dead.
 *
 * EVERY SEND IS OPTIONAL. A notification is a side effect of something the
 * athlete or their coach just did, and the thing they did must not fail because
 * Apple is having a bad minute — or because APNS_KEY_P8 isn't set yet, which is
 * the state this ships in. So the only entry point routes use is `notify()`,
 * which resolves rather than throws, and every "we didn't send" answer is a
 * REASON rather than silence (`{ sent: 0, reason: "push not configured" }`), so
 * a quiet channel can be diagnosed from a log line instead of a debugger.
 *
 * NO BADGE NUMBER, deliberately. iOS will happily set one from the payload, and
 * a badge the app never clears is the exact failure the bell's read state was
 * built to end (notifications.ts, complaint 1: a count that cannot reach zero
 * is decoration). Wiring the icon badge to the bell's unread count is a real
 * feature — one that needs the count computed per device at send time and
 * cleared on read — and it is not one of the three.
 */

/** Which device column mirrors which notification kind's account switch. */
const PREF_COLUMN: Record<PushKind, "notifyCheckin" | "notifyCoach" | "notifyCosign"> = {
  checkin: "notifyCheckin",
  coach: "notifyCoach",
  cosign: "notifyCosign",
};

/** A push table/column that hasn't been migrated yet (reference/sql-push-device.sql). */
const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2022" || code === "P2010";
};

export interface PushResult {
  sent: number;
  /** Tokens APNs rejected as dead, now retired. */
  retired: number;
  /** Live devices that didn't want this kind. */
  muted: number;
  /** Why nothing was sent, when nothing was. */
  reason?: string;
}

const NOTHING = (reason: string): PushResult => ({ sent: 0, retired: 0, muted: 0, reason });

/**
 * Send a message to every live device of one athlete that still wants its kind.
 *
 * `build` is a function of the device's language rather than a finished message:
 * a push is rendered by iOS from what the server sent, so an athlete reading
 * Polish on one phone and English on another gets each in its own language, and
 * the caller doesn't have to know that.
 */
export async function pushToUser(
  userId: string,
  kind: PushKind,
  build: (lang: Lang) => PushMessage,
): Promise<PushResult> {
  const cfg = apnsConfig();
  if (!cfg) return NOTHING("push not configured (APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID)");

  let devices: {
    id: string;
    token: string;
    locale: string | null;
    environment: string | null;
    notifyCheckin: boolean;
    notifyCoach: boolean;
    notifyCosign: boolean;
  }[];
  try {
    devices = await prisma.pushDevice.findMany({
      where: { userId, retiredAt: null },
      select: {
        id: true, token: true, locale: true, environment: true,
        notifyCheckin: true, notifyCoach: true, notifyCosign: true,
      },
      take: 20,
    });
  } catch (e) {
    if (tableMissing(e)) return NOTHING("PushDevice table missing (run reference/sql-push-device.sql)");
    throw e;
  }
  if (!devices.length) return NOTHING("no registered devices");

  const wanted = devices.filter((d) => d[PREF_COLUMN[kind]]);
  const muted = devices.length - wanted.length;
  if (!wanted.length) return { sent: 0, retired: 0, muted, reason: `every device muted ${kind}` };

  const notifications = wanted.map((d) => {
    const m = build(langFromLocale(d.locale));
    const n: ApnsNotification = {
      token: d.token,
      title: m.title,
      body: m.body,
      // What the tap opens. The client validates it against core's route list
      // before navigating — see normalizePushRoute.
      data: { kind: m.kind, route: m.route },
      collapseId: m.collapseId,
    };
    return { notification: n, known: asApnsEnvironment(d.environment) };
  });

  const outcomes = await apnsSendBatch(cfg, notifications);
  const now = new Date();
  let sent = 0;
  let retired = 0;

  await Promise.all(
    outcomes.map((o, i) => {
      const device = wanted[i];
      if (!device) return Promise.resolve();
      if (o.ok) {
        sent++;
        return prisma.pushDevice
          .update({ where: { id: device.id }, data: { lastPushAt: now, environment: o.environment } })
          .catch(() => {});
      }
      if (o.retire) {
        retired++;
        // Retired, not deleted: the same phone re-registers on its next launch
        // and this row comes back, streak and history intact.
        return prisma.pushDevice.update({ where: { id: device.id }, data: { retiredAt: now } }).catch(() => {});
      }
      console.warn("[push] send failed", kind, o.reason);
      return Promise.resolve();
    }),
  );

  return { sent, retired, muted };
}

/**
 * Fire-and-report: the form every ROUTE uses.
 *
 * Awaited, not detached. A serverless function stops executing the moment it
 * responds, so a floating promise here is a notification that sometimes sends —
 * which is worse than one that never does, because it cannot be debugged. The
 * cost is a few hundred milliseconds on a coach's assign request; the send is
 * wrapped so its failure can never become the caller's.
 */
export async function notify(
  userId: string,
  kind: PushKind,
  build: (lang: Lang) => PushMessage,
): Promise<PushResult> {
  try {
    return await pushToUser(userId, kind, build);
  } catch (e) {
    console.error("[push] notify failed", kind, e);
    return NOTHING("send failed");
  }
}

export { pushConfigured };

// The pure clock/locale helpers live in ./push-clock (no database import, so
// they are unit-testable on their own) and are re-exported here so a caller only
// ever needs one push module.
export { langFromLocale, localClock, localDayIn, assignmentDayLabel } from "@/lib/push-clock";
