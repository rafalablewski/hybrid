import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import {
  planSchedule,
  type LoggedSession,
  type SessionBlock,
  type ScheduledDay,
  type PlanDayStatus,
} from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, space, F, serifIf } from "../../lib/ui";
import { RADIUS } from "./kit";
import { usePlanOverrides } from "../../lib/plan-overrides";

// ── AURORA Week rail (mobile) ───────────────────────────────────────────────
// The date-anchored replacement for the count-based "Your plan today". A
// horizontally-scrollable strip where every day wears its status (done / missed
// / skipped / today / upcoming / rest); tapping a day opens a state-aware card
// that decides what you can do (Start, Do it now, View, Undo skip). Mirrors the
// web component (aurora/week-rail.tsx) exactly — same props, same states, same
// engine (@hybrid/core planSchedule) + usePlanOverrides for skips. Glyphs are
// text characters (the mobile icon idiom — no SVG dep, matching kit.tsx). Renders
// nothing (caller falls back) unless a program plan + start date resolve.

type Pal = ReturnType<typeof useTheme>["palette"];

const CHIP_W = 44;
const CHIP_GAP = 6;
const STEP = CHIP_W + CHIP_GAP;

/** The accent hue that carries a status (ring / tint / text), resolved from the
 *  theme palette so web + mobile can't drift on meaning. */
function statusHue(s: PlanDayStatus, C: Pal): string {
  switch (s) {
    case "done":
      return C.lime;
    case "missed":
      return C.amber;
    case "skipped":
      return C.blue;
    case "postponed":
      return C.violet;
    case "today":
      return C.lime;
    default: // upcoming / rest
      return C.ash;
  }
}

