"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ACTIVITY_RANGE_PRESETS, DEFAULT_ACTIVITY_RANGE, MONTH_SEGMENT_ID,
  activityMonths, activityRangeSegIndex, activityRangeSegments, activityRangeSpanEnd,
  activityRangeTitleKey, resolveActivityRange,
  type ActivityRange, type LoggedSession,
} from "@hybrid/core";
import Sheet from "./sheet";
import { LiquidSeg } from "./liquid-seg";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { useToday } from "@/lib/use-today";

/**
 * THE DATE FILTER — Week / 7 days / 30 days / YTD / a month, in the iOS 26
 * segmented-control idiom, plus the month sheet behind its trailing segment.
 * The TWIN of components/aurora/range-filter.tsx on mobile.
 *
 * It lived inside the This-week verdict card, which was correct while that card
 * was the only period-scoped block on Today. Splitting the retrospective into
 * PROGRESS and ENDURANCE gave the screen a second one, and a second control —
 * so the control became a shared component before it became a copy. That is the
 * same rule the rail tails follow (aurora/rail-tail.tsx): five rails once drew
 * five different tails because each sized its own.
 *
 * WHAT IS SHARED and what is not. The SHAPE of the control is core's
 * (activity-range-view.ts): the segment list, which one is lit, the span the
 * head prints. The CHOICE is per-block: each caller passes its own storage key,
 * so the Progress period and the Endurance period are independent — a filter
 * belongs to the card it sits above, and scrubbing one section's window must not
 * silently rewrite a card the athlete cannot see.
 */

const C = (v: string) => `var(--color-${v})`;

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em",
  textTransform: "uppercase", whiteSpace: "nowrap",
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export interface RangeLabels {
  /** The head's title — the period's name, or the localized month. */
  title: string;
  /** "Mon 27 – Sun 2" — which days the block actually means. */
  span: string;
  /** A month id ("m:2026-07") as a localized name. */
  monthLabel: (id: string, long?: boolean) => string;
}

/**
 * The chosen period, persisted per device under `storeKey`.
 *
 * Read after mount so the server and the first client paint agree; a stale or
 * unknown id resolves to the week rather than blanking the card. `today` is an
 * explicit input so a tab left open across midnight re-derives the week rather
 * than holding on to yesterday's.
 */
export function useActivityRange(storeKey: string): {
  range: ActivityRange;
  pick: (id: string) => void;
} {
  const today = useToday();
  const [rangeId, setRangeId] = useState<string>(DEFAULT_ACTIVITY_RANGE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved) setRangeId(saved);
    } catch { /* storage disabled — the week is a fine default */ }
  }, [storeKey]);

  const pick = useCallback((id: string) => {
    setRangeId(id);
    try { localStorage.setItem(storeKey, id); } catch { /* ignore */ }
  }, [storeKey]);

  const range = useMemo(() => resolveActivityRange(rangeId, Date.now()), [rangeId, today]);
  return { range, pick };
}

/** The head's words for a range — title, span, and the month formatter both of
 *  them need. Locale formatting is the client's job; the RULES are core's. */
export function useRangeLabels(range: ActivityRange): RangeLabels {
  const { t, lang } = useLang();
  const dateFmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString(lang, opts);
  // Some locales lowercase their month names ("lipiec"); a label is a label, so
  // the first letter is raised here rather than with a blanket `capitalize`,
  // which would also turn "Last 7 days" into "Last 7 Days".
  const monthLabel = (id: string, long = true) =>
    cap(dateFmt(Date.parse(`${id.slice(2)}-01T12:00:00`), long ? { month: "long", year: "numeric" } : { month: "short" }));
  const titleKey = activityRangeTitleKey(range);
  return {
    title: titleKey ? t(titleKey) : monthLabel(range.id),
    span: `${dateFmt(range.from, { day: "numeric", month: "short" })} – ${dateFmt(activityRangeSpanEnd(range), { day: "numeric", month: "short" })}`,
    monthLabel,
  };
}

