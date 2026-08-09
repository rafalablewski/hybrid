"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import {
  ACTIVITY_RANGE_PRESETS, DEFAULT_ACTIVITY_RANGE,
  activityMonths, activityRangeSpanEnd, activityRangeTitleKey, resolveActivityRange,
  type ActivityRange, type LoggedSession,
} from "@hybrid/core";
import Sheet from "./sheet";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { useToday } from "@/lib/use-today";

/**
 * THE DATE FILTER — a HEAD-LEVEL CHIP carrying the window it is showing, and a
 * sheet of every period behind it. The TWIN of
 * components/aurora/range-filter.tsx on mobile.
 *
 * IT SITS ON THE CLUSTER'S HEADLINE ROW, which is where the Explore SectionHead
 * grammar puts a head-level control — beside the title, never under it. That is
 * the fix for what it used to be: a full-width five-segment bar nested under
 * the This-week block head, three levels down, reading as that one card's
 * control while actually scoping the whole retrospective. A filter belongs at
 * the altitude of the thing it filters.
 *
 * SO THE SEGMENTED BAR IS GONE from Today, and the SHEET it always had is now
 * the whole editor: presets and months in one grouped list, with a check on the
 * one in force. The chip is the same idiom the endurance lanes' order control
 * already uses — a bordered pill in ash with a chevron, a state selector rather
 * than an action, so chartreuse stays reserved for "go". Two lines of chrome
 * became one, on a row that had space to spare.
 *
 * It is a shared component because the screen has two clusters and both carry
 * one — the same rule the rail tails follow (aurora/rail-tail.tsx): five rails
 * once drew five different tails because each sized its own.
 *
 * WHAT IS SHARED. The SHAPE is core's (activity-range-view.ts): the preset
 * list, the title, the span the chip prints. The CHOICE is shared too — every
 * block passing the same key reads one period and moves together the instant
 * any one of them is changed. Today's two clusters both pass core's
 * TODAY_RANGE_STORE_KEY, so the two chips are one filter shown twice and can
 * never drift apart. See that constant for why.
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

/** The Explore-standard head a period-scoped block opens with — the display-face
 *  title, and nothing on the right. The span used to ride that slot; it is on
 *  the cluster's head chip now, so the block states its window's NAME and lets
 *  the control state its dates. */
export function RangeHead({ title }: { title: string }) {
  return (
    <div style={{ margin: "0 2px 8px", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>
      {title}
    </div>
  );
}

/**
 * The chip, and the sheet it opens.
 *
 * The LABEL IS THE SPAN — "3 – 9 Aug" — not the period's name. The name is
 * already the title of the block underneath ("This week"), and a chip repeating
 * it beside a heading 40px away is the restatement this whole pass has been
 * removing. Dates with a chevron also say "date filter" without a word of
 * chrome, and they are the fact a period's NAME cannot give you: which seven
 * days "this week" actually means. The name rides the accessible label, so the
 * control still announces itself as the period it is.
 */
export function RangeFilter({
  storeKey,
  sessions,
}: {
  /** Which period this control edits. Same key → same period, live. */
  storeKey: string;
  /** Which months the sheet can offer — that depends on the history. */
  sessions: LoggedSession[];
}) {
  const { t } = useLang();
  const today = useToday();
  const [picker, setPicker] = useState(false);
  const { range, pick } = useActivityRange(storeKey);
  const { title, span, monthLabel } = useRangeLabels(range);
  const months = useMemo(() => activityMonths(sessions, Date.now()), [sessions, today]);

  return (
    <>
      <button
        className="pressable"
        onClick={() => setPicker(true)}
        aria-haspopup="dialog"
        aria-label={`${t("w.home.act.pickTitle")} – ${title}`}
        style={{
          display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
          background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999,
          padding: "4px 9px", color: C("ash"), flex: "0 0 auto",
        }}
      >
        <span style={{ ...kicker, fontSize: fs.nano, color: C("ash") }}>{span}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano }} aria-hidden>⌄</span>
      </button>

      {/* ── THE PERIOD SHEET — the iOS grouped list: sections, a row per
          period, a check on the one in force. It used to be reachable only
          through the segmented bar's trailing Month segment; now it is the
          whole editor. ─────────────────────────────────────────────────── */}
      <Sheet open={picker} onClose={() => setPicker(false)} title={t("w.home.act.pickTitle")} sub={t("w.home.act.pickSub")}>
        <PickerSection label={t("w.home.act.presets")}>
          {ACTIVITY_RANGE_PRESETS.map((p) => (
            <PickerRow
              key={p.id}
              label={t(p.labelKey)}
              active={range.id === p.id}
              onClick={() => { pick(p.id); setPicker(false); }}
            />
          ))}
        </PickerSection>
        <PickerSection label={t("w.home.act.monthsHead")}>
          {months.map((id) => (
            <PickerRow
              key={id}
              label={monthLabel(id)}
              active={range.id === id}
              onClick={() => { pick(id); setPicker(false); }}
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
