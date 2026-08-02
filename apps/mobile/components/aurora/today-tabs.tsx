import Svg, { Path } from "react-native-svg";
import { HUB_GLYPHS, TODAY_TABS, type HubGlyphName, type TodayTabId } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { LiquidSeg } from "./liquid-seg";

/** One Today-hub mark, drawn as a true vector at the same 72×72 stroke box and
 *  weight as AuroraSvgIcon, so the pills sit in the app's one monoline icon
 *  voice. Decorative — the Pressable carries the tab's real name. */
function HubGlyph({ name, color, size = 21, strokeWidth = 3.5 }: { name: HubGlyphName; color: string; size?: number; strokeWidth?: number }) {
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
 * full-width segments in one capsule. It sits directly under the profile
 * header, above the calendar, and it is the first thing on the screen after
 * the brand — so it has to read as "where am I". Each segment carries a
 * GLYPH, never its word: three labels of three different lengths never centre
 * as a set; marks of matched weight do.
 *
 * The selection is the shared LiquidSeg (aurora/liquid-seg.tsx): a NEUTRAL
 * near-solid pill at rest — the iOS 26 system look, chosen over the old
 * chartreuse fill in the user-approved Liquid Glass preview — that inflates
 * into a clear glass lens on touch, scrubs under a drag, and flies glassy on
 * a tap. On iOS with the Liquid Glass toggle on, the lens is real SwiftUI
 * glassEffect.
 *
 * There is no second row. The Performance tab briefly had its own chip rail
 * for Performance / Volume / Trends; those three are now ONE page, so the
 * rail had nothing left to switch between.
 */
export function TodayTabs({ value, onChange }: { value: TodayTabId; onChange: (id: TodayTabId) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <LiquidSeg
      items={TODAY_TABS.map((tab) => ({
        key: tab.id,
        label: t(tab.labelKey),
        render: (on: boolean) => <HubGlyph name={tab.glyph} color={on ? C.chalk : C.ash} />,
      }))}
      index={Math.max(0, TODAY_TABS.findIndex((tab) => tab.id === value))}
      onSelect={(i) => onChange(TODAY_TABS[i]!.id)}
      segHeight={36}
      pad={4}
      // The hub swaps the whole screen tree on selection, remounting this
      // control mid-move — the flight memory keeps the lens in the air.
      flightKey="today-hub"
      trackStyle={{ marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line }}
    />
  );
}
