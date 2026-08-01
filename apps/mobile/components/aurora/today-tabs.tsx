import { View, Text, Pressable, ScrollView } from "react-native";
import { PERFORMANCE_VIEWS, TODAY_TABS, type PerformanceViewId, type TodayTabId } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { RADIUS } from "./kit";

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
            accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.lime : "transparent" }}
          >
            <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: 0.3, fontWeight: on ? "700" : "400", color: on ? C.onAccent : C.ash }}>
              {t(tab.labelKey)}
            </Text>
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
