import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { ACCOUNT_NOTIF_DEFAULTS, PUSH_PREF_KEY, normalizePushRoute } from "@hybrid/core";
import { supabase } from "./supabase";
import { registerPushDevice, unregisterPushDevice } from "./api";

/**
 * PUSH, the device half — the bell that can reach you with the app closed.
 *
 * Three notifications exist (packages/core/src/push.ts owns what they say and
 * where they land): the morning readiness nudge, a coach assignment, and a
 * co-sign request. This file does four things and nothing else:
 *
 *   1. ASKS, at a moment worth asking (see `askPushOnce`). Never at launch — a
 *      permission prompt on first open, before the app has shown what it would
 *      notify you ABOUT, is the one shot spent for nothing.
 *   2. REGISTERS the APNs device token with the server on every launch where
 *      permission is already granted, and again whenever iOS rotates it. Not
 *      "once, at the grant": a token changes on a restore-from-backup, on a
 *      reinstall, and at Apple's discretion — "register once" is exactly how a
 *      push channel goes dead with nobody noticing.
 *   3. CARRIES THE CONTEXT the server can't guess: the phone's timezone (the
 *      nudge is aimed at YOUR 07:00) and the language the app renders in (iOS
 *      draws a push from what the server sent, so the server picks the words).
 *   4. ROUTES A TAP to the surface the notification named, through core's
 *      allow-list — a payload is network input, and `router.push(payload.route)`
 *      on an unvalidated string is somebody else's navigation.
 *
 * iOS ONLY, like the IAP module beside it: Android delivery is FCM, a separate
 * key and a separate sender, and it would be a second unproven channel before
 * the first three have proved themselves. `pushSupported()` gates every screen
 * that offers it, so nothing renders a dead switch on Android.
 */

/** Remembered so the "would you like the nudge?" ask happens once, ever. */
const ASKED_KEY = "hybrid.pushAsked";
/**
 * Set when the athlete turns push OFF in Settings.
 *
 * It exists because the iOS permission and OUR registration are two different
 * facts and only one of them is ours. Turning the switch off retires the token
 * server-side, but the OS permission stays granted — so without this flag the
 * next launch's re-registration would helpfully undo the decision, and the
 * switch would read ON again by the time the athlete came back to the screen.
 */
const OFF_KEY = "hybrid.pushOff";

export type PushPermission = "granted" | "denied" | "undetermined";

/** Is remote push available on this platform at all? */
export const pushSupported = (): boolean => Platform.OS === "ios";

/**
 * ONE foreground presentation rule for every notification this app shows.
 *
 * It lives here rather than in the screen that schedules a notification because
 * `setNotificationHandler` is GLOBAL and last-writer-wins: with a handler at the
 * top of workout.tsx and another here, which one is live depended on module load
 * order, which depended on which screen the athlete opened first.
 *
 * The two cases genuinely differ, so the handler branches instead of averaging:
 *   • a REMOTE push (it carries a `kind`) belongs in Notification Centre — it is
 *     about something that happened whether or not you were looking;
 *   • the rest-timer cue is a sound for THIS moment (the set is over) and has no
 *     business still sitting in the list an hour later.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const remote = typeof notification.request.content.data?.kind === "string";
    return {
      shouldPlaySound: true,
      // Never from us: an icon badge the app doesn't clear is the exact failure
      // the bell's read state was built to end (core/notifications.ts).
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: remote,
    };
  },
});

/** What iOS currently thinks — never a request, so it's safe to call anywhere. */
export async function pushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "denied";
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

/** The three switches as the ACCOUNT holds them (user_metadata.notifications). */
async function accountPrefs(): Promise<Record<string, boolean>> {
  try {
    const { data } = await supabase.auth.getUser();
    const stored = (data.user?.user_metadata?.notifications ?? {}) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const key of Object.values(PUSH_PREF_KEY)) {
      const v = stored[key];
      out[key] = typeof v === "boolean" ? v : ACCOUNT_NOTIF_DEFAULTS[key] !== false;
    }
    return out;
  } catch {
    return { ...ACCOUNT_NOTIF_DEFAULTS };
  }
}

/** The phone's IANA zone, or undefined if this runtime can't say. */
function timezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The language the APP renders in, not the OS locale.
 *
 * They differ often enough to matter: an athlete on an English phone who set
 * HYBRID to Polish reads Polish everywhere else, and a push is the one string
 * they would receive in a language they did not choose.
 */
