import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, Animated, Easing } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  activityVerdict, activitySummary, activityDetailKey, activityMonths,
  resolveActivityRange, groupDistanceDisplay, ACTIVITY_RANGE_PRESETS, DEFAULT_ACTIVITY_RANGE,
  verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey, fmtTonnage, durations,
  type ActivityDetail, type ActivityEntry, type ActivityGroup, type ActivityMetric,
  type ActivityRange, type ActivityVerdict, type BodyweightInput, type LoggedSession, type WeightUnit,
} from "@hybrid/core";
import Sheet from "./sheet";
import { LiquidSeg } from "./liquid-seg";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf, PressScale, cardShadow, PressScale as Pressable } from "../../lib/ui";
import { useToday } from "../../lib/use-today";
import { useReducedMotion } from "../../lib/use-reduced-motion";

/**
 * THE ACTIVITY CARD — "This week" and everything the date filter turns it into,
 * the TWIN of components/aurora/week-verdict.tsx on web.
 *
 * Statistics and Analytics were two destinations answering the same question at
 * different depths. This is what replaced them on Today: a SENTENCE naming the
 * metric that moved, its baseline as the working-out, and — under a hairline —
 * the figures the sentence was drawn from.
 *
 * It is the ONLY totals card on Today, and it now summarises ALL activity, not
 * just what was lifted: a tennis match logged as 90 minutes on a block counts
 * toward the hours even with no stopwatch running, and every sport's distance
 * lands in the KM column. See core activity-window.ts for the attribution rule.
 *
 * THREE THINGS THE CARD GAINED, and why each one is here:
 *
 *   • A REAL WEEK. "This week" is MONDAY → SUNDAY now, not a rolling seven days
 *     that reports last Friday under a label claiming the current week.
 *   • A DATE FILTER, in the iOS 26 segmented-control idiom (the shared
 *     LiquidSeg): a neutral pill at rest that turns into a clear glass lens on
 *     touch, scrubs under a drag, and springs between segments, with the label
 *     it lands on taking the foreground. Week / 7 days / 30 days / YTD, with
 *     the fifth segment opening a sheet of individual months. Persisted per
 *     device.
 *   • FIGURES THAT OPEN. Every column is a button; pressing one expands a panel
 *     beneath the row — with a caret sliding along to point at the column it
 *     belongs to — carrying the groups the total is made of and the sessions
 *     underneath them. "41.6 km" becomes 39 km of running, 600 m in the pool
 *     and the rest across tennis and squash, each with its own sessions.
 *
 * The card NEVER disappears. A block that comes and goes is worse than one that
 * is sometimes quiet, so an empty period keeps its place and says so.
 *
 * Colour is the SEMANTIC channel here (terracotta down, chartreuse up, ash
 * flat), not the brand accent — a bad week must not read as a highlight.
 */

const STORE_KEY = "hybrid.today.range";
const ROWS_SHOWN = 5;

/** The segment labels are SHORTER than the card's own title for the same
 *  period ("7 days" under a card headed "Last 7 days") — a segmented control
 *  that wraps is a segmented control that has stopped being one. */
const SHORT_KEY: Record<string, string> = {
  week: "w.home.act.sWeek", d7: "w.home.act.sD7", d30: "w.home.act.sD30", ytd: "w.home.act.sYtd",
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Render a "{m}"-templated sentence with the metric name in bold. */
function Lead({ template, word, color }: { template: string; word: string | null; color: string }) {
  const [before, after] = template.split("{m}");
  if (after === undefined || !word) {
    return <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 20, color }}>{template}</Text>;
  }
  return (
    <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 20, color }}>
      {before}
      <Text style={{ fontFamily: F.bold }}>{word}</Text>
      {after}
    </Text>
  );
}

/** One destination row — the door to everything past this period. Exported
 *  since wave 3: the doors render at the END of the Progress cluster (in
 *  home.tsx), as the whole cluster's single exit point, not under this card. */
