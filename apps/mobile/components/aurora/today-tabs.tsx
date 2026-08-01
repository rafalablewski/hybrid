import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HUB_GLYPHS, TODAY_TABS, type HubGlyphName, type TodayTabId } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
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
 * TODAY HUB switcher (mobile) — the pill row that turns Today into a hub.
 * Registry (ids, order, labels, glyphs) is shared with web via @hybrid/core
 * today-tabs.ts; mirrors web (apps/web/components/aurora/today-tabs.tsx).
 *
 * ONE control, not two. It is a PRIMARY segmented control: three equal
 * full-width segments in one capsule, the active one filled chartreuse. It sits
 * directly under the profile header, above the calendar, and it is the first
 * thing on the screen after the brand — so it has to read as "where am I",
 * loudly. Each segment carries a GLYPH, never its word: three labels of three
 * different lengths never centre as a set; marks of matched weight do.
 *
 * There is no second row. The Performance tab briefly had its own chip rail for
 * Performance / Volume / Trends; those three are now ONE page, so the rail had
 * nothing left to switch between.
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
