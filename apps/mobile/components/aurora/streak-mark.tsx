import { useMemo } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { STREAK_MARK, STREAK_ARIA_KEY, STREAK_SUFFIX_KEY, STREAK_DESTINATION, streak, type StreakRung } from "@hybrid/core";
import { NAV_HREF } from "../../lib/nav-href";
import { useSessionsRead } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, FIXED_FONT_SCALE, PressScale as Pressable } from "../../lib/ui";
import { AuroraIcon } from "./icons";
import { RollingNumber } from "./rolling-number";

/**
 * THE STREAK MARK — mobile.
 *
 * The flame and the count, wherever the day-streak is shown: under the
 * wordmark in the app header, in the done-today sheet's sub line, under the
 * profile's heat-map. The exact twin of apps/web/components/aurora/
 * streak-mark.tsx, off the same contract (packages/core/src/streak-mark.ts).
 *
 * IT IS A CONTROL. Tapping it opens the training HISTORY — the one screen that
 * answers what the number is counting. Every surface, the same destination, and
 * the destination is NOT a prop: the whole reason the three copies of this mark
 * had drifted apart is that each site decided everything about it locally, and
 * one of them (the header, outside Today) had nowhere to go at all and rendered
 * dead text.
 *
 * IT SOURCES ITS OWN COUNT from the shared sessions cache, through the same
 * core `streak()` every other reader uses, and renders NOTHING when the streak
 * is zero. So a screen shows the mark by rendering it — there is no count to
 * pass and no way for two screens to disagree about the number.
 */
export function StreakMark({
  /** `hairline` (default) standing alone; `inline` inside a line of mono copy.
   *  See STREAK_MARK — two densities of one mark, never two designs. */
  rung = "hairline",
  /** Close whatever the mark is inside before it leaves — a sheet, chiefly.
   *  The only thing a caller may say about the tap. */
  onDismiss,
}: {
  rung?: StreakRung;
  onDismiss?: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const sessions = useSessionsRead().data ?? [];
  const days = useMemo(() => streak(sessions).current, [sessions]);
  if (days <= 0) return null;

  const type = STREAK_MARK[rung];
  const tone = txt(C, C.red);
  const markType = {
    fontFamily: F.mono,
    fontSize: type.size,
    letterSpacing: type.tracking,
    textTransform: type.caps ? "uppercase" : "none",
    color: tone,
  } as const;
  return (
    <Pressable
      onPress={() => { onDismiss?.(); router.push(NAV_HREF[STREAK_DESTINATION]!); }}
      hitSlop={{ top: 8, bottom: 10, left: 20, right: 20 }}
      accessibilityRole="button"
      accessibilityLabel={t(STREAK_ARIA_KEY).replace("{n}", String(days))}
      style={{ flexDirection: "row", alignItems: "center", gap: type.gap }}
    >
      <AuroraIcon name="flame" size={type.icon} color={tone} />
      {/* The COUNT rolls to its new value when a session extends the run —
          this is the number the mark exists to celebrate, so it moves like
          every other figure in the app (core numericDiff; the suffix is prose
          and never travels). One wrapper so the row's gap separates the flame
          from the text, never the count from its "-day streak" suffix. One
          line, always: PL/DE carry longer words ("-dniowa seria",
          "-Tage-Serie") and a wrapped mark would grow whatever it sits in —
          the header's row most of all. */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <RollingNumber value={String(days)} style={markType} />
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={markType}>
          {t(STREAK_SUFFIX_KEY)}
        </Text>
      </View>
    </Pressable>
  );
}

export default StreakMark;