export function DoorRow({ title, sub, glyph, onPress }: { title: string; sub: string; glyph: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} – ${sub}`}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10,
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16,
        paddingHorizontal: 16, paddingVertical: 12,
      }}
    >
      <View style={{
        width: 32, height: 32, borderRadius: 12, backgroundColor: C.ink,
        borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 13, color: C.ash }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{sub}</Text>
      </View>
      <Text style={{ fontSize: fs.note, color: C.ash }}>›</Text>
    </PressScale>
  );
}

export default function AuroraWeekVerdict({
  sessions,
  units,
  bw,
  onSession,
}: {
  sessions: LoggedSession[];
  units: WeightUnit;
  bw?: BodyweightInput;
  /** Open one logged session from the breakdown. */
  onSession?: (id: string) => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t, lang } = useLang();
  const today = useToday();
  const reduced = useReducedMotion();

  const [rangeId, setRangeId] = useState<string>(DEFAULT_ACTIVITY_RANGE);
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState<ActivityMetric | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then((v) => { if (v) setRangeId(v); }).catch(() => {});
  }, []);

  const pick = (id: string) => {
    setRangeId(id);
    setGroup(null);
    setAll(false);
    AsyncStorage.setItem(STORE_KEY, id).catch(() => {});
  };

  // `today` is an explicit input so an app left backgrounded across midnight
  // re-derives the week rather than holding on to yesterday's.
  const range: ActivityRange = useMemo(() => resolveActivityRange(rangeId, Date.now()), [rangeId, today]);
  const v: ActivityVerdict = useMemo(() => activityVerdict(sessions, range, bw), [sessions, range, bw]);
  const summary = useMemo(() => activitySummary(sessions, range, bw), [sessions, range, bw]);
  const months = useMemo(() => activityMonths(sessions, Date.now()), [sessions, today]);

  // ── Formatting. Canonical → display; tonnage honours the athlete's unit,
  // minutes read as hours to one decimal, distance to one decimal km.
  const fmt = (metric: string, value: number) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? String(Math.round(value / 6) / 10)
        : metric === "distance" ? String(Math.round(value * 10) / 10)
          : String(Math.round(value));

  const fmtMinutes = (m: number) =>
    m < 60 ? `${Math.round(m)} ${t("w.home.act.uMin")}` : `${Math.round(m / 6) / 10} ${t("w.home.act.uH")}`;

  /** A contribution in ITS OWN unit — 600 m of swimming inside a km total. */
  const fmtValue = (metric: ActivityMetric, value: number, g: { unit: "km" | "m" }) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? fmtMinutes(value)
        : metric === "distance" ? `${groupDistanceDisplay(value, g.unit)} ${g.unit}`
          : value === 1 ? t("w.home.act.oneSession") : t("w.home.act.nSessions").replace("{n}", String(Math.round(value)));

  const groupName = (g: { labelKey: string | null; label: string | null }) => (g.labelKey ? t(g.labelKey) : g.label ?? "");

  const dateFmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString(lang, opts);
  // Some locales lowercase their month names ("lipiec"); a label is a label, so
  // the first letter is raised here rather than with a blanket `capitalize`,
  // which would also turn "Last 7 days" into "Last 7 Days".
  const monthLabel = (id: string, long = true) =>
    cap(dateFmt(Date.parse(`${id.slice(2)}-01T12:00:00`), long ? { month: "long", year: "numeric" } : { month: "short" }));

  const title = range.kind === "month" ? monthLabel(range.id) : t(range.labelKey ?? "w.home.act.rWeek");
  // A year-to-date span ends TODAY; a week or a month shows its whole frame, so
  // "27 Jul – 2 Aug" says which seven days the card means even on Tuesday.
  const spanEnd = (range.kind === "ytd" ? range.through : range.to) - 1;
  const span = `${dateFmt(range.from, { day: "numeric", month: "short" })} – ${dateFmt(spanEnd, { day: "numeric", month: "short" })}`;

  const tone = v.direction === "down" ? C.red : v.direction === "up" ? C.lime : C.ash;
  const toneText = txt(C, tone);
  const named = v.figures.find((f) => f.metric === v.metric) ?? null;

  const why = v.metric && named
    ? t(verdictWhyKey(v))
        .replace("{v}", fmt(named.metric, named.value))
        .replace("{b}", fmt(named.metric, named.baseline))
    : t(verdictWhyKey(v));

  // Four columns only ever appear for a hybrid athlete (tonnage + distance);
  // at that width the figures need a size down to stay on one line.
  const wide = v.figures.length > 3;
  const figSize = wide ? 17 : fs.heading;
  const gutter = wide ? 9 : 12;

  // Named metric first — the sentence's subject shouldn't be the last column.
  const ordered = v.metric
    ? [...v.figures].sort((a, b) => (a.metric === v.metric ? -1 : b.metric === v.metric ? 1 : 0))
    : v.figures;

  const openIndex = open ? ordered.findIndex((f) => f.metric === open) : -1;
  const detail: ActivityDetail | null = open ? summary.details[open] : null;
  const shown = detail
    ? (group ? detail.groups.find((g) => g.id === group)?.items ?? detail.items : detail.items)
    : [];
  const rows = all ? shown : shown.slice(0, ROWS_SHOWN);

  const toggle = (m: ActivityMetric) => {
    setGroup(null);
    setAll(false);
    setOpen((cur) => (cur === m ? null : m));
  };

  // ── The segmented control. Five equal segments and one thumb that TRAVELS —
  // the movement is what makes it read as iOS rather than as five buttons.
  const segments = [
    ...ACTIVITY_RANGE_PRESETS.map((p) => ({ id: p.id, label: t(SHORT_KEY[p.id] ?? p.labelKey) })),
    { id: "month", label: range.kind === "month" ? monthLabel(range.id, false) : t("w.home.act.sMonth") },
  ];
  const segIndex = range.kind === "month" ? segments.length - 1 : Math.max(0, segments.findIndex((s) => s.id === range.id));

  // ── The drawer. Height is measured off the panel and animated, so the detail
  // SLIDES out of the figure row instead of appearing under it.
  const [panelH, setPanelH] = useState(0);
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(grow, {
      toValue: open ? 1 : 0,
      duration: reduced ? durations.reduced : 320,
      easing: reduced ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, reduced, grow]);

  // The caret travels in MEASURED pixels — a percentage string can't be
  // animated on the native driver, and the caret has to arrive with the panel.
  const [rowW, setRowW] = useState(0);
  const caretX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (rowW <= 0 || openIndex < 0) return;
    Animated.spring(caretX, {
      toValue: ((openIndex + 0.5) * rowW) / Math.max(1, ordered.length) - 5,
      useNativeDriver: true, speed: 16, bounciness: 4,
    }).start();
  }, [openIndex, rowW, ordered.length, caretX]);

  return (
    <View style={{ marginTop: 20 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          head names the window so no figure below it needs a qualifier. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, color: C.ash }}>{span}</Text>
      </View>

      {/* ── THE DATE FILTER — the shared LiquidSeg: neutral pill at rest,
          clear glass lens on touch/drag, per the iOS 26 system control. The
          Month segment intercepts to its picker sheet; the pill only lands on
          it once a month is actually in force (segIndex moves then). ─────── */}
      <LiquidSeg
        items={segments.map((s) => ({
          key: s.id,
          label: s.label,
          intercept: s.id === "month" ? () => setPicker(true) : undefined,
          render: (on: boolean) => (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: on ? F.monoBold : F.mono, fontSize: 11,
                color: on ? C.chalk : C.ash, paddingHorizontal: 2,
              }}
            >
              {s.label}{s.id === "month" ? " ▾" : ""}
            </Text>
          ),
        }))}
        index={segIndex}
        onSelect={(i) => pick(segments[i]!.id)}
        segHeight={30}
        pad={3}
        trackStyle={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, marginBottom: 10 }}
      />

      <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, paddingHorizontal: 16, paddingVertical: 16, ...cardShadow(scheme) }}>
        {/* THE VERDICT — sentence, its working-out, and the signed delta. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Lead
              template={t(verdictLeadKey(v))}
              word={v.metric ? t(verdictMetricKey(v.metric)) : null}
              color={C.chalk}
            />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: 16, color: C.ash, marginTop: 5 }}>{why}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: 23, letterSpacing: -0.5, color: toneText }}>
            {v.metric ? `${v.deltaPct > 0 ? "+" : "−"}${Math.abs(v.deltaPct)}%` : "—"}
          </Text>
        </View>

        {/* THE RECEIPTS — the figures the sentence was drawn from. Each one is
            a button onto its own breakdown. */}
        <View
          onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
          style={{ flexDirection: "row", marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}
        >
          {ordered.map((f, i) => {
            const isNamed = f.metric === v.metric;
            const isOpen = open === f.metric;
            return (
              <Pressable
                key={f.metric}
                onPress={() => toggle(f.metric)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${t(verdictLabelKey(f.metric))} – ${fmt(f.metric, f.value)}`}
                style={{
                  flex: 1, paddingLeft: i === 0 ? 6 : gutter, paddingRight: 6, paddingTop: 4, paddingBottom: 6,
                  marginLeft: i === 0 ? -6 : 0, marginTop: -4, borderRadius: 12,
                  backgroundColor: isOpen ? C.ink : "transparent",
                  borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: isOpen ? "transparent" : C.line,
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: isNamed ? toneText : C.ash }}>
                  {t(verdictLabelKey(f.metric))}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: figSize, letterSpacing: -0.5, marginTop: 3, color: isNamed ? toneText : C.chalk }}>
                  {fmt(f.metric, f.value)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* THE CARET — travels to the column it belongs to, so the panel below
            is visibly a drawer pulled out of THAT figure, not a second card. */}
        <View style={{ height: open ? 9 : 0 }} pointerEvents="none">
          {open && (
            <Animated.View style={{
              position: "absolute", top: 3, left: 0,
              width: 10, height: 10, backgroundColor: C.ink,
              borderLeftWidth: 1, borderTopWidth: 1, borderColor: C.line,
              borderRadius: 2,
              transform: [{ translateX: caretX }, { rotate: "45deg" }],
            }} />
          )}
        </View>

        {/* ── THE DRAWER ──────────────────────────────────────────────────── */}
        <Animated.View
          style={{
            overflow: "hidden",
            opacity: grow,
            height: grow.interpolate({ inputRange: [0, 1], outputRange: [0, panelH] }),
          }}
        >
          <View onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}>
            {detail && (
              <View style={{
                backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16,
                paddingHorizontal: 16, paddingVertical: 12,
              }}>
                <MetricDetail
                  detail={detail}
                  rows={rows}
                  shownCount={shown.length}
                  all={all}
                  group={group}
                  onGroup={(id) => { setGroup(id); setAll(false); }}
                  onAll={() => setAll((x) => !x)}
                  onSession={onSession}
                  t={t}
                  fmtValue={fmtValue}
                  fmtMinutes={fmtMinutes}
                  groupName={groupName}
                  dateFmt={dateFmt}
                  units={units}
                />
              </View>
            )}
          </View>
        </Animated.View>

        {!open && (
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, opacity: 0.75, textAlign: "center", marginTop: 10 }}>
            {t("w.home.act.hint")}
          </Text>
        )}
      </View>

      {/* The doors moved OUT of this card (wave 3): they are the whole
          PROGRESS cluster's single exit now, rendered at the cluster's end in
          home.tsx — one exit point after all the breakdowns, not a detour
          between the summary and the rails that decompose it. */}

      {/* ── THE MONTH PICKER — the iOS grouped list: sections, a row per
          period, a check on the one in force. ─────────────────────────────── */}
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
    </View>
  );
}

