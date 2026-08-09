import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { View, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACTIVITY_RANGE_PRESETS, DEFAULT_ACTIVITY_RANGE, MONTH_SEGMENT_ID,
  activityMonths, activityRangeSegIndex, activityRangeSegments, activityRangeSpanEnd,
  activityRangeTitleKey, resolveActivityRange,
  type ActivityRange, type LoggedSession,
} from "@hybrid/core";
import Sheet from "./sheet";
import { LiquidSeg } from "./liquid-seg";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { useToday } from "../../lib/use-today";

/**
 * THE DATE FILTER — Week / 7 days / 30 days / YTD / a month, in the iOS 26
 * segmented-control idiom, plus the month sheet behind its trailing segment.
 * The TWIN of components/aurora/range-filter.tsx on web.
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

/** The Explore-standard head a period-scoped block opens with: display-face
 *  title left, the span as mono meta right. */
export function RangeHead({ title, meta }: { title: string; meta: string }) {
  const { palette: C, scheme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, color: C.ash }}>{meta}</Text>
    </View>
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
  const { palette: C } = useTheme();
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
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE}
              numberOfLines={1}
              style={{
                fontFamily: on ? F.monoBold : F.mono, fontSize: 11,
                color: on ? C.chalk : C.ash, paddingHorizontal: 2,
              }}
            >
              {label(s)}{s.isMonth ? " ▾" : ""}
            </Text>
          ),
        }))}
        index={segIndex}
        onSelect={(i) => onPick(segments[i]!.id)}
        segHeight={30}
        pad={3}
        trackStyle={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, marginBottom: 10 }}
      />

      {/* ── THE MONTH PICKER — the iOS grouped list: sections, a row per
          period, a check on the one in force. ─────────────────────────────── */}
      <Sheet visible={picker} onClose={() => setPicker(false)} title={t("w.home.act.pickTitle")} sub={t("w.home.act.pickSub")}>
        <PickerSection label={t("w.home.act.presets")}>
          {ACTIVITY_RANGE_PRESETS.map((p) => (
            <PickerRow
              key={p.id}
              label={t(p.labelKey)}
              active={range.id === p.id}
              onPress={() => { onPick(p.id); setPicker(false); }}
            />
          ))}
        </PickerSection>
        <PickerSection label={t("w.home.act.monthsHead")}>
          {months.map((id) => (
            <PickerRow
              key={id}
              label={monthLabel(id)}
              active={range.id === id}
              onPress={() => { onPick(id); setPicker(false); }}
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