async function appLocale(): Promise<string | undefined> {
  try {
    return (await AsyncStorage.getItem("hybrid.lang")) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hand the current token + context to the server. Returns false if it couldn't.
 *
 * `prefs` is passed explicitly by the toggle path: `supabase.auth.updateUser`
 * has not necessarily propagated to `getUser` by the time the switch animates,
 * so re-reading the account here would mirror the value the athlete just
 * changed AWAY from.
 */
async function sendRegistration(token: string, prefs?: Record<string, boolean>): Promise<boolean> {
  const r = await registerPushDevice({
    token,
    platform: "ios",
    timezone: timezone(),
    locale: await appLocale(),
    prefs: prefs ?? (await accountPrefs()),
  });
  if (r && !r.configured) {
    // The phone is registered and nothing will arrive: the server has no APNs
    // key yet. Worth a log line rather than a silent nothing — it is the exact
    // state the push-notifications capability is blocked on.
    console.warn("[push] registered, but the server has no APNs key configured");
  }
  return !!r;
}

/** Read the APNs device token, or null if iOS won't give one. */
async function deviceToken(): Promise<string | null> {
  try {
    const t = await Notifications.getDevicePushTokenAsync();
    return typeof t.data === "string" && t.data ? t.data : null;
  } catch {
    // No entitlement, no network, a simulator — all the same answer here.
    return null;
  }
}

/**
 * Bring the server's picture of this phone up to date — the LAUNCH path.
 *
 * Only when permission is already granted: this must never be the thing that
 * shows the prompt. Safe to call on every foreground; it is one small POST.
 */
export async function syncPushRegistration(): Promise<void> {
  if (!pushSupported()) return;
  if ((await pushPermission()) !== "granted") return;
  // A phone the athlete switched off stays off, permission or not.
  if (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) return;
  const token = await deviceToken();
  if (token) await sendRegistration(token);
}

/**
 * Ask for permission and register — the deliberate ON.
 *
 * Called from Settings, and once from the check-in flow (`askPushOnce`). If the
 * athlete has already said no, iOS will not ask again from inside the app, so
 * this reports `settings: true` and the caller sends them to the Settings app
 * rather than tapping a button that silently does nothing.
 */
export async function enablePush(): Promise<{ ok: boolean; settings?: boolean }> {
  if (!pushSupported()) return { ok: false };
  const current = await pushPermission();
  if (current === "denied") return { ok: false, settings: true };
  if (current === "undetermined") {
    await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => {});
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return { ok: false, settings: status === "denied" };
    } catch {
      return { ok: false };
    }
  }
  const token = await deviceToken();
  if (!token) return { ok: false };
  await AsyncStorage.removeItem(OFF_KEY).catch(() => {});
  return { ok: await sendRegistration(token) };
}

/**
 * Stop sending to this phone — the deliberate OFF.
 *
 * The OS permission is Apple's to hold; what we can honour immediately is the
 * registration, so the token is retired server-side. The row survives (the
 * nudge's own bookkeeping with it), so turning push back on doesn't restart a
 * week of morning prompts an athlete already ignored.
 */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  await AsyncStorage.setItem(OFF_KEY, "1").catch(() => {});
  const token = await deviceToken();
  if (token) await unregisterPushDevice(token);
}

/**
 * Push one of the three switches down to the server — called on every toggle.
 *
 * The ACCOUNT keeps the switches (user_metadata, so they follow the athlete to a
 * new phone); the device row carries a mirror because the sender needs them in a
 * query and cannot afford an auth round-trip per recipient. A no-op when this
 * phone isn't registered — there is nothing to mirror onto.
 */
export async function mirrorPushPrefs(prefs: Record<string, boolean>): Promise<void> {
  if (!pushSupported()) return;
  if ((await pushPermission()) !== "granted") return;
  if (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) return;
  const token = await deviceToken();
  if (token) await sendRegistration(token, prefs);
}

