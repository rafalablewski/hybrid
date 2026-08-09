"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
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
 * WHAT IS SHARED. The SHAPE of the control is core's
 * (activity-range-view.ts): the segment list, which one is lit, the span the
 * head prints. The CHOICE is shared too — every block passing the same key
 * reads one period and moves together the instant any one of them is scrubbed.
 * Today's two sections both pass core's TODAY_RANGE_STORE_KEY, because they are
 * the same filter shown twice, not two filters. See that constant for why.
 *
 * THAT LIVENESS IS THE WHOLE POINT OF THE STORE BELOW. A shared storage key
 * alone would leave two mounted controls disagreeing until the next launch —
 * the worse half of the bug, since the disagreeing card is a scroll away and
 * nothing on screen admits it. So the choice lives in a module store the hook
 * subscribes to, and localStorage is only where it is kept between visits.
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

/* ── the shared choice ──────────────────────────────────────────────────────
 * One entry per key, and every hook reading that key subscribes to it. Module
 * scope rather than a React context: the two consumers sit at opposite ends of
 * a long screen with unrelated subtrees between them, and threading a provider
 * around the whole of Today to join two filters would be a lot of plumbing for
 * one string. ────────────────────────────────────────────────────────────── */

const chosen = new Map<string, string>();
const watchers = new Map<string, Set<() => void>>();
/** Keys already read back from storage — the read happens once per key, not
 *  once per mounted control. */
const hydrated = new Set<string>();

const readChoice = (key: string) => chosen.get(key) ?? DEFAULT_ACTIVITY_RANGE;

function writeChoice(key: string, id: string) {
  if (chosen.get(key) === id) return;
  chosen.set(key, id);
  for (const notify of watchers.get(key) ?? []) notify();
}

function watchChoice(key: string, notify: () => void) {
  let set = watchers.get(key);
  if (!set) { set = new Set(); watchers.set(key, set); }
  set.add(notify);
  return () => { set!.delete(notify); };
}

/**
 * The chosen period. Shared by every caller passing the same `storeKey` and
 * persisted per device under it.
 *
 * The server snapshot and the pre-hydration client snapshot are both the
 * DEFAULT, so the server paint and the first client paint agree; the saved
 * choice is read back in an effect and a stale or unknown id resolves to the
 * week rather than blanking the card. `today` is an explicit input so a tab
 * left open across midnight re-derives the week rather than holding on to
 * yesterday's.
 */
export function useActivityRange(storeKey: string): {
  range: ActivityRange;
  pick: (id: string) => void;
} {
  const today = useToday();
  const rangeId = useSyncExternalStore(
    useCallback((notify: () => void) => watchChoice(storeKey, notify), [storeKey]),
    useCallback(() => readChoice(storeKey), [storeKey]),
    () => DEFAULT_ACTIVITY_RANGE,
  );

  useEffect(() => {
    if (hydrated.has(storeKey)) return;
    hydrated.add(storeKey);
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved) writeChoice(storeKey, saved);
    } catch { /* storage disabled — the week is a fine default */ }
  }, [storeKey]);

  const pick = useCallback((id: string) => {
    writeChoice(storeKey, id);
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