/** The Explore-standard head a period-scoped block opens with: display-face
 *  title left, the span as mono meta right. */
export function RangeHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{title}</span>
      <span style={{ ...kicker, fontSize: fs.micro, letterSpacing: ".08em", color: C("ash") }}>{meta}</span>
    </div>
  );
}

/**
 * The control itself: five equal segments and one thumb that TRAVELS — the
 * movement is what makes it read as iOS rather than as five buttons. The Month
 * segment intercepts to its picker sheet; the pill only lands on it once a
 * month is actually in force (the index moves then).
 */
export function RangeFilter({
  range, sessions, onPick,
}: {
  range: ActivityRange;
  /** Which months the picker can offer — that depends on the history. */
  sessions: LoggedSession[];
  onPick: (id: string) => void;
}) {
  const { t } = useLang();
  const today = useToday();
  const [picker, setPicker] = useState(false);
  const { monthLabel } = useRangeLabels(range);

  const segments = activityRangeSegments(range);
  const segIndex = activityRangeSegIndex(range, segments);
  const months = useMemo(() => activityMonths(sessions, Date.now()), [sessions, today]);
  const label = (s: (typeof segments)[number]) =>
    s.labelKey ? t(s.labelKey) : monthLabel(s.monthId ?? range.id, false);

  return (
    <>
      <LiquidSeg
        items={segments.map((s) => ({
          key: s.id,
          label: label(s),
          intercept: s.id === MONTH_SEGMENT_ID ? () => setPicker(true) : undefined,
          render: (on: boolean) => (
            <span
              style={{
                fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em",
                color: on ? C("chalk") : C("ash"),
                fontWeight: on ? 600 : 400,
                transition: "color .2s ease",
                maxWidth: "100%", padding: "0 4px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {label(s)}
              {s.isMonth && <span aria-hidden style={{ opacity: .6 }}> ▾</span>}
            </span>
          ),
        }))}
        index={segIndex}
        onSelect={(i) => onPick(segments[i]!.id)}
        segHeight={30}
        pad={3}
        trackStyle={{ background: C("ink"), border: `1px solid ${C("line")}`, marginBottom: 10 }}
      />

      {/* ── THE MONTH PICKER — the iOS grouped list: sections, a row per
          period, a check on the one in force. ─────────────────────────────── */}
      <Sheet open={picker} onClose={() => setPicker(false)} title={t("w.home.act.pickTitle")} sub={t("w.home.act.pickSub")}>
        <PickerSection label={t("w.home.act.presets")}>
          {ACTIVITY_RANGE_PRESETS.map((p) => (
            <PickerRow
              key={p.id}
              label={t(p.labelKey)}
              active={range.id === p.id}
              onClick={() => { onPick(p.id); setPicker(false); }}
            />
          ))}
        </PickerSection>
        <PickerSection label={t("w.home.act.monthsHead")}>
          {months.map((id) => (
            <PickerRow
              key={id}
              label={monthLabel(id)}
              active={range.id === id}
              onClick={() => { onPick(id); setPicker(false); }}
            />
          ))}
        </PickerSection>
      </Sheet>
    </>
  );
}

function PickerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...kicker, color: C("ash"), margin: "0 4px 6px" }}>{label}</div>
      <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function PickerRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className="pressable"
      onClick={onClick}
      aria-current={active}
      style={{
        display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "12px 16px", background: "transparent", border: "none",
        borderTop: `1px solid ${C("line")}`, cursor: "pointer", textAlign: "left",
        fontSize: fs.bodyLg, color: active ? C("chalk") : C("ash"),
      }}
    >
      <span>{label}</span>
      {active && <span style={{ color: "var(--lime-text)", fontSize: fs.note }} aria-hidden>✓</span>}
    </button>
  );
}