/**
 * ASK ONCE, AT THE RIGHT MOMENT — called when a check-in has just been saved.
 *
 * This is the only automatic prompt in the app, and the moment is the argument
 * for it: the athlete has just done the exact thing the morning nudge exists to
 * bring them back for, so "shall I remind you tomorrow?" is a question they can
 * actually answer. A prompt at launch asks somebody who has not yet seen a
 * readiness read whether they want to be reminded about one.
 *
 * Silent no-ops on every other path: not iOS, already asked, already answered.
 */
export async function askPushOnce(): Promise<void> {
  if (!pushSupported()) return;
  if ((await pushPermission()) !== "undetermined") return;
  const asked = await AsyncStorage.getItem(ASKED_KEY).catch(() => null);
  if (asked) return;
  await enablePush();
}

/**
 * The Settings switch: is this phone reachable, and turn it on or off.
 *
 * `blocked` is the state a plain boolean cannot express and the one that makes
 * the row honest: iOS will not show the permission prompt a second time, so an
 * athlete who once said no would otherwise tap a switch that flicks back with no
 * explanation. Blocked means the only way through is the Settings app, and the
 * row says so.
 */
export function usePushSwitch(): { on: boolean; blocked: boolean; busy: boolean; toggle: () => void } {
  const [state, setState] = useState<{ on: boolean; blocked: boolean }>({ on: false, blocked: false });
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    const [p, off] = await Promise.all([pushPermission(), AsyncStorage.getItem(OFF_KEY).catch(() => null)]);
    setState({ on: p === "granted" && !off, blocked: p === "denied" });
  }, []);

  useEffect(() => {
    read();
    // Coming back from the Settings app is the one way the answer changes while
    // this screen is mounted, and it always arrives as a foreground.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") read();
    });
    return () => sub.remove();
  }, [read]);

  const toggle = useCallback(() => {
    if (busy) return;
    setBusy(true);
    (async () => {
      if (state.on) {
        // The OS permission is Apple's to hold; what we stop is the sending.
        await disablePush();
        await read();
      } else {
        const r = await enablePush();
        if (r.settings) Linking.openSettings().catch(() => {});
        await read();
      }
      setBusy(false);
    })();
  }, [busy, state.on, read]);

  return { ...state, busy, toggle };
}

/**
 * The listeners: a tap opens what the notification named, and a rotated token is
 * re-registered.
 *
 * Mounted once, from the app shell. The COLD-START case is separate and easy to
 * miss: a tap that launched the app has already been delivered before any
 * listener exists, so the last response is read explicitly — once, guarded by a
 * ref, or coming back to the shell would re-navigate you.
 */
export function usePushBridge(): void {
  const router = useRouter();
  /**
   * The id of the tap already acted on.
   *
   * An id rather than a boolean because the same response can arrive TWICE: the
   * cold-start read below and the live listener both see the tap that launched
   * the app, and `getLastNotificationResponseAsync` keeps returning it for the
   * rest of the session — so an effect that re-ran would navigate again. Two
   * copies of /checkin on the stack is not a crash, which is exactly why it
   * would have shipped.
   */
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return;

    const open = (response: Notifications.NotificationResponse) => {
      // A press on one of a notification's own BUTTONS is not a request to go
      // anywhere — the recovery read's four answers write in place and the app
      // may not even come to the foreground. Whoever registered that category
      // owns the press (lib/recovery-actions.ts); navigating here as well would
      // answer the question AND open the screen asking it.
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier;
      if (id && handled.current === id) return;
      handled.current = id ?? "";
      const data = response.notification.request.content.data as { route?: unknown } | undefined;
      const route = normalizePushRoute(data?.route);
      // No route (or one we don't publish): the bell is the honest fallback —
      // it holds every notification, so the athlete lands where the thing is.
      (router.push as (p: string) => void)(route ?? "/notifications");
    };

    // Launched BY a notification — delivered before any listener could exist.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (r) open(r);
      })
      .catch(() => {});

    const tap = Notifications.addNotificationResponseReceivedListener(open);
    // iOS rotated the token (restore, reinstall, Apple's own schedule) — the
    // server's copy is now dead, and only this event says so.
    const rotated = Notifications.addPushTokenListener((t) => {
      if (typeof t.data === "string" && t.data) sendRegistration(t.data).catch(() => {});
    });

    // And the launch sync: the token may have changed while the app was closed.
    syncPushRegistration().catch(() => {});

    return () => {
      tap.remove();
      rotated.remove();
    };
  }, [router]);
}
