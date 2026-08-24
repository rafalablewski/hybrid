import { View, Text } from "react-native";
import { WEEKDAY_LABEL_KEYS, ALPHA, type WeekChapterDay } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, type Palette } from "../../lib/theme";
import { F, fs } from "../../lib/ui";
import { RADIUS, withAlpha } from "./kit";

/**
 * A WEEK, AS SEVEN MARKS — Mon→Sun, one mark per day.
 *
 * DAY MARKS, not a bar chart. A day trained is a discrete EVENT, so it draws as
 * a mark on a path (the session summary's instrument rule: a bar is a rectangle
 * standing in for a number and says nothing about what kind of number it is).
 * Two mark sizes carry the load level, hue carries the kind (chartreuse
 * lifting, teal cardio-only), and a rest day is a faint tick.
 *
 * It is a COMPONENT rather than a block of JSX in the week chapter because the
 * week now reads in two places — the chapter in History and the week summary
 * behind it — and the same week drawn two ways in two taps is the drift this
 * whole screen was rebuilt to end. `max` is passed in for the same reason: it
 * is the athlete's busiest day across ALL weeks, so a Tuesday is the same size
 * wherever it is drawn rather than being re-scaled by whichever week it is
 * shown beside.
 */
export function WeekMarks({ days, max }: { days: readonly WeekChapterDay[]; max: number }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 22, marginBottom: 4 }}>
        {days.map((d) => (
          <View key={d.dateKey} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: markSize(d, max), height: markSize(d, max), borderRadius: RADIUS.pill, backgroundColor: markColor(C, d) }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 5 }}>
        {WEEKDAY_LABEL_KEYS.map((k) => (
          <Text key={k} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
            {t(k).slice(0, 1)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const markSize = (d: WeekChapterDay, max: number) => (d.load <= 0 ? 4 : d.load / Math.max(1, max) > 0.5 ? 10 : 7);

const markColor = (C: Palette, d: WeekChapterDay) =>
  d.load <= 0 ? withAlpha(C.ash, ALPHA.line) : d.hasCardio && !d.hasStrength ? C.blue : C.lime;