/* ───────────────────────────── the breakdown ───────────────────────────── */

function MetricDetail({
  detail, rows, shownCount, all, group, onGroup, onAll, onSession,
  t, fmtValue, fmtMinutes, groupName, dateFmt, units,
}: {
  detail: ActivityDetail;
  rows: ActivityEntry[];
  shownCount: number;
  all: boolean;
  group: string | null;
  onGroup: (id: string | null) => void;
  onAll: () => void;
  onSession?: (id: string) => void;
  t: (k: string) => string;
  fmtValue: (m: ActivityMetric, v: number, g: { unit: "km" | "m" }) => string;
  fmtMinutes: (m: number) => string;
  groupName: (g: { labelKey: string | null; label: string | null }) => string;
  dateFmt: (ms: number, o: Intl.DateTimeFormatOptions) => string;
  units: WeightUnit;
}) {
  const { palette: C } = useTheme();
  const byId = new Map(detail.groups.map((g) => [g.id, g]));
  const unitOf = (id: string): { unit: "km" | "m" } => byId.get(id) ?? { unit: "km" };

  /** The one meta line under a session row — this contribution's own figures,
   *  never the whole session's, so a run inside a lifting day can't claim the
   *  tonnage that happened beside it. */
  const meta = (it: ActivityEntry): string => {
    const bits: string[] = [];
    if (detail.metric === "tonnage") {
      if (it.sets > 0) bits.push(`${it.sets} ${t("w.home.act.uSets")}`);
      if (it.minutes > 0) bits.push(fmtMinutes(it.minutes));
    } else if (detail.metric === "distance") {
      if (it.minutes > 0) bits.push(fmtMinutes(it.minutes));
      if (it.tonnage > 0) bits.push(fmtTonnage(it.tonnage, units));
    } else if (detail.metric === "hours") {
      if (it.distanceKm > 0) bits.push(`${groupDistanceDisplay(it.distanceKm, unitOf(it.groupId).unit)} ${unitOf(it.groupId).unit}`);
      if (it.tonnage > 0) bits.push(fmtTonnage(it.tonnage, units));
    } else {
      if (it.minutes > 0) bits.push(fmtMinutes(it.minutes));
      if (it.tonnage > 0) bits.push(fmtTonnage(it.tonnage, units));
      if (it.distanceKm > 0) bits.push(`${Math.round(it.distanceKm * 10) / 10} km`);
    }
    return bits.join(" – ");
  };

  const kicker = { fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase" as const };

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ ...kicker, color: C.ash, flex: 1 }} numberOfLines={1}>{t(activityDetailKey(detail.metric))}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>
          {detail.sessions === 1 ? t("w.home.act.oneSession") : t("w.home.act.nSessions").replace("{n}", String(detail.sessions))}
        </Text>
      </View>

      {detail.groups.length === 0 && (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 10 }}>{t("w.home.act.empty")}</Text>
      )}

      {detail.groups.length > 0 && (
        <>
          {/* The share bar — every group's slice of the total, in one line. */}
          <View style={{ flexDirection: "row", gap: 2, height: 6, marginTop: 12 }}>
            {detail.groups.map((g, i) => (
              <View key={g.id} style={{
                flexGrow: Math.max(g.share, 0.02), flexBasis: 0, borderRadius: 999,
                backgroundColor: i === 0 ? C.chalk : i === 1 ? C.ash : C.line,
                opacity: group && group !== g.id ? 0.35 : 1,
              }} />
            ))}
          </View>

          {/* One row per activity — tap to narrow the list underneath it. */}
          <View style={{ marginTop: 8 }}>
            {detail.groups.map((g: ActivityGroup) => {
              const active = group === g.id;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => onGroup(active ? null : g.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 8,
                    paddingHorizontal: 8, paddingVertical: 6, marginHorizontal: -8,
                    backgroundColor: active ? C.ink2 : "transparent", borderRadius: 12,
                  }}
                >
                  <Text style={{ fontSize: 13, width: 18, textAlign: "center" }}>{g.icon}</Text>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>
                    {groupName(g)}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{Math.round(g.share * 100)}%</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, minWidth: 62, textAlign: "right" }}>
                    {fmtValue(detail.metric, g.value, g)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* The sessions themselves — the receipts under the receipts. */}
          <Text style={{ ...kicker, color: C.ash, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            {t("w.home.act.sessionsHead")}
          </Text>
          <View style={{ marginTop: 4 }}>
            {rows.map((it, i) => {
              const line = meta(it);
              return (
                <Pressable
                  key={`${it.sessionId}-${it.groupId}-${i}`}
                  onPress={() => onSession?.(it.sessionId)}
                  disabled={!onSession}
                  accessibilityRole="button"
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    paddingHorizontal: 8, paddingVertical: 8, marginHorizontal: -8, borderRadius: 12,
                  }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, width: 44 }}>
                    {dateFmt(new Date(it.startedAt).getTime(), { day: "numeric", month: "short" })}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{it.name}</Text>
                    {!!line && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, marginTop: 1 }}>{line}</Text>}
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>
                    {fmtValue(detail.metric, it.value, unitOf(it.groupId))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {shownCount > ROWS_SHOWN && (
            <Pressable onPress={onAll} accessibilityRole="button" style={{ paddingVertical: 4, marginTop: 6 }}>
              <Text style={{ ...kicker, fontSize: 10, color: C.ash }}>
                {all ? t("w.home.act.showFewer") : t("w.home.act.showAll").replace("{n}", String(shownCount))}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </>
  );
}

/* ───────────────────────────── the picker ──────────────────────────────── */

function PickerSection({ label, children }: { label: string; children: ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginHorizontal: 4, marginBottom: 6 }}>
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
