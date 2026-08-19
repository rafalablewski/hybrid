import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import {
  READINESS_FEELINGS,
  ratingForFeeling,
  quickCheckinPatch,
  makeT,
  type Lang,
  type ReadinessFeeling,
} from "@hybrid/core";
import { createCheckin } from "./api";
import { useLang } from "./i18n";
import { useRevalidate } from "./queries";
import { cancelRecoveryReminder, RECOVERY_CATEGORY, recoveryActionId, feelingForAction } from "./recovery-reminder";
import { pushSupported } from "./push";

/**
 * ANSWERING WITHOUT OPENING THE APP.
 *
 * The recovery read is one tap on a four-point scale. Requiring an app launch
 * to deliver that tap is the largest avoidable tax on whether it happens at
 * all — the athlete is asked at 18:30 on a Tuesday, and "open HYBRID, wait for
 * Today to load, find the card" is a different proposition from pressing a
 * button already on the lock screen.
 *
 * It is also what makes the pair honest. `feelReading` divides a report by the
 * residual expected at its LAG, so the answer's value depends on when it was
 * given; an answer given at the moment of the ask has a lag the app knows
 * exactly, instead of one that drifted by however long it took the athlete to
 * get round to opening the app.
 *
 * The four buttons are the readiness picker's own levels, in the picker's own
 * order and words, writing through the same `quickCheckinPatch` the card
 * writes — no second instrument, no second scale, no second idea of what a
 * readiness answer is.
 */

export { RECOVERY_CATEGORY, feelingForAction };

/**
 * Register the four buttons. Idempotent, and cheap enough to redo whenever the
 * language changes — the titles are drawn from the payload iOS holds, so a
 * category registered in English keeps saying "Wrecked" until it is replaced.
 */
export async function registerRecoveryCategory(lang: Lang): Promise<void> {
  if (!pushSupported()) return;
  const t = makeT(lang);
  try {
    await Notifications.setNotificationCategoryAsync(
      RECOVERY_CATEGORY,
      // Worst first, matching the picker's own left-to-right order so the
      // buttons and the card never disagree about which end is which.
      READINESS_FEELINGS.map((f) => ({
        identifier: recoveryActionId(f),
        buttonTitle: t(`w.recovery.readiness.${f}`),
        options: {
          // Answer in place. Opening the app would defeat the point, and the
          // write below needs no UI.
          opensAppToForeground: false,
        },
      })),
    );
  } catch {
    // Categories unavailable (Android, older runtime) — the notification still
    // arrives, it just has to be tapped through to the check-in screen.
  }
}

/**
 * Write the readiness read a button press stands for.
 *
 * Exported for the response handler below and for anything else that needs the
 * same one-line write. Returns false when the write failed — including the 6 h
 * re-log cooldown, which is not an error: the athlete already answered, and the
 * reminder should still go away.
 */
export async function logRecoveryRead(feeling: ReadinessFeeling): Promise<boolean> {
  const r = await createCheckin({
    weekOf: new Date().toISOString(),
    ...quickCheckinPatch(ratingForFeeling(feeling)),
  });
  return r.ok;
}

/**
 * Listen for a press on one of the four buttons and write it.
 *
 * A SECOND listener alongside `usePushBridge`'s, deliberately: that one owns
 * navigation for a tap on the notification BODY and returns early for any
 * custom action, so the two never both act on one press.
 */
export function useRecoveryReadActions(): void {
  const { lang } = useLang();
  const revalidate = useRevalidate();

  useEffect(() => {
    if (!pushSupported()) return;
    void registerRecoveryCategory(lang);

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const feeling = feelingForAction(response.actionIdentifier);
      if (!feeling) return;
      void (async () => {
        await logRecoveryRead(feeling);
        // Cancel either way. A failed write is usually the cooldown — the read
        // is already in — and a reminder that keeps asking for something
        // already given is how a channel earns a mute.
        await cancelRecoveryReminder();
        revalidate.recovery();
      })();
    });
    return () => sub.remove();
  }, [lang, revalidate]);
}
