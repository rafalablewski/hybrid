"use client";

import { HUB_GLYPHS, TODAY_TABS, type HubGlyphName, type TodayTabId } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { LiquidSeg } from "./liquid-seg";

const C = (v: string) => `var(--color-${v})`;

/** One Today-hub mark. Same 72×72 stroke box and weight as AuroraIcon, so the
 *  pills sit in the app's one monoline icon voice. Decorative here — the button
 *  carries the tab's real name as its accessible label. Shared with the
 *  floating dock (aurora/today-hub-dock.tsx) so the resting control and the
 *  detached row cannot draw the same three marks two ways. */
export function HubGlyph({ name, size = 21, strokeWidth = 3.5 }: { name: HubGlyphName; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true" style={{ display: "block" }}>
      {HUB_GLYPHS[name].map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/**
 * TODAY HUB switcher (web) — the pill row that turns Today into a hub.
 * Registry (ids, order, labels, glyphs) is shared with mobile via @hybrid/core
 * today-tabs.ts; mirrored on mobile (apps/mobile/components/aurora/today-tabs.tsx).
 *
 * ONE control, not two. It is a PRIMARY segmented control: three equal
 * full-width segments in one capsule. It sits directly under the profile
 * header, above the calendar, and it is the first thing on the screen after
 * the brand — so it has to read as "where am I". Each segment carries a
 * GLYPH, never its word: "Dashboard", "Performance" and "Feed" are three very
 * different lengths, and three unequal words in three equal segments read as
 * a control that is out of alignment with itself. Marks of matched weight
 * centre in their thirds and stay centred in every language. The word is
 * still the button's accessible name and tooltip.
 *
 * The selection is the shared LiquidSeg (aurora/liquid-seg.tsx): a NEUTRAL
 * near-solid pill at rest — the iOS 26 system look, chosen over the old
 * chartreuse fill in the user-approved Liquid Glass preview — that inflates
 * into a clear glass lens on touch, scrubs under a drag, and flies glassy on
 * a tap.
 *
 * There is no second row. The Performance tab briefly had its own chip rail
 * for Performance / Volume / Trends; those three are now ONE page, so the
 * rail had nothing left to switch between.
 */
export function TodayTabs({ value, onChange }: { value: TodayTabId; onChange: (id: TodayTabId) => void }) {
  const { t } = useLang();
  return (
    <LiquidSeg
      items={TODAY_TABS.map((tab) => ({
        key: tab.id,
        label: t(tab.labelKey),
        render: (on: boolean) => (
          <span style={{ display: "block", color: on ? C("chalk") : C("ash"), transition: "color .18s ease" }}>
            <HubGlyph name={tab.glyph} />
          </span>
        ),
      }))}
      index={Math.max(0, TODAY_TABS.findIndex((tab) => tab.id === value))}
      onSelect={(i) => onChange(TODAY_TABS[i]!.id)}
      segHeight={36}
      pad={4}
      trackStyle={{ marginTop: 16, background: C("ink2"), border: `1px solid ${C("line")}` }}
    />
  );
}
