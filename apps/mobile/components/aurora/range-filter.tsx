import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { View, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACTIVITY_RANGE_PRESETS, DEFAULT_ACTIVITY_RANGE,
  activityMonths, activityRangeSpanEnd, activityRangeTitleKey, resolveActivityRange,
  type ActivityRange, type LoggedSession,
} from "@hybrid/core";
import Sheet from "./sheet";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { useToday } from "../../lib/use-today";

/**
 * THE DATE FILTER — a HEAD-LEVEL CHIP carrying the window it is showing, and a
 * sheet of every period behind it. The TWIN of
 * components/aurora/range-filter.tsx on web.
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
 * than an action, so chartreuse stays reserved for "go". Two rows of chrome
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
 * subscribes to, and AsyncStorage is only where it is kept between visits.
 */

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export interface RangeLabels {
  /** The head's title — the period's name, or the localized month. */
  title: string;
  /** "27 Jul – 2 Aug" — which days the block actually means. */
  span: string;
  /** A month id ("m:2026-07") as a localized name. */
  monthLabel: (id: string, long?: boolean) => string;
}

/* ── the shared choice ──────────────────────────────────────────────────────
 * One entry per key, and every hook reading that key subscribes to it. Module
 * scope rather than a React context: the two consumers sit at opposite ends of
 * a long screen with unrelated subtrees between them, and threading a provider
 * around the whole of Today to join two filters would be a lot of plumbing for
 * one string. Mirrors web. ─────────────────────────────────────────────────── */

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
 * persisted per device under it. A stale or unknown id resolves to the week
 * rather than blanking the card. `today` is an explicit input so an app left
 * backgrounded across midnight re-derives the week rather than holding on to
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
  );

  useEffect(() => {
    if (hydrated.has(storeKey)) return;
    hydrated.add(storeKey);
    AsyncStorage.getItem(storeKey).then((v) => { if (v) writeChoice(storeKey, v); }).catch(() => {});
  }, [storeKey]);

  const pick = useCallback((id: string) => {
    writeChoice(storeKey, id);
    AsyncStorage.setItem(storeKey, id).catch(() => {});
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
  const { palette: C, scheme } = useTheme();
  return (
    <Text style={{ marginHorizontal: 2, marginBottom: 8, fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>
      {title}
    </Text>
  );
}

/**
 * The chip, and the sheet it opens.
 *
 * The LABEL IS THE SPAN — "3 – 9 Aug" — not the period's name. The name is
 * already the title of the block underneath ("This week"), and a chip repeating
 * it beside a heading 40dp away is the restatement this whole pass has been
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
  const { palette: C } = useTheme();
  const today = useToday();
  const [picker, setPicker] = useState(false);
  const { range, pick } = useActivityRange(storeKey);
  const { title, span, monthLabel } = useRangeLabels(range);
  const months = useMemo(() => activityMonths(sessions, Date.now()), [sessions, today]);

  return (
    <>
      <Pressable
        onPress={() => setPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t("w.home.act.pickTitle")} – ${title}`}
        style={{
          flexDirection: "row", alignItems: "center", gap: 5,
          backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 999,
          paddingHorizontal: 9, paddingVertical: 4,
        }}
      >
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
          {span}
        </Text>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>⌄</Text>
      </Pressable>

      {/* ── THE PERIOD SHEET — the iOS grouped list: sections, a row per
          period, a check on the one in force. It used to be reachable only
          through the segmented bar's trailing Month segment; now it is the
          whole editor. ─────────────────────────────────────────────────── */}
      <Sheet visible={picker} onClose={() => setPicker(false)} title={t("w.home.act.pickTitle")} sub={t("w.home.act.pickSub")}>
        <PickerSection label={t("w.home.act.presets")}>
          {ACTIVITY_RANGE_PRESETS.map((p) => (
            <PickerRow
              key={p.id}
              label={t(p.labelKey)}
              active={range.id === p.id}
              onPress={() => { pick(p.id); setPicker(false); }}
            />
          ))}
        </PickerSection>
        <PickerSection label={t("w.home.act.monthsHead")}>
          {months.map((id) => (
            <PickerRow
              key={id}
              label={monthLabel(id)}
              active={range.id === id}
              onPress={() => { pick(id); setPicker(false); }}
            />
          ))}
        </PickerSection>
      </Sheet>
    </>
  );
}

function PickerSection({ label, children }: { label: string; children: ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginHorizontal: 4, marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );
}

function PickerRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10,
        paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line,
      }}
    >
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: active ? C.chalk : C.ash }}>{label}</Text>
      {active && <Text style={{ fontSize: fs.note, color: txt(C, C.lime) }}>✓</Text>}
    </Pressable>
  );
}
