import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  logbookWeek,
  mergeDoneReceipts,
  doneReceipt,
  dayStamp,
  dayStampText,
  streak,
  type LogbookDay,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { leading, fs, F, serifIf, startGlow, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { RADIUS } from "./kit";
import { CtaLabel } from "./cta-label";
import ReceiptBlock, { RECEIPT_GUTTER } from "./receipt-block";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useBodyweightLookup } from "../../lib/use-bodyweight";

// ── AURORA Logbook rail (mobile) ────────────────────────────────────────────
// "The Constant": the SAME week-rail object the plan state ships, mounted in
// LOGBOOK MODE for the plan-less athlete with logged history — so the calendar
// exists for the whole life of the account, and enrolling changes the card's
// fill, never its shape. Same anatomy as week-rail.tsx (one ink2 surface:
// header row, seven day chips, full-bleed hairline, a state-aware day detail),
// with the plan's vocabulary swapped for the log's: a day either holds
// training (✓, chalk) or stays quiet greyscale — a logbook makes no promises,
// so there is no "missed", no terracotta. Data from @hybrid/core logbookWeek.
// Mirrors the web component (aurora/logbook-rail.tsx) exactly.

type Pal = ReturnType<typeof useTheme>["palette"];

export default function AuroraLogbookRail({
  sessions,
  onLog,
  onNavigate,
  onSelectDay,
  resetToken,
  doneFloor,
}: {
  sessions: LoggedSession[];
  /** Start an empty workout (today's primary action when nothing is logged). */
  onLog: () => void;
  onNavigate?: (screen: string) => void;
  /** Fires when the athlete taps a day chip, so the caller can scope the rest
   *  of the screen (Also-today / feeling cards) to the viewed day. Mirrors the
   *  plan week rail's prop. */
  onSelectDay?: (day: LogbookDay) => void;
  /** Bump to snap the rail's internal selection back to today (the masthead's
   *  "Back to today" affordance). */
  resetToken?: number;
  /** The DONE FLOOR — every session logged on the viewed day, rendered as this
   *  card's lower floor under a labelled seam (aurora/done-floor.tsx). It is
   *  passed in rather than built here because the screen owns the day's
   *  sessions, the quick-log sheet and the Done-today sheet. */
  doneFloor?: ReactNode;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();

  const week = useMemo(() => logbookWeek(sessions), [sessions]);

  // Selected day: follows today until the athlete taps another chip.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [resetToken]);
  const selectedIndex = picked ?? week.todayIndex;
  const sel = week.days[selectedIndex] ?? week.days[week.todayIndex]!;

  // The selected day's receipt — every session logged that day, merged into one
  // honest summary (untrustworthy figures were already dropped per session).
  const daySessions = useMemo(
    () => sel.sessionIds.map((id) => sessions.find((s) => s.id === id)).filter((s): s is LoggedSession => !!s),
    [sel.sessionIds, sessions],
  );
  const receipt = useMemo(
    () => mergeDoneReceipts(daySessions.map((s) => doneReceipt(s, { bodyweightKg: bw(s.startedAt) }))),
    [daySessions, bw],
  );

  // The athlete's current run — the done-today card's corner reports it in
  // place of a date the week strip has already shown (core day-stamp.ts).
  const streakDays = useMemo(() => streak(sessions, 1).current, [sessions]);

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
      {/* header: the log's name + the window on one baseline row */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: 21, letterSpacing: -0.5, color: C.chalk }}>
          {t("w.home.logbook.title")}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.home.logbook.window")}</Text>
      </View>

      {/* the seven-day week — the plan rail's chip anatomy, logbook vocabulary */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        {week.days.map((d) => (
          <DayChip key={d.dateKey} C={C} day={d} selected={d.index === selectedIndex} onSelect={() => { setPicked(d.index); onSelectDay?.(d); }} t={t} />
        ))}
      </View>

      {/* full-bleed hairline — the only separator between week and day */}
      <View style={{ height: 1, backgroundColor: C.line, marginHorizontal: -20, marginTop: 16, marginBottom: 16 }} />

      <DayDetail
        key={sel.dateKey}
        C={C}
        scheme={scheme}
        day={sel}
        receipt={receipt}
        units={units}
        streakDays={streakDays}
        doneFloor={doneFloor}
        onLog={onLog}
        onHistory={() => onNavigate?.("history")}
        t={t}
      />
    </View>
  );
}

