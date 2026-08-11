import Svg, { Path } from "react-native-svg";
import { HUB_GLYPHS, TODAY_TABS, type HubGlyphName, type TodayTabId } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { LiquidSeg } from "./liquid-seg";

/** One Today-hub mark, drawn as a true vector at the same 72×72 stroke box and
 *  weight as AuroraSvgIcon, so the pills sit in the app's one monoline icon
 *  voice. Decorative — the Pressable carries the tab's real name. Shared with
 *  the floating dock (aurora/today-hub-dock.tsx) so the resting control and
 *  the detached row cannot draw the same three marks two ways. */
export function HubGlyph({ name, color, size = 21, strokeWidth = 3.5 }: { name: HubGlyphName; color: string; size?: number; strokeWidth?: number }) {
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
 * the brand — so it has to read as "where am I".
 *
 * IT IS THE APP'S OWN CONTROL, on every platform: the shared LiquidSeg
 * (aurora/liquid-seg.tsx) with its GLYPHS — a NEUTRAL near-solid pill at rest
 * that inflates into a clear glass lens on touch, scrubs under a drag, and
 * flies glassy on a tap. Web (apps/web/components/aurora/today-tabs.tsx) keeps
 * its CSS twin.
 *
 * ON iOS 26 THIS WAS BRIEFLY THE SYSTEM'S SEGMENTED `Picker` (GlassSegment),
 * on the reasoning that a three-way switcher at the top of a screen is the
 * most literal segmented control in the product. On device it landed ON the
 * date beneath it: the native host takes its RN height from the SwiftUI
 * content once, at mount — and this control mounts before `useLang` has its
 * labels AND remounts on every selection, because picking a tab swaps the whole
 * screen tree. See swiftui.tsx where GlassSegment was for the full account. The
 * remount is also exactly what `flightKey` below exists for, so the native form
 * was giving up the pill's flight to gain a layout it could not hold.
 *
 * THE MARKS, not words, are what the app's own track carries: three labels of
 * three different lengths do not read as one set, so they were replaced by
 * marks of matched weight. They are NOT SF Symbols — all three were
 * purpose-built to be unlike the system's (the bento is deliberately not the
 * plain 2×2 that means "all apps", and the kit has no chart glyph at all), and
 * substituting them would draw the same three marks two ways, the exact drift
 * `HubGlyph` exists to prevent since the floating dock keeps drawing them. The
 * words stay as each segment's accessible name.
 *
 * The selection pill is NEUTRAL, not the brand chartreuse (the user-approved
 * Liquid Glass preview): a hub tab goes nowhere the accent needs to point.
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
      trackStyle={{ marginTop: 16, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line }}
    />
  );
}
