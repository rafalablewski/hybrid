import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import {
  planSchedule,
  doneReceipt,
  dayStamp,
  dayStampText,
  streak,
  type DoneReceipt,
  type LoggedSession,
  type SessionBlock,
  type ScheduledDay,
  type PlanDaySession,
  type WeightUnit,
} from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { leading, fs, F, serifIf, startGlow, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { RADIUS } from "./kit";
import { CtaLabel } from "./cta-label";
import ReceiptBlock, { RECEIPT_GUTTER } from "./receipt-block";
import { usePlanOverrides } from "../../lib/plan-overrides";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useBodyweightLookup } from "../../lib/use-bodyweight";

// ── AURORA Week rail (mobile) ───────────────────────────────────────────────
// The date-anchored replacement for the count-based "Your plan today". A static
// seven-day week flowing into a state-aware session on ONE surface (no nested
// detail card). The rail is a single tonal system: state reads from weight + a
// glyph, not a palette. Colour is attention — chartreuse means "act now" (today,
// start, active session), terracotta means "you missed this"; every settled or
// upcoming day is greyscale, ranked by presence. The week is a sliding window
// centred on the selected day, so tapping an edge day walks through the plan
// (no scroll strip / pagers). Mirrors the web component (aurora/week-rail.tsx)
// exactly — same props, states, engine + usePlanOverrides for skips. Day-state
// glyphs are the SAME five SVG shapes web draws (check / cross / skip /
// postpone / moon), rendered via react-native-svg so the two week strips match
// stroke for stroke. Renders nothing (caller falls back) unless a program plan
// + start date resolve.

type Pal = ReturnType<typeof useTheme>["palette"];