function DayChip({ C, day, selected, onSelect, t }: { C: Pal; day: LogbookDay; selected: boolean; onSelect: () => void; t: (k: string) => string }) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${day.weekdayShort} ${day.dayOfMonth} — ${t(day.logged ? "w.home.logbook.loggedDay" : "w.home.logbook.emptyPast")}`}
      style={{ flex: 1, alignItems: "center", gap: 5, paddingTop: 6, paddingBottom: 5 }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{day.weekdayShort}</Text>
      {/* number slot — today = filled chartreuse disc; a tapped non-today day = a
          hairline disc (preview cue); otherwise a bare tonal number (chalk when
          the day holds training, ash when it doesn't). */}
      <View style={{ height: 28, alignItems: "center", justifyContent: "center" }}>
        {day.isToday ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 14, color: C.onAccent }}>{day.dayOfMonth}</Text>
          </View>
        ) : selected ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: `${C.chalk}4d`, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{day.dayOfMonth}</Text>
          </View>
        ) : (
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: day.logged ? C.chalk : C.ash }}>{day.dayOfMonth}</Text>
        )}
      </View>
      {/* glyph slot — ✓ for a logged day; an un-logged day carries no mark
          (silence, never terracotta: a logbook makes no promises). */}
      <View style={{ height: 12, alignItems: "center", justifyContent: "center" }}>
        {day.logged ? <Text style={{ fontFamily: F.mono, fontSize: 10, lineHeight: 12, color: C.chalk, opacity: 0.7 }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

function DayDetail({ C, scheme, day, receipt, units, streakDays, doneFloor, onLog, onHistory, t }: {
  C: Pal;
  scheme: "dark" | "light";
  day: LogbookDay;
  receipt: ReturnType<typeof mergeDoneReceipts>;
  units: WeightUnit;
  /** the athlete's current day-streak, for the done-today stamp. */
  streakDays: number;
  /** the day's logged sessions as this card's lower floor (see the prop above). */
  doneFloor?: ReactNode;
  onLog: () => void;
  onHistory: () => void;
  t: (k: string) => string;
}) {
  // The corner stamp — how far this day sits from now, never a second copy of
  // the chip above it or of the headline beside it (core day-stamp.ts).
  const stamp = dayStampText(
    dayStamp({ dateKey: day.dateKey, done: day.logged, streakDays }),
    t,
    `${day.weekdayShort} ${day.dayOfMonth} ${day.monthShort}`,
  );

  // LOGGED — the day collapses to a receipt, exactly like the plan rail's done
  // state: one headline, the finishing time, only trustworthy figures, and a
  // quiet text link into History.
  //
  // NO WORKOUT NAMES HERE. This line used to join the day's session titles
  // ("Tennis – Afternoon workout – finished 14:33"), and the Done-today card a
  // few hundred pixels below lists those very sessions by name, one row each,
  // with their own figures — the same words twice on one screen. The receipt
  // keeps the one fact that card deliberately withholds: the clock time the day
  // finished at.
  if (day.logged) {
    return (
      <View>
        <ReceiptBlock
          receipt={receipt}
          units={units}
          title={t(day.isToday ? "w.home.rail.allDone" : "w.home.logbook.loggedDay")}
          stamp={stamp}
        />
        {doneFloor}
        <Pressable
          onPress={onHistory}
          accessibilityRole="button"
          style={{ borderTopWidth: 1, borderTopColor: C.line, marginTop: 16, paddingTop: 16, paddingLeft: RECEIPT_GUTTER }}
        >
          <CtaLabel label={`${t("w.home.rail.viewHistory")} →`} color={C.ash} fontSize={11} font={F.mono} style={{ letterSpacing: 1.2, textTransform: "uppercase" }} />
        </Pressable>
      </View>
    );
  }

  // TODAY, nothing logged yet — the open day: one honest headline and the one
  // lime action. The chooser's structure options live OUTSIDE the rail.
  if (day.isToday) {
    return (
      <View>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 19, letterSpacing: -0.5, color: C.chalk, flex: 1 }}>{t("w.home.logbook.emptyToday")}</Text>
          {!!stamp && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{stamp}</Text>}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5, lineHeight: leading(fs.caption) }}>{t("w.home.logbook.emptyTodaySub")}</Text>
        <Pressable onPress={onLog} style={({ pressed }) => ({ marginTop: 16, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", ...startGlow(C.lime, pressed) })}>
          <CtaLabel label={t("w.home.today.alsoTodayLogFirst")} color={C.onAccent} fontSize={fs.bodyLg} />
        </Pressable>
        {/* the quick-SPORT door (a match, a run, a swim) — a different action to
            the structured logger above it, and the only way to reach it here. */}
        {doneFloor}
      </View>
    );
  }

  // A PAST day with nothing logged gets NO floor: the arm below already says
  // "nothing logged", and a logbook day is `logged` exactly when it holds
  // sessions — so the floor could only repeat that sentence in smaller type.

  // A PAST day with nothing logged — quiet, factual, no guilt (the rest-day
  // register of the plan rail, without the moon: nothing was promised).
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.ash, flex: 1 }}>{t("w.home.logbook.emptyPast")}</Text>
        {!!stamp && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{stamp}</Text>}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5, lineHeight: leading(fs.caption) }}>{t("w.home.today.doneModalEmptyDay")}</Text>
    </View>
  );
}
