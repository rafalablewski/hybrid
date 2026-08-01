import { View, Text, Pressable, ScrollView } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HUB_GLYPHS, PERFORMANCE_VIEWS, TODAY_TABS, type HubGlyphName, type PerformanceViewId, type TodayTabId } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { RADIUS } from "./kit";

/** One Today-hub mark, drawn as a true vector at the same 72×72 stroke box and
 *  weight as AuroraSvgIcon, so the pills sit in the app's one monoline icon
 *  voice. Decorative — the Pressable carries the tab's real name. */
function HubGlyph({ name, color, size = 21, strokeWidth = 5 }: { name: HubGlyphName; color: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {HUB_GLYPHS[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

/**
 * TODAY HUB switchers (mobile) — the pill row that turns Today into a hub, plus
 * the Performance tab's own secondary chip rail. Registry (ids, order, labels)
 * is shared with web via @hybrid/core today-tabs.ts; mirrors web
 * (apps/web/components/aurora/today-tabs.tsx).
 *
 * TWO LEVELS, TWO TREATMENTS — deliberately not the same control twice:
 *  - TodayTabs is a PRIMARY segmented control: three equal full-width segments
 *    in one capsule, the active one filled chartreuse. It sits directly under
 *    the profile header, above the calendar, and it is the first thing on the
 *    screen after the brand — so it has to read as "where am I", loudly.
 *  - PerformanceViews is the SECONDARY chip rail already established by
 *    History's view switcher: small mono chips, hugging their labels, full
 *    bleed to the screen edge. A second row of big pills would flatten the
 *    hierarchy and leave the athlete unsure which row nests inside which.
 */
export function TodayTabs({ value, onChange }: { value: TodayTabId; onChange: (id: TodayTabId) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <View style={{ flexDirection: "row", gap: 4, padding: 4, marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill }}>
      {TODAY_TABS.map((tab) => {
        const on = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityLabel={t(tab.labelKey)}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.lime : "transparent" }}
          >
            <HubGlyph name={tab.glyph} color={on ? C.onAccent : C.ash} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** The Performance tab's three views (Performance / Volume / Trends) — the
 *  History switcher's chip idiom, full-bleed so the rail clips at the true
 *  screen edge and rests on the content column. */
export function PerformanceViews({ value, onChange }: { value: PerformanceViewId; onChange: (id: PerformanceViewId) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -16 }} contentContainerStyle={{ gap: 7, paddingBottom: 4, paddingHorizontal: 16 }}>
      {PERFORMANCE_VIEWS.map((v) => {
        const on = v.id === value;
        return (
          <Pressable key={v.id} onPress={() => onChange(v.id)} accessibilityState={{ selected: on }} style={{ borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : C.ink2 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? C.onAccent : C.ash, fontWeight: on ? "700" : "400" }}>{t(v.labelKey)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
