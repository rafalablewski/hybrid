"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  logbookWeek,
  mergeDoneReceipts,
  doneReceipt,
  dayStamp,
  dayStampText,
  streak,
  fs,
  type LogbookDay,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { CtaLabel } from "./cta-label";
import ReceiptBlock, { RECEIPT_GUTTER } from "./receipt-block";

// ── AURORA Logbook rail (web) ───────────────────────────────────────────────
// "The Constant": the SAME week-rail object the plan state ships, mounted in
// LOGBOOK MODE for the plan-less athlete with logged history — so the calendar
// exists for the whole life of the account, and enrolling changes the card's
// fill, never its shape. Same anatomy as week-rail.tsx (one ink2 surface:
// header row, seven day chips, full-bleed hairline, a state-aware day detail),
// with the plan's vocabulary swapped for the log's: a day either holds
// training (✓, chalk) or stays quiet greyscale — a logbook makes no promises,
// so there is no "missed", no terracotta. Data from @hybrid/core logbookWeek.
// Mirrored on mobile (aurora/logbook-rail.tsx).

const C = (v: string) => `var(--color-${v})`;

const Check = ({ c = "currentColor", s = 11 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2.5 6.3 5 8.6 9.5 3.4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function AuroraLogbookRail({
  sessions,
  onLog,
  onNavigate,
  onSelectDay,
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
  /** The DONE FLOOR — every session logged on the viewed day, rendered as this
   *  card's lower floor under a labelled seam (aurora/done-floor.tsx). It is
   *  passed in rather than built here because the screen owns the day's
   *  sessions, the quick-log sheet and the Done-today sheet. */
  doneFloor?: ReactNode;
}) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();

  const week = useMemo(() => logbookWeek(sessions), [sessions]);

  // Selected day: follows today until the athlete taps another chip.
  const [picked, setPicked] = useState<number | null>(null);
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

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

  return (
    <div data-tour="today-plan" style={{ ...card }}>
      {/* header: the log's name + the window on one baseline row */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 21, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{t("w.home.logbook.title")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), textTransform: "uppercase", flexShrink: 0 }}>{t("w.home.logbook.window")}</div>
      </div>

      {/* the seven-day week — the plan rail's chip anatomy, logbook vocabulary */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 4, margin: "16px 0 0" }}>
        {week.days.map((d) => (
          <DayChip key={d.dateKey} day={d} selected={d.index === selectedIndex} onSelect={() => { setPicked(d.index); onSelectDay?.(d); }} t={t} />
        ))}
      </div>

      {/* full-bleed hairline — the only separator between week and day */}
      <div style={{ height: 1, background: C("line"), margin: "16px -20px 16px" }} />

      <DayDetail
        key={sel.dateKey}
        day={sel}
        receipt={receipt}
        units={units}
        streakDays={streakDays}
        doneFloor={doneFloor}
        onLog={onLog}
        onHistory={() => (onNavigate ? onNavigate("history") : undefined)}
        t={t}
      />
    </div>
  );
}

function DayChip({ day, selected, onSelect, t }: { day: LogbookDay; selected: boolean; onSelect: () => void; t: (k: string) => string }) {
  // The number lives in a 28px slot. Today = a filled chartreuse disc (the one
  // point of focus). A tapped, non-today day = a hairline disc (preview cue).
  const numInner: CSSProperties = day.isToday
    ? { width: 28, height: 28, borderRadius: 999, background: C("lime"), color: "var(--on-accent)", fontWeight: 800, fontSize: 14, display: "grid", placeItems: "center" }
    : selected
      ? { width: 28, height: 28, borderRadius: 999, border: `1px solid color-mix(in srgb, ${C("chalk")} 32%, ${C("line")})`, color: C("chalk"), fontWeight: 700, fontSize: 15, display: "grid", placeItems: "center" }
      : { fontWeight: 700, fontSize: 15, color: day.logged ? C("chalk") : C("ash") };

  return (
    <button className="pressable"
      onClick={onSelect}
      aria-label={`${day.weekdayShort} ${day.dayOfMonth} — ${t(day.logged ? "w.home.logbook.loggedDay" : "w.home.logbook.emptyPast")}`}
      aria-pressed={selected}
      style={{ flex: 1, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "6px 0 5px", border: "none", background: "transparent" }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), opacity: 0.8 }}>{day.weekdayShort}</span>
      <span style={{ height: 28, display: "grid", placeItems: "center", fontFamily: "var(--font-display)" }}>
        <span style={numInner}>{day.dayOfMonth}</span>
      </span>
      {/* glyph slot — ✓ for a logged day; an un-logged day carries no mark
          (silence, never terracotta: a logbook makes no promises). */}
      <span style={{ height: 12, display: "grid", placeItems: "center", color: C("ash"), opacity: 0.7 }}>{day.logged ? <Check c={C("chalk")} s={10} /> : null}</span>
    </button>
  );
}

function DayDetail({ day, receipt, units, streakDays, doneFloor, onLog, onHistory, t }: {
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
  // NO META LINE HERE AT ALL. It used to join the day's session titles
  // ("Tennis – Afternoon workout – finished 14:33"), and the Done-today card a
  // few hundred pixels below lists those very sessions by name, one row each,
  // with their own figures — the same words twice on one screen. The names went
  // then; the finishing clock that survived them has gone too (it named the
  // first workout of a day the figures beside it summed whole). The receipt is
  // its figures.
  if (day.logged) {
    return (
      <div>
        <ReceiptBlock
          receipt={receipt}
          units={units}
          title={t(day.isToday ? "w.home.rail.allDone" : "w.home.logbook.loggedDay")}
          stamp={stamp}
        />
        {doneFloor}
        <button className="pressable" onClick={onHistory} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, margin: "16px 0 0", padding: `16px 0 0 ${RECEIPT_GUTTER}px`, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
          <CtaLabel size={12}>{`${t("w.home.rail.viewHistory")} →`}</CtaLabel>
        </button>
      </div>
    );
  }

  // TODAY, nothing logged yet — the open day: one honest headline and the one
  // lime action. The chooser's structure options live OUTSIDE the rail.
  if (day.isToday) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, letterSpacing: "-.02em" }}>{t("w.home.logbook.emptyToday")}</div>
          {stamp && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>{stamp}</span>}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), margin: "5px 0 0", lineHeight: 1.5 }}>{t("w.home.logbook.emptyTodaySub")}</div>
        <button
          onClick={onLog}
          className="start-glow pressable"
          style={{ marginTop: 16, width: "100%", display: "block", background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "12px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, cursor: "pointer" }}
        >
          <CtaLabel>{t("w.home.today.alsoTodayLogFirst")}</CtaLabel>
        </button>
        {/* the quick-SPORT door (a match, a run, a swim) — a different action to
            the structured logger above it, and the only way to reach it here. */}
        {doneFloor}
      </div>
    );
  }

  // A PAST day with nothing logged gets NO floor: the arm below already says
  // "nothing logged", and a logbook day is `logged` exactly when it holds
  // sessions — so the floor could only repeat that sentence in smaller type.
  //
  // A PAST day with nothing logged — quiet, factual, no guilt (the rest-day
  // register of the plan rail, without the moon: nothing was promised).
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("ash") }}>{t("w.home.logbook.emptyPast")}</div>
        {stamp && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>{stamp}</span>}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), margin: "5px 0 0", lineHeight: 1.5 }}>{t("w.home.today.doneModalEmptyDay")}</div>
    </div>
  );
}
