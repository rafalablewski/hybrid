import { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import * as Notifications from "expo-notifications";
import { ALPHA, mmss } from "@hybrid/core";
import { fs, tracking, F, PressScale, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { haptic } from "../../lib/haptics";
import { RADIUS } from "./geometry";
import { withAlpha } from "./field";
import { Glyph } from "./icons";

/**
 * THE COOK STEP'S TIMER — the chip that finally runs.
 *
 * `RecipeStep.timerSec` has always been documented in @hybrid/core recipes.ts
 * as "surfaced as a tappable chip", and on both clients it rendered as TEXT: a
 * stopwatch glyph, "8:00", and nothing behind it. Shakshuka carries three of
 * them. A number that looks like a control and answers no press is worse than
 * no number at all — it teaches you the app's affordances are decorative.
 *
 * THE CLOCK IS A DEADLINE, NOT A COUNTER. It stores `endsAt` and derives the
 * remainder from the wall clock on every tick, so a dropped frame, a slow JS
 * thread or a minute spent in another app cannot make the pan cook longer than
 * the recipe says. The interval only decides how often the label is redrawn.
 *
 * AND IT SURVIVES THE APP. A local notification is scheduled for the same
 * instant, so the cue arrives with the phone face-down on the counter — the
 * rest timer's exact pattern (app/workout.tsx), through the one global
 * presentation handler in lib/push.ts, and silently skipped where notifications
 * are unavailable. It is cancelled when the timer is stopped, when the step
 * changes and when the screen unmounts: a "your onions are done" arriving an
 * hour after you ate is the failure this is copying its cancellation from.
 */
export function CookStepTimer({ seconds, stepNumber }: { seconds: number; stepNumber: number }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(seconds);
  const [done, setDone] = useState(false);
  const notifId = useRef<string | null>(null);

  // A new step is a new timer — never the previous step's clock still running
  // under a different instruction.
  useEffect(() => {
    setEndsAt(null);
    setLeft(seconds);
    setDone(false);
  }, [seconds, stepNumber]);

  useEffect(() => {
    if (endsAt == null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        setEndsAt(null);
        setDone(true);
        // A hard arrival, exactly like the rest timer's — the one place this
        // app spends `heavy`.
        haptic.heavy();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  const cancelNotification = () => {
    const id = notifId.current;
    notifId.current = null;
    if (id) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  };

  // Unmount (leaving the cook screen, or the recipe) takes the alert with it.
  useEffect(() => cancelNotification, []);

  const start = () => {
    haptic.light();
    setDone(false);
    setEndsAt(Date.now() + seconds * 1000);
    (async () => {
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: t("w.recovery.nutrition.recipeTimerDone"),
            body: t("w.recovery.nutrition.recipeTimerDoneBody").replace("{n}", String(stepNumber)),
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
        });
        notifId.current = id;
      } catch {
        // notifications unavailable (permission denied, simulator) — the
        // on-screen countdown is the whole feature either way
      }
    })();
  };

  const stop = () => {
    haptic.light();
    cancelNotification();
    setEndsAt(null);
    setLeft(seconds);
    setDone(false);
  };

  const running = endsAt != null;
  const ink = txt(C, C.amber);
  // How far through the step is, as the chip's own fill — the progress bar this
  // row has no width for, drawn as the thing it is measuring.
  const progress = running ? 1 - left / Math.max(1, seconds) : done ? 1 : 0;

  return (
    <PressScale
      onPress={running ? stop : start}
      accessibilityRole="button"
      accessibilityLabel={t(running ? "w.recovery.nutrition.recipeTimerStop" : "w.recovery.nutrition.recipeTimerStart")}
      accessibilityState={{ busy: running }}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: withAlpha(C.amber, running || done ? ALPHA.line : ALPHA.edge),
        backgroundColor: C.ink2,
        overflow: "hidden",
      }}
    >
      {/* the fill IS the countdown */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.round(progress * 100)}%`,
          backgroundColor: withAlpha(C.amber, ALPHA.wash),
        }}
      />
      <Glyph name="stopwatch" size={fs.body} color={ink} />
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ fontFamily: running ? F.monoBold : F.mono, fontSize: fs.caption, letterSpacing: tracking.label, color: ink }}
      >
        {done
          ? t("w.recovery.nutrition.recipeTimerDone")
          : running
            ? t("w.recovery.nutrition.recipeTimerLeft").replace("{v}", mmss(left))
            : `${mmss(seconds)} ${t("w.recovery.nutrition.timer")}`}
      </Text>
    </PressScale>
  );
}