// Format a local date key (yyyy-mm-dd) as "Wed 15 Jul" for the postpone target.
function fmtKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const dt = new Date(y, m - 1, d);
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${WD[dt.getDay()]} ${dt.getDate()} ${MO[dt.getMonth()]}`;
}

export default function AuroraWeekRail({
  planId,
  planStartedAt,
  sessions,
  maxes,
  onStart,
  onNavigate,
}: {
  planId: string;
  planStartedAt: string;
  sessions: LoggedSession[];
  maxes?: Record<string, number>;
  onStart: (planBlocks?: SessionBlock[]) => void;
  onNavigate?: (screen: string) => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { overrides, setOverride } = usePlanOverrides(planId);

  const schedule = useMemo(
    () => planSchedule({ planId, startedAt: planStartedAt, sessions, overrides, maxes }),
    [planId, planStartedAt, sessions, overrides, maxes],
  );

  // Selected day: follows today until the athlete taps another day.
  const [picked, setPicked] = useState<number | null>(null);
  const selectedIndex = picked ?? schedule?.todayIndex ?? 0;

  const railRef = useRef<ScrollView>(null);
  const [railW, setRailW] = useState(Dimensions.get("window").width - 84);
  const scrollX = useRef(0);

  // Centre the selected (or today) chip on first paint + whenever focus changes.
  const planKey = schedule?.planId;
  useEffect(() => {
    const x = Math.max(0, selectedIndex * STEP - railW / 2 + CHIP_W / 2);
    railRef.current?.scrollTo({ x, animated: true });
  }, [planKey, selectedIndex, railW]);

  const pageBy = useCallback(
    (dir: number) => {
      const x = Math.max(0, scrollX.current + dir * Math.round(railW * 0.8));
      railRef.current?.scrollTo({ x, animated: true });
    },
    [railW],
  );
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = e.nativeEvent.contentOffset.x;
  }, []);

  if (!schedule || !schedule.days.length) return null;
  const sel = schedule.days[selectedIndex] ?? schedule.days[schedule.todayIndex]!;

  return (
    <View
      style={{
        backgroundColor: C.ink2,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: RADIUS.card,
        padding: 20,
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
    >
      {/* header: plan name + progress + prev/next pager */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: serifIf(scheme, F.black), fontSize: 22, letterSpacing: -0.4, color: C.chalk }}>
            {schedule.planName}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>
            {sel.trainingDayNumber != null ? `${t("w.home.today.day")} ${sel.trainingDayNumber} / ${schedule.totalTrainingDays}` : t("w.home.rail.rest")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <PagerBtn C={C} dir="l" label={t("w.home.rail.earlier")} onPress={() => pageBy(-1)} />
          <PagerBtn C={C} dir="r" label={t("w.home.rail.later")} onPress={() => pageBy(1)} />
        </View>
      </View>

      {/* the day rail */}
      <ScrollView
        ref={railRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => setRailW(e.nativeEvent.layout.width)}
        style={{ marginHorizontal: -4, marginTop: 14, marginBottom: 4 }}
        contentContainerStyle={{ gap: CHIP_GAP, paddingHorizontal: 4, paddingVertical: 4 }}
      >
        {schedule.days.map((d, i) => (
          <DayChip key={d.dateKey} C={C} day={d} selected={i === selectedIndex} onSelect={() => setPicked(i)} t={t} />
        ))}
      </ScrollView>

      {/* legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
        <LegendDot C={C} color={C.lime} label={t("w.home.rail.done")} />
        <LegendDot C={C} color={C.amber} label={t("w.home.rail.missed")} />
        <LegendDot C={C} color={C.blue} label={t("w.home.rail.skipped")} />
        <LegendDot C={C} color={C.lime} outline label={t("w.home.rail.today")} />
      </View>

      {/* state-aware detail card */}
      <DayDetail
        key={sel.dateKey}
        C={C}
        scheme={scheme}
        day={sel}
        onStart={onStart}
        onSkip={() => setOverride(sel.dateKey, { status: "skipped" })}
        onUnskip={() => setOverride(sel.dateKey, null)}
        onPostpone={() => {
          const next = schedule.days[sel.index + 1];
          if (next) setOverride(sel.dateKey, { status: "postponed", toDateKey: next.dateKey });
        }}
        canPostpone={!!schedule.days[sel.index + 1]}
        onHistory={() => onNavigate?.("history")}
        t={t}
      />
    </View>
  );
}

function PagerBtn({ C, dir, label, onPress }: { C: Pal; dir: "l" | "r"; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: 15, lineHeight: 17, color: C.ash }}>{dir === "l" ? "‹" : "›"}</Text>
    </Pressable>
  );
}

function LegendDot({ C, color, label, outline }: { C: Pal; color: string; label: string; outline?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginRight: 14 }}>
      <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: outline ? "transparent" : color, borderWidth: outline ? 1 : 0, borderColor: color }} />
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: C.ash }}>{label}</Text>
    </View>
  );
}

/** The status glyph that sits in a chip / pill. done ✓, missed ✕, skipped »,
 *  postponed ↦ (moved to a later bar), rest ☾ — text chars (the mobile icon
 *  idiom), tinted per status. */
function StatusGlyph({ status, color, size }: { status: PlanDayStatus; color: string; size: number }) {
  const ch = status === "done" ? "✓" : status === "missed" ? "✕" : status === "skipped" ? "»" : status === "postponed" ? "↦" : status === "rest" ? "☾" : null;
  if (!ch) return null;
  return <Text style={{ fontFamily: F.mono, fontSize: size, lineHeight: size + 1, color }}>{ch}</Text>;
}

function DayChip({ C, day, selected, onSelect, t }: { C: Pal; day: ScheduledDay; selected: boolean; onSelect: () => void; t: (k: string) => string }) {
  const hue = statusHue(day.status, C);
  const filled = day.status === "done";
  // Border by status: skipped → dashed blue; today → lime rim; done/missed/
  // postponed → accent tint; rest/upcoming → hairline.
  const tinted = day.status === "done" || day.status === "missed" || day.status === "postponed";
  const borderColor =
    day.status === "skipped" ? `${C.blue}73` : day.status === "today" ? C.lime : tinted ? `${hue}8c` : C.line;
  const glyphColor = filled ? C.onAccent : day.status === "rest" ? C.ash : txt(C, hue);

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${day.weekdayShort} ${day.dayOfMonth} — ${t(`w.home.rail.${day.status}`)}`}
      style={{
        width: CHIP_W,
        alignItems: "center",
        gap: 4,
        paddingTop: 8,
        paddingBottom: 7,
        borderRadius: 13,
        borderWidth: 1,
        borderStyle: day.status === "skipped" ? "dashed" : "solid",
        borderColor,
        backgroundColor: filled ? C.lime : tinted ? `${hue}24` : C.ink,
        opacity: day.isRest ? 0.6 : 1,
        transform: selected ? [{ translateY: -2 }] : undefined,
        ...(selected
          ? { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 9, shadowOffset: { width: 0, height: 6 }, elevation: 5 }
          : {}),
      }}
    >
      {/* chalk selection ring — an overlay so the status border stays visible */}
      {selected && (
        <View pointerEvents="none" style={{ position: "absolute", top: -3, left: -3, right: -3, bottom: -3, borderRadius: 16, borderWidth: 2, borderColor: C.chalk }} />
      )}
      <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.3, textTransform: "uppercase", color: filled ? C.onAccent : C.ash }}>{day.weekdayShort}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 13, lineHeight: 14, color: filled ? C.onAccent : C.chalk, textDecorationLine: day.status === "skipped" ? "line-through" : "none" }}>{day.dayOfMonth}</Text>
      <View style={{ height: 12, alignItems: "center", justifyContent: "center" }}>
        {day.status === "done" || day.status === "missed" || day.status === "skipped" || day.status === "postponed" || day.isRest ? (
          <StatusGlyph status={day.isRest ? "rest" : day.status} color={glyphColor} size={day.status === "skipped" ? 11 : 10} />
        ) : (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: day.isToday ? C.lime : "transparent", borderWidth: day.isToday ? 0 : 1.5, borderColor: C.ash }} />
        )}
      </View>
    </Pressable>
  );
}

