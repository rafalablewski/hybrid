import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeT, recoveryReminderAt, PUSH_ROUTE, READINESS_FEELINGS, type Lang, type ReadinessFeeling } from "@hybrid/core";
import { pushPermission } from "./push";

/**
 * THE ONE ASK THAT HAS TO TRAVEL TO FIND YOU.
 *
 * The app asks about a session twice. The first ask is free: the athlete is
 * still holding the phone on the finish screen, so it costs a tap. The second —
 * "how are you NOW", hours later, once the acute spike has drained — is the one
 * that actually moves training, and it had no delivery at all.
 *
 * What existed instead: an in-app list, which can only tell you something while
 * you are already looking at HYBRID, and a morning push fixed at 07:00 that has
 * no relationship to when you trained. Train at lunchtime and the read comes due
 * at 18:30; the morning nudge arrives nineteen hours later and asks "how are you
 * TODAY", after a night's sleep, on the far edge of the window. Meanwhile
 * `msUntilNextRead` had been sitting in core since the schedule was written,
 * built precisely to hand a client this delay, with nothing calling it.
 *
 * A LOCAL notification, and deliberately not a push: no APNs key, no device
 * token, no server, no cron. The push channel is blocked on Apple credentials
 * (capabilities: push-notifications) and this must not wait for them. It is the
 * same mechanism the rest timer already uses.
 *
 * ONE reminder at a time, for the LAST session that finished. That mirrors
 * `feelSchedule`, which issues one recovery prompt per day anchored to the last
 * session to end — you do not recover from one session at a time — so a second
 * workout replaces the first one's reminder rather than stacking a second
 * notification on the same lock screen.
 */

/** The scheduled notification's id, so a later session can replace it. */
const ID_KEY = "hybrid.recoveryReminderId";
/** The session it belongs to, so an answer for THAT session can cancel it. */
const FOR_KEY = "hybrid.recoveryReminderFor";

/** Marks the payload as ours — the tap handler routes on it, and it keeps this
 *  notification distinguishable from the rest-timer cue in the global handler. */
export const RECOVERY_NOTIF_KIND = "recovery-read";

/**
 * The category the notification is filed under — what puts the four answer
 * buttons on it (lib/recovery-actions.ts registers them).
 *
 * Declared HERE, not beside the actions, so this module does not have to import
 * that one: recovery-actions reaches for the API layer, i18n and React, and
 * pulling those in would drag this module out of the `pure` test project, where
 * the scheduling can actually be checked. NOT `RECOVERY_NOTIF_KIND` either —
 * iOS category identifiers must not contain `:` or `-`, and a category that
 * silently fails to register is a notification that arrives with no buttons and
 * no error.
 */
export const RECOVERY_CATEGORY = "recoveryread";

/** `${RECOVERY_ACTION_PREFIX}${feeling}` — the id iOS hands back on a press.
 *  Here rather than beside the handler for the same reason as the category. */
export const RECOVERY_ACTION_PREFIX = "recovery.";

/** The action id standing for one readiness answer. */
export const recoveryActionId = (f: ReadinessFeeling): string => `${RECOVERY_ACTION_PREFIX}${f}`;

/**
 * The feeling a pressed button stands for, or null when it isn't one of ours.
 *
 * Null is the common case, not an error: every notification response in the app
 * reaches this, including a plain tap on the body, and only our four buttons
 * are an answer.
 */
export function feelingForAction(identifier: string | null | undefined): ReadinessFeeling | null {
  if (typeof identifier !== "string" || !identifier.startsWith(RECOVERY_ACTION_PREFIX)) return null;
  const name = identifier.slice(RECOVERY_ACTION_PREFIX.length);
  return (READINESS_FEELINGS as readonly string[]).includes(name) ? (name as ReadinessFeeling) : null;
}

/** Cancel whatever recovery reminder is currently scheduled. Safe to call when
 *  there isn't one. */
export async function cancelRecoveryReminder(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  } catch {
    // Storage unavailable — nothing to cancel that we can find.
  }
  await AsyncStorage.removeItem(ID_KEY).catch(() => {});
  await AsyncStorage.removeItem(FOR_KEY).catch(() => {});
}

/**
 * Schedule the recovery read for a session that has just ended.
 *
 * Returns the instant it will fire, or null when nothing was scheduled — no
 * permission, no useful hour left in the window, or the platform refused. Null
 * is an ordinary outcome, not a failure: `recoveryReminderAt` returns null for a
 * session whose read is already due (the card asks) or already expired.
 */
export async function scheduleRecoveryReminder(opts: {
  sessionEnd: string | number | null | undefined;
  sessionId?: string | null;
  /** Names the session in the notification when we have a title worth showing. */
  title?: string | null;
  lang?: Lang;
  now?: number;
}): Promise<number | null> {
  const at = recoveryReminderAt(opts.sessionEnd, opts.now ?? Date.now());
  if (at == null) {
    // A newer session with nothing to ask about must still clear an older
    // session's pending reminder, or yesterday's question arrives tomorrow.
    await cancelRecoveryReminder();
    return null;
  }

  // Never PROMPT here. The finish screen is a bad moment to spend the one
  // permission ask on, and a silent no-op is better than a modal nobody
  // expected — enablePush() owns the asking, at a moment chosen for it.
  if ((await pushPermission()) !== "granted") return null;

  await cancelRecoveryReminder();

  const t = makeT(opts.lang ?? "en");
  const title = opts.title?.trim()
    ? t("notif.recovery.titleNamed").replace("{session}", opts.title.trim())
    : t("notif.recovery.title");

  try {
    // Relative to the REAL clock, not opts.now — that one only exists so the
    // due-time arithmetic above is testable.
    const seconds = Math.max(1, Math.round((at - Date.now()) / 1000));
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: t("notif.recovery.body"),
        // The four answers, ON the notification. See lib/recovery-actions.ts —
        // requiring an app launch to deliver one tap is the largest avoidable
        // tax on whether this read happens at all.
        categoryIdentifier: RECOVERY_CATEGORY,
        // `route` is what usePushBridge navigates on, through core's allow-list.
        // The readiness screen IS the recovery read (feel-schedule.ts: neither
        // read invents a new instrument), so the tap lands mid-question rather
        // than on Today with the athlete left to find it.
        data: { kind: RECOVERY_NOTIF_KIND, route: PUSH_ROUTE.checkin, sessionId: opts.sessionId ?? null },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
    await AsyncStorage.setItem(ID_KEY, id).catch(() => {});
    await AsyncStorage.setItem(FOR_KEY, opts.sessionId ?? "").catch(() => {});
    return at;
  } catch {
    // Notifications unavailable on this device/build — the read still happens
    // in the app, it just isn't announced. Never surface this as an error.
    return null;
  }
}

/**
 * The athlete has answered a readiness read, so the reminder has done its job
 * (or been beaten to it). Cancelling matters: a notification asking for
 * something already given is how a channel earns a mute.
 */
export async function recoveryReadAnswered(): Promise<void> {
  await cancelRecoveryReminder();
}
