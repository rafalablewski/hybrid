"use client";

import { fs, PERFORMANCE_VIEWS, TODAY_TABS, type PerformanceViewId, type TodayTabId } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const MONO = "var(--font-mono)";

/**
 * TODAY HUB switchers (web) — the pill row that turns Today into a hub, plus
 * the Performance tab's own secondary chip rail. Registry (ids, order, labels)
 * is shared with mobile via @hybrid/core today-tabs.ts; mirrored on mobile
 * (apps/mobile/components/aurora/today-tabs.tsx).
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
  const { t } = useLang();
  return (
    <div
      role="tablist"
      aria-label={t("nav.today")}
      style={{ display: "flex", gap: 4, padding: 4, marginTop: 14, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999 }}
    >
      {TODAY_TABS.map((tab) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: fs.caption,
              letterSpacing: ".04em",
              fontWeight: on ? 700 : 400,
              color: on ? "var(--on-accent)" : C("ash"),
              background: on ? C("lime") : "transparent",
              transition: "background .18s ease, color .18s ease",
            }}
          >
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

/** The Performance tab's three views (Performance / Volume / Trends) — the
 *  History switcher's chip idiom, full-bleed so the rail clips at the true
 *  screen edge and rests on the content column. */
export function PerformanceViews({ value, onChange }: { value: PerformanceViewId; onChange: (id: PerformanceViewId) => void }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none", margin: "12px calc(-1 * var(--page-pad-x, 16px)) 0", padding: "0 var(--page-pad-x, 16px) 4px" }}>
      {PERFORMANCE_VIEWS.map((v) => {
        const on = v.id === value;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            aria-pressed={on}
            style={{ fontFamily: MONO, fontSize: fs.caption, whiteSpace: "nowrap", borderRadius: 999, padding: "6px 14px", cursor: "pointer", border: `1px solid ${on ? C("lime") : C("line")}`, color: on ? "var(--on-accent)" : C("ash"), background: on ? C("lime") : C("ink2"), fontWeight: on ? 700 : 400 }}
          >
            {t(v.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