// ── Day-state glyphs — the web rail's inline SVGs (week-rail.tsx :44-58),
// same paths + sizes, drawn with react-native-svg. Colour is passed in (RN has
// no currentColor inheritance).
const Check = ({ c, s = 11 }: { c: string; s?: number }) => (
  <Svg width={s} height={s} viewBox="0 0 12 12" fill="none"><Path d="M2.5 6.3 5 8.6 9.5 3.4" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
const Cross = ({ c, s = 9 }: { c: string; s?: number }) => (
  <Svg width={s} height={s} viewBox="0 0 12 12" fill="none"><Path d="M3 3l6 6M9 3l-6 6" stroke={c} strokeWidth={1.8} strokeLinecap="round" /></Svg>
);
const SkipGlyph = ({ c, s = 12 }: { c: string; s?: number }) => (
  <Svg width={s} height={s} viewBox="0 0 14 12" fill="none"><Path d="M3 3l3.2 3-3.2 3M7.5 3l3.2 3-3.2 3" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
const Moon = ({ c, s = 12 }: { c: string; s?: number }) => (
  <Svg width={s} height={s} viewBox="0 0 14 14" fill="none"><Path d="M11 8.2A4.2 4.2 0 1 1 5.8 3a3.3 3.3 0 0 0 5.2 5.2Z" stroke={c} strokeWidth={1.2} strokeLinejoin="round" /></Svg>
);
const PostponeGlyph = ({ c, s = 16 }: { c: string; s?: number }) => (
  <Svg width={s} height={s * 0.86} viewBox="0 0 14 12" fill="none"><Path d="M2 6h8M6.5 2.5 10.5 6l-4 3.5" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /><Path d="M12.5 2v8" stroke={c} strokeWidth={1.5} strokeLinecap="round" /></Svg>
);
const Caret = ({ c, open }: { c: string; open: boolean }) => (
  <Svg width={11} height={11} viewBox="0 0 12 12" fill="none" style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
    <Path d="M3 4.5 6 7.5 9 4.5" stroke={c} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Days shown at once, and how many lifts show before the fading disclosure.
const WINDOW = 7;
const PEEK = 2;
/** The card's own inner padding — what the full-bleed hairline inside it bleeds
 *  by to reach the card's edges. NOT the screen gutter (this rail lives on a
 *  card), which is exactly the distinction a bare `-20` could not make. */
const CARD_PAD = 20;

/** A session's tab/label: the plan's time-of-day when it sets one (AM/PM), else a
 *  plain "Training N" — the ordinal, never a fabricated time, is the anchor. */
function sessionLabel(s: PlanDaySession, t: (k: string) => string): string {
  return s.timeOfDay ?? `${t("w.home.rail.session")} ${s.ordinal}`;
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

/** One rendered load step: the % is the anchor (bright), the scheme its caption. */
type LoadStep = { load: string; scheme: string };
/** Split a ramped-percentage prescription ("60%×3×3, 70%×3×4") into steps so the
 *  load line can be laid out, not crammed into one mono string. Returns null for
 *  any prescription that isn't %/BW-led (RPE, sets×reps, prose runs) — those fall
 *  back to the raw detail text, untouched. */
function parseLoadSteps(detail: string): LoadStep[] | null {
  const parts = detail.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const steps: LoadStep[] = [];
  for (const p of parts) {
    const ix = p.indexOf("×");
    if (ix < 0) return null;
    const load = p.slice(0, ix).trim();
    const scheme = p.slice(ix + 1).trim();
    if (!/^(\d+%|BW)$/.test(load)) return null;
    steps.push({ load, scheme });
  }
  return steps;
}

export default function AuroraWeekRail({
  planId,
  planStartedAt,
  sessions,
  maxes,
  onStart,
  onNavigate,
  onSelectDay,
  resetToken,
  doneFloor,
}: {
  planId: string;
  planStartedAt: string;
  sessions: LoggedSession[];
  maxes?: Record<string, number>;
  /** `title` is the plan-composed session title ("<plan> – Week N, <day>") the
   *  logger should save under, so the engine recognises the session as the
   *  plan's own day. Mirrors the web rail exactly. */
  onStart: (planBlocks?: SessionBlock[], title?: string) => void;
  onNavigate?: (screen: string) => void;
  /** Fires when the athlete taps a day chip, so the caller can scope the rest
   *  of the screen (Also-today / feeling cards) to the viewed day. Until the
   *  first tap the caller should assume today. Mirrors the web rail. */
  onSelectDay?: (day: ScheduledDay) => void;
  /** Bump to snap the rail's internal selection back to today (the masthead's
   *  "Back to today" affordance). Mirrors the web rail. */
  resetToken?: number;
  /** The DONE FLOOR — every session logged on the viewed day, rendered as this
   *  card's lower floor under a labelled seam (aurora/done-floor.tsx). The plan
   *  floor above states what is ASKED of the athlete; this one states what they
   *  DID, and the seam is what keeps a tennis row from reading as the last line
   *  of the prescription. Passed in because the screen owns the day's sessions,
   *  the quick-log sheet and the Done-today sheet. */
  doneFloor?: ReactNode;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { overrides, setOverride } = usePlanOverrides(planId);
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();

  const schedule = useMemo(
    () => planSchedule({ planId, startedAt: planStartedAt, sessions, overrides, maxes }),
    [planId, planStartedAt, sessions, overrides, maxes],
  );

  // Selected day: follows today until the athlete taps another day. Resets when
  // the enrolled plan changes — a picked index is meaningless across schedules
  // (the caller's lifted onSelectDay copy re-anchors to today the same way).
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [planId, resetToken]);
  const selectedIndex = picked ?? schedule?.todayIndex ?? 0;

  // The receipt behind a done day — built from the logged session that
  // fulfilled it, so every figure is real (and untrustworthy ones are dropped).
  // Memoized ABOVE the no-schedule early return (hooks can't be conditional),
  // deriving the selected day itself. Mirrors web.
  const receipt = useMemo(() => {
    const day = schedule?.days[selectedIndex] ?? schedule?.days[schedule.todayIndex];
    const doneSession = (day?.status === "done" && day.sessionId && sessions.find((s) => s.id === day.sessionId)) || null;
    return doneSession ? doneReceipt(doneSession, { bodyweightKg: bw(doneSession.startedAt) }) : null;
  }, [schedule, selectedIndex, sessions, bw]);

  // The athlete's current run — what the done-today card's corner reports in
  // place of a date the week strip has already shown (see core day-stamp.ts).
  const streakDays = useMemo(() => streak(sessions).current, [sessions]);

  if (!schedule || !schedule.days.length) return null;
  const sel = schedule.days[selectedIndex] ?? schedule.days[schedule.todayIndex]!;

  // The visible week: a WINDOW-day slice centred on the selected day, clamped to
  // the plan. Tapping an edge day re-centres it, walking through the schedule.
  const total = schedule.days.length;
  const winStart = Math.max(0, Math.min(selectedIndex - Math.floor(WINDOW / 2), Math.max(0, total - WINDOW)));
  const windowDays = schedule.days.slice(winStart, winStart + WINDOW);

  const dayLine = sel.trainingDayNumber != null ? `${t("w.home.today.day")} ${sel.trainingDayNumber} / ${schedule.totalTrainingDays}` : t("w.home.rail.rest");

  // The plan-composed title the saved session should carry — the same shape the
  // plan prefill writes ("<plan> – Week N, <day>"), so planSchedule's title arm
  // recognises it even if the athlete edits the exercises. Mirrors web.
  const multiWeek = (schedule.days[schedule.days.length - 1]?.week ?? 1) > 1;
  const titleFor = (d: ScheduledDay) => `${schedule.planName} – ${multiWeek ? `Week ${d.week}, ` : ""}${d.title}`;

  return (
    <View
      style={{
        backgroundColor: C.ink2,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: RADIUS.card,
        padding: CARD_PAD,
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
    >
      {/* header: plan name + progress on one baseline row */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: 21, letterSpacing: -0.5, color: C.chalk }}>
          {schedule.planName}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{dayLine}</Text>
      </View>

      {/* the seven-day week — no boxes, no dots; a single tonal system */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        {windowDays.map((d) => (
          <DayChip key={d.dateKey} C={C} day={d} selected={d.index === selectedIndex} onSelect={() => { setPicked(d.index); onSelectDay?.(d); }} t={t} />
        ))}
      </View>

      {/* full-bleed hairline — the only separator between week and session */}
      <View style={{ height: 1, backgroundColor: C.line, marginHorizontal: -CARD_PAD, marginTop: 16, marginBottom: 16 }} />

      {/* state-aware session, flowing directly on the card (no nested surface) */}
      <DayDetail
        key={sel.dateKey}
        C={C}
        scheme={scheme}
        day={sel}
        receipt={receipt}
        units={units}
        streakDays={streakDays}
        doneFloor={doneFloor}
        onStart={(b) => onStart(b, titleFor(sel))}
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

/** The single glyph a day wears in the rail, by status — the SAME SVG marks (and
 *  sizes) as the web rail's chipGlyph. Upcoming/today carry none (a plain day IS
 *  a training day; today's disc is its own mark). */
function chipGlyph(day: ScheduledDay, C: Pal): ReactNode {
  if (day.isRest) return <Moon c={C.ash} />;
  switch (day.status) {
    case "done": return <Check c={C.chalk} s={10} />;
    case "missed": return <Cross c={txt(C, C.red) as string} s={9} />;
    case "skipped": return <SkipGlyph c={C.ash} s={11} />;
    case "postponed": return <PostponeGlyph c={C.ash} s={12} />;
    default: return null; // upcoming / today
  }
}
function chipNumColor(day: ScheduledDay, C: Pal): string {
  if (day.isRest) return C.ash;
  if (day.status === "done") return C.chalk;
  if (day.status === "missed") return txt(C, C.red);
  return C.ash; // upcoming / skipped / postponed
}

function DayChip({ C, day, selected, onSelect, t }: { C: Pal; day: ScheduledDay; selected: boolean; onSelect: () => void; t: (k: string) => string }) {
  const isTodayDisc = day.isToday;
  const glyph = chipGlyph(day, C);
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${day.weekdayShort} ${day.dayOfMonth} — ${t(`w.home.rail.${day.status}`)}`}
      style={{ flex: 1, alignItems: "center", gap: 5, paddingTop: 6, paddingBottom: 5, opacity: day.isRest ? 0.45 : 1 }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{day.weekdayShort}</Text>
      {/* number slot — today = filled chartreuse disc; a tapped non-today day = a
          hairline disc (preview cue); otherwise a bare tonal number. */}
      <View style={{ height: 28, alignItems: "center", justifyContent: "center" }}>
        {isTodayDisc ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 14, color: C.onAccent }}>{day.dayOfMonth}</Text>
          </View>
        ) : selected ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: `${C.chalk}4d`, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{day.dayOfMonth}</Text>
          </View>
        ) : (
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: chipNumColor(day, C), textDecorationLine: day.status === "skipped" ? "line-through" : "none" }}>{day.dayOfMonth}</Text>
        )}
      </View>
      <View style={{ height: 12, alignItems: "center", justifyContent: "center", opacity: day.status === "done" ? 0.7 : 1 }}>
        {glyph}
      </View>
    </Pressable>
  );
}

function LiftRow({ C, r, showSession, first }: { C: Pal; r: { name: string; session?: string | null; detail: string; note?: string | null }; showSession: boolean; first: boolean }) {
  const steps = parseLoadSteps(r.detail);
  return (
    <View style={{ paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, marginBottom: 8 }}>
        {showSession && r.session ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{r.session}  </Text> : null}
        {r.name}
        {r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}> ({r.note})</Text> : null}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {steps ? steps.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "baseline", marginRight: 16, marginBottom: 4 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{s.load}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginLeft: 6 }}>{s.scheme}</Text>
          </View>
        )) : (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{r.detail}</Text>
        )}
      </View>
    </View>
  );
}

function DayDetail({ C, scheme, day, receipt, units, streakDays, doneFloor, onStart, onSkip, onUnskip, onPostpone, canPostpone, onHistory, t }: {
  C: Pal;
  scheme: "dark" | "light";
  day: ScheduledDay;
  /** the fulfilled day's summary (null when the logged session isn't loaded). */
  receipt: DoneReceipt | null;
  units: WeightUnit;
  /** the athlete's current day-streak, for the done-today stamp. */
  streakDays: number;
  /** the day's logged sessions as this card's lower floor (see the prop above). */
  doneFloor?: ReactNode;
  onStart: (b?: SessionBlock[]) => void;
  onSkip: () => void;
  onUnskip: () => void;
  onPostpone: () => void;
  canPostpone: boolean;
  onHistory: () => void;
  t: (k: string) => string;
}) {
  // The corner stamp — how far this day sits from now, never a second copy of
  // the chip above it or of the headline beside it (core day-stamp.ts). Null
  // when the card has already said it; the absolute date past the near window.
  const stamp = dayStampText(
    dayStamp({ dateKey: day.dateKey, done: day.status === "done", streakDays }),
    t,
    `${day.weekdayShort} ${day.dayOfMonth} ${day.monthShort}`,
  );
  // Group the day into sessions so a multi-session day (AM + PM, or several
  // untimed trainings) draws one tab per session — the title stays welded to its
  // own lifts. Single-session days fall back to the day's flat rows/blocks.
  const sessions = day.sessions ?? [];
  const multi = sessions.length > 1;
  const [active, setActive] = useState(0);
  const activeIdx = Math.min(active, sessions.length - 1);
  const activeSession = multi ? sessions[activeIdx] : sessions[0];
  const rows = activeSession?.rows ?? day.rows;
  const startBlocks = activeSession?.blocks ?? day.blocks;

  // Fading show-more disclosure — reset whenever the visible session changes.
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [activeIdx, day.dateKey]);
  const hasMore = rows.length > PEEK;
  const shown = open || !hasMore ? rows : rows.slice(0, PEEK);

  if (day.isRest) {
    return (
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Moon c={C.ash} s={26} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{t("w.home.rail.restDay")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2, lineHeight: leading(fs.caption) }}>{t("w.home.rail.restNote")}</Text>
          </View>
        </View>
        {/* A rest day asks for nothing — but an easy swim still happened, and it
            used to sit in a card of its own with nothing tying it to the rest
            note above. One card now says both. */}
        {doneFloor}
      </View>
    );
  }

  // Sessions postponed ONTO this date — a light catch-up list (all states).
  const catchUp = day.postponedIn.length > 0 && (
    <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 8 }}>{t("w.home.rail.catchUp")}</Text>
      {day.postponedIn.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: i ? 8 : 0 }}>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{it.title}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.home.rail.movedFrom")} {fmtKey(it.fromDateKey)}</Text>
          </View>
          <GhostBtn C={C} label={t("w.home.rail.doItNow")} onPress={() => onStart(it.blocks)} auto />
        </View>
      ))}
    </View>
  );

  // DONE — the day collapses to a receipt ("The receipt, corrected", see
  // design/done-card-redesign-ideas.html): one headline, the finishing time,
  // only trustworthy figures, and a quiet text link into History instead of a
  // pill. The prescription is settled — it doesn't re-list. Mirrors the web
  // rail exactly.
  //
  // NO META LINE HERE AT ALL. It used to lead with the plan day's title
  // ("Upper + Engine – finished 11:18") — and the Done-today card below names
  // the very session that fulfilled it, wearing a PLAN tag. One screen, one
  // name for the work. The finishing clock that outlived the name has gone too:
  // this receipt is built from the ONE session that fulfilled the day, so on a
  // day trained twice the clock reported the first workout while the figures
  // beside it summed the day. The receipt is its figures.
  if (day.status === "done") {
    return (
      <View>
        <ReceiptBlock
          receipt={receipt}
          units={units}
          title={t(day.isToday ? "w.home.rail.allDone" : "w.home.rail.done")}
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
        {catchUp}
      </View>
    );
  }

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 19, letterSpacing: -0.5, color: C.chalk, flex: 1 }}>{day.title}</Text>
        {!!stamp && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{stamp}</Text>}
      </View>

      {/* a short state note only where it carries meaning (moved / missed / skipped) */}
      {day.status === "postponed" ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5, lineHeight: leading(fs.caption) }}>
          {t("w.home.rail.movedTo")} {day.postponedTo ? fmtKey(day.postponedTo) : ""}
        </Text>
      ) : (day.status === "missed" || day.status === "skipped") ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: day.status === "missed" ? txt(C, C.red) : C.ash, marginTop: 5, lineHeight: leading(fs.caption) }}>{t(`w.home.rail.${day.status}Note`)}</Text>
      ) : null}

      {/* session toggle — an underlined text switch (no boxed segment), only when
          the day holds more than one training. Label = time-of-day or "Training N". */}
      {multi && (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 20, marginTop: 16, marginBottom: 2 }}>
          {sessions.map((s, i) => {
            const on = i === activeIdx;
            return (
              <Pressable
                key={i}
                onPress={() => setActive(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={sessionLabel(s, t)}
                style={{ paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: on ? C.lime : "transparent" }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 12, fontWeight: on ? "600" : "400", letterSpacing: 0.9, color: on ? txt(C, C.lime) : C.ash }}>{sessionLabel(s, t)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ position: "relative", marginTop: multi ? 4 : 8 }}>
        {shown.map((r, i) => (
          <LiftRow key={i} C={C} r={r} showSession={!multi} first={i === 0} />
        ))}
        {hasMore && !open && (
          <LinearGradient pointerEvents="none" colors={[`${C.ink2}00`, C.ink2]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 40 }} />
        )}
      </View>
      {hasMore && (
        <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 12, paddingBottom: 2 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: C.ash }}>{open ? t("w.home.rail.showLess") : t("w.home.rail.showMore").replace("{n}", String(rows.length - PEEK))}</Text>
          <Caret c={C.ash} open={open} />
        </Pressable>
      )}

      {/* actions by state — one accent (Start), the rest neutral glyph/ghosts */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {day.status === "today" && (
          <>
            <PrimaryBtn C={C} label={t("w.home.today.start")} onPress={() => onStart(startBlocks)} />
            <IconBtn C={C} glyph={<SkipGlyph c={C.ash} />} label={t("w.home.rail.skip")} onPress={onSkip} />
            {canPostpone && <IconBtn C={C} glyph={<PostponeGlyph c={C.ash} />} label={t("w.home.rail.postpone")} onPress={onPostpone} />}
          </>
        )}
        {day.status === "missed" && (
          <>
            <PrimaryBtn C={C} label={t("w.home.rail.doItNow")} onPress={() => onStart(startBlocks)} />
            <IconBtn C={C} glyph={<SkipGlyph c={C.ash} />} label={t("w.home.rail.skip")} onPress={onSkip} />
            {canPostpone && <IconBtn C={C} glyph={<PostponeGlyph c={C.ash} />} label={t("w.home.rail.postpone")} onPress={onPostpone} />}
          </>
        )}
        {day.status === "skipped" && <GhostBtn C={C} label={t("w.home.rail.undoSkip")} onPress={onUnskip} flex1 />}
        {day.status === "upcoming" && (
          <>
            <PrimaryBtn C={C} label={t("w.home.rail.startEarly")} onPress={() => onStart(startBlocks)} />
            {canPostpone && <IconBtn C={C} glyph={<PostponeGlyph c={C.ash} />} label={t("w.home.rail.postpone")} onPress={onPostpone} />}
          </>
        )}
        {day.status === "postponed" && (
          <>
            <PrimaryBtn C={C} label={t("w.home.rail.doItNow")} onPress={() => onStart(startBlocks)} />
            <GhostBtn C={C} label={t("w.home.rail.unpostpone")} onPress={onUnskip} />
          </>
        )}
      </View>

      {catchUp}
      {/* …and below the seam, what was already logged on this day — an off-plan
          run on a day the plan is still waiting for, or the tennis you played
          instead of the session you missed. Both are true at once, and the card
          now says so. */}
      {doneFloor}
    </View>
  );
}

function PrimaryBtn({ C, label, onPress }: { C: Pal; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", ...startGlow(C.lime, pressed) })}>
      <CtaLabel label={label} color={C.onAccent} fontSize={fs.bodyLg} />
    </Pressable>
  );
}

/** Compact glyph button for rare secondary actions (skip / postpone) — carries
 *  the same SVG mark as the web rail's iconBtn. */
function IconBtn({ C, glyph, label, onPress }: { C: Pal; glyph: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 48, height: 48, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}
    >
      {glyph}
    </Pressable>
  );
}

/** Neutral secondary text pill — undo / history / unpostpone. No second accent. */
function GhostBtn({ C, label, onPress, flex1, auto }: { C: Pal; label: string; onPress: () => void; flex1?: boolean; auto?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: auto ? 0 : 1,
        minWidth: flex1 || auto ? undefined : 0,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: RADIUS.pill,
        paddingVertical: auto ? 8 : 12,
        paddingHorizontal: auto ? 14 : undefined,
        alignItems: "center",
      }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{label}</Text>
    </Pressable>
  );
}
