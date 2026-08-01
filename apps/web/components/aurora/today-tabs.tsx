"use client";

import { HUB_GLYPHS, TODAY_TABS, type HubGlyphName, type TodayTabId } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;

/** One Today-hub mark. Same 72×72 stroke box and weight as AuroraIcon, so the
 *  pills sit in the app's one monoline icon voice. Decorative here — the button
 *  carries the tab's real name as its accessible label. */
function HubGlyph({ name, size = 21, strokeWidth = 3.5 }: { name: HubGlyphName; size?: number; strokeWidth?: number }) {
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
 * full-width segments in one capsule, the active one filled chartreuse. It sits
 * directly under the profile header, above the calendar, and it is the first
 * thing on the screen after the brand — so it has to read as "where am I",
 * loudly. Each segment carries a GLYPH, never its word: "Dashboard",
 * "Performance" and "Feed" are three very different lengths, and three unequal
 * words in three equal segments read as a control that is out of alignment with
 * itself. Marks of matched weight centre in their thirds and stay centred in
 * every language. The word is still the button's accessible name and tooltip.
 *
 * There is no second row. The Performance tab briefly had its own chip rail for
 * Performance / Volume / Trends; those three are now ONE page, so the rail had
 * nothing left to switch between.
 */
export function TodayTabs({ value, onChange }: { value: TodayTabId; onChange: (id: TodayTabId) => void }) {
  const { t } = useLang();
  return (
    <div
      role="tablist"
      aria-label={t("nav.today")}
      style={{ display: "flex", gap: 4, padding: 4, marginTop: 14, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999 }}
    >
      {TODAY_TABS.map((tab) => {
        const on = tab.id === value;
        const label = t(tab.labelKey);
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={on}
            aria-label={label}
            title={label}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              color: on ? "var(--on-accent)" : C("ash"),
              background: on ? C("lime") : "transparent",
              transition: "background .18s ease, color .18s ease",
            }}
          >
            <HubGlyph name={tab.glyph} />
          </button>
        );
      })}
    </div>
  );
}