function StatePill({ C, status, t }: { C: Pal; status: PlanDayStatus; t: (k: string) => string }) {
  const hue = statusHue(status, C);
  const isUpcoming = status === "upcoming";
  const color = status === "rest" || isUpcoming ? C.ash : txt(C, hue);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: isUpcoming ? "transparent" : `${hue}24`,
        borderWidth: 1,
        borderColor: isUpcoming ? C.line : `${hue}66`,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      {status === "today" && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime }} />}
      <StatusGlyph status={status} color={color} size={status === "skipped" ? 11 : 9} />
      <Text style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", color }}>{t(`w.home.rail.${status}`)}</Text>
    </View>
  );
}

function DayDetail({ C, scheme, day, onStart, onSkip, onUnskip, onPostpone, canPostpone, onHistory, t }: {
  C: Pal;
  scheme: "dark" | "light";
  day: ScheduledDay;
  onStart: (b?: SessionBlock[]) => void;
  onSkip: () => void;
  onUnskip: () => void;
  onPostpone: () => void;
  canPostpone: boolean;
  onHistory: () => void;
  t: (k: string) => string;
}) {
  const hue = statusHue(day.status, C);
  const accent = day.status === "upcoming" ? C.ash : hue;
  const dateLine = `${day.weekdayShort} ${day.dayOfMonth} ${day.monthShort}`;

  return (
    <View style={{ marginTop: 14, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: accent, borderRadius: 18, padding: 16, backgroundColor: C.ink }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
        <StatePill C={C} status={day.status} t={t} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{dateLine}</Text>
      </View>

      {day.isRest ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${C.ash}1f`, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: 20, lineHeight: 22, color: C.ash }}>☾</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 16, color: C.chalk }}>{t("w.home.rail.restDay")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2, lineHeight: 17 }}>{t("w.home.rail.restNote")}</Text>
          </View>
        </View>
      ) : (
        <>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 20, letterSpacing: -0.4, color: C.chalk }}>{day.title}</Text>
          {day.status === "postponed" ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.violet), marginTop: 5, lineHeight: 17 }}>
              {t("w.home.rail.movedTo")} {day.postponedTo ? fmtKey(day.postponedTo) : ""}
            </Text>
          ) : (day.status === "missed" || day.status === "skipped" || day.status === "upcoming") ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5, lineHeight: 17 }}>{t(`w.home.rail.${day.status}Note`)}</Text>
          ) : null}
          <View style={{ marginTop: 11 }}>
            {day.rows.map((r, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingTop: 6, marginTop: i ? 6 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flex: 1 }}>
                  {r.session ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{r.session}  </Text> : null}
                  {r.name}
                  {r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}> ({r.note})</Text> : null}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right", flexShrink: 0 }}>{r.detail}</Text>
              </View>
            ))}
          </View>

          {/* actions by state */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {day.status === "today" && (
              <>
                <PrimaryBtn C={C} label={t("w.home.today.start")} onPress={() => onStart(day.blocks)} />
                <GhostBtn C={C} color={C.blue} label={t("w.home.rail.skip")} onPress={onSkip} />
                {canPostpone && <GhostBtn C={C} color={C.violet} label={t("w.home.rail.postpone")} onPress={onPostpone} />}
              </>
            )}
            {day.status === "missed" && (
              <>
                <PrimaryBtn C={C} label={t("w.home.rail.doItNow")} onPress={() => onStart(day.blocks)} />
                <GhostBtn C={C} color={C.blue} label={t("w.home.rail.skip")} onPress={onSkip} />
                {canPostpone && <GhostBtn C={C} color={C.violet} label={t("w.home.rail.postpone")} onPress={onPostpone} />}
              </>
            )}
            {day.status === "skipped" && <GhostBtn C={C} color={C.ash} label={t("w.home.rail.undoSkip")} onPress={onUnskip} flex1 />}
            {day.status === "upcoming" && (
              <>
                <GhostBtn C={C} color={C.lime} label={t("w.home.rail.startEarly")} onPress={() => onStart(day.blocks)} flex={2} />
                {canPostpone && <GhostBtn C={C} color={C.violet} label={t("w.home.rail.postpone")} onPress={onPostpone} />}
              </>
            )}
            {day.status === "postponed" && (
              <>
                <PrimaryBtn C={C} label={t("w.home.rail.doItNow")} onPress={() => onStart(day.blocks)} />
                <GhostBtn C={C} color={C.ash} label={t("w.home.rail.unpostpone")} onPress={onUnskip} />
              </>
            )}
            {day.status === "done" && <GhostBtn C={C} color={C.ash} label={t("w.home.rail.viewHistory")} onPress={onHistory} flex1 />}
          </View>
        </>
      )}

      {/* Sessions postponed ONTO this date — a light catch-up list. */}
      {day.postponedIn.length > 0 && (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.1, textTransform: "uppercase", color: txt(C, C.violet), marginBottom: 9 }}>{t("w.home.rail.catchUp")}</Text>
          {day.postponedIn.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: i ? 8 : 0 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{it.title}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.home.rail.movedFrom")} {fmtKey(it.fromDateKey)}</Text>
              </View>
              <GhostBtn C={C} color={C.violet} label={t("w.home.rail.doItNow")} onPress={() => onStart(it.blocks)} auto />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function PrimaryBtn({ C, label, onPress }: { C: Pal; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 2, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{label}</Text>
    </Pressable>
  );
}

function GhostBtn({ C, color, label, onPress, flex1, flex, auto }: { C: Pal; color: string; label: string; onPress: () => void; flex1?: boolean; flex?: number; auto?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: auto ? 0 : flex ?? 1,
        minWidth: flex1 || auto ? undefined : 0,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: `${color}73`,
        borderRadius: RADIUS.pill,
        paddingVertical: auto ? 8 : 11,
        paddingHorizontal: auto ? 14 : undefined,
        alignItems: "center",
      }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, color) }}>{label}</Text>
    </Pressable>
  );
}
