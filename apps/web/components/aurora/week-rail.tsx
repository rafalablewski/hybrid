"use client";

import { useMemo, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  planSchedule,
  doneReceipt,
  dayStamp,
  dayStampText,
  streak,
  fs,
  type DoneReceipt,
  type LoggedSession,
  type SessionBlock,
  type ScheduledDay,
  type PlanDaySession,
  type WeightUnit,
} from "@hybrid/core";
import { usePlanOverrides } from "@/lib/plan-overrides";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { CtaLabel } from "./cta-label";
import ReceiptBlock, { RECEIPT_GUTTER } from "./receipt-block";

// ── AURORA Week rail (web) ──────────────────────────────────────────────────
// The date-anchored replacement for the count-based "Your plan today". A static
// seven-day week flowing into a state-aware session on ONE surface (no nested
// detail card). The rail is a single tonal system: state reads from weight + a
// glyph, not a palette. Colour is attention — chartreuse means "act now" (today,
// start, active session), terracotta means "you missed this"; every settled or
// upcoming day is greyscale, ranked by presence. The week is a sliding window
// centred on the selected day, so tapping an edge day walks through the plan
// (no scroll strip / pagers). Pure data from @hybrid/core's planSchedule; skips
// persist via usePlanOverrides. Mirrored on mobile (aurora/week-rail.tsx).
// Renders nothing (caller falls back) unless a program plan + start date resolve.

const C = (v: string) => `var(--color-${v})`;

// Days shown at once, and how many lifts show before the fading disclosure.
const WINDOW = 7;
const PEEK = 2;

const Check = ({ c = "currentColor", s = 11 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2.5 6.3 5 8.6 9.5 3.4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Cross = ({ c = "currentColor", s = 9 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden><path d="M3 3l6 6M9 3l-6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" /></svg>
);
const SkipGlyph = ({ c = "currentColor", s = 12 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 14 12" fill="none" aria-hidden><path d="M3 3l3.2 3-3.2 3M7.5 3l3.2 3-3.2 3" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Moon = ({ c = "currentColor", s = 12 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 14 14" fill="none" aria-hidden><path d="M11 8.2A4.2 4.2 0 1 1 5.8 3a3.3 3.3 0 0 0 5.2 5.2Z" stroke={c} strokeWidth="1.2" strokeLinejoin="round" /></svg>
);
const PostponeGlyph = ({ c = "currentColor", s = 16 }: { c?: string; s?: number }) => (
  <svg width={s} height={s * 0.86} viewBox="0 0 14 12" fill="none" aria-hidden><path d="M2 6h8M6.5 2.5 10.5 6l-4 3.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M12.5 2v8" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>
);
const Caret = ({ open }: { open: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}>
    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The single glyph a day wears in the rail, by status. Scheduled days upcoming
 *  carry NO mark (a plain day is a training day — a dot there says nothing);
 *  today carries none either (its chartreuse disc is the mark). */
function chipGlyph(day: ScheduledDay): React.ReactNode {
  if (day.isRest) return <Moon c={C("ash")} />;
  switch (day.status) {
    case "done": return <Check c={C("chalk")} s={10} />;
    case "missed": return <Cross c="var(--red-text)" s={9} />;
    case "skipped": return <SkipGlyph c={C("ash")} s={11} />;
    case "postponed": return <PostponeGlyph c={C("ash")} s={12} />;
    default: return null; // upcoming / today
  }
}

/** The number's tone — greyscale, ranked by presence; red only for a miss. */
function chipNumColor(day: ScheduledDay): string {
  if (day.isRest) return C("ash");
  switch (day.status) {
    case "done": return C("chalk");
    case "missed": return "var(--red-text)";
    default: return C("ash"); // upcoming / skipped / postponed
  }
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
   *  plan's own (mobile stamps the same shape via its pendingPlanSession). */
  onStart: (planBlocks?: SessionBlock[], title?: string) => void;
  onNavigate?: (screen: string) => void;
  /** Fires when the athlete taps a day chip, so the caller can scope the rest
   *  of the screen (Also-today / feeling cards) to the viewed day. Until the
   *  first tap the caller should assume today. */
  onSelectDay?: (day: ScheduledDay) => void;
  /** Bump to snap the rail's internal selection back to today (the masthead's
   *  "Back to today" affordance). Mirrors the mobile rail. */
  resetToken?: number;
  /** The DONE FLOOR — every session logged on the viewed day, rendered as this
   *  card's lower floor under a labelled seam (aurora/done-floor.tsx). The plan
   *  floor above states what is ASKED of the athlete; this one states what they
   *  DID, and the seam is what keeps a tennis row from reading as the last line
   *  of the prescription. Passed in because the screen owns the day's sessions,
   *  the quick-log sheet and the Done-today sheet. */
  doneFloor?: ReactNode;
}) {
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
  // deriving the selected day itself.
  const receipt = useMemo(() => {
    const day = schedule?.days[selectedIndex] ?? schedule?.days[schedule.todayIndex];
    const doneSession = (day?.status === "done" && day.sessionId && sessions.find((s) => s.id === day.sessionId)) || null;
    return doneSession ? doneReceipt(doneSession, { bodyweightKg: bw(doneSession.startedAt) }) : null;
  }, [schedule, selectedIndex, sessions, bw]);

  // The athlete's current run — what the done-today card's corner reports in
  // place of a date the week strip has already shown (see core day-stamp.ts).
  const streakDays = useMemo(() => streak(sessions, 1).current, [sessions]);

  if (!schedule || !schedule.days.length) return null;
  const sel = schedule.days[selectedIndex] ?? schedule.days[schedule.todayIndex]!;

  // The visible week: a WINDOW-day slice centred on the selected day, clamped to
  // the plan. Tapping an edge day re-centres it, walking through the schedule.
  const total = schedule.days.length;
  const winStart = Math.max(0, Math.min(selectedIndex - Math.floor(WINDOW / 2), Math.max(0, total - WINDOW)));
  const windowDays = schedule.days.slice(winStart, winStart + WINDOW);

  const dayLine = sel.trainingDayNumber != null ? `${t("w.home.today.day")} ${sel.trainingDayNumber} / ${schedule.totalTrainingDays}` : t("w.home.rail.rest");

  // The plan-composed title the saved session should carry — the same shape the
  // mobile plan prefill writes ("<plan> – Week N, <day>"), so planSchedule's
  // title arm recognises it even if the athlete edits the exercises.
  const multiWeek = (schedule.days[schedule.days.length - 1]?.week ?? 1) > 1;
  const titleFor = (d: ScheduledDay) => `${schedule.planName} – ${multiWeek ? `Week ${d.week}, ` : ""}${d.title}`;

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;

  return (
    <div data-tour="today-plan" style={{ ...card }}>
      {/* header: plan name + progress on one baseline row */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 21, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{schedule.planName}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), textTransform: "uppercase", flexShrink: 0 }}>{dayLine}</div>
      </div>

      {/* the seven-day week — no boxes, no dots; a single tonal system */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 4, margin: "16px 0 0" }}>
        {windowDays.map((d) => (
          <DayChip key={d.dateKey} day={d} selected={d.index === selectedIndex} onSelect={() => { setPicked(d.index); onSelectDay?.(d); }} t={t} />
        ))}
      </div>

      {/* full-bleed hairline — the only separator between week and session */}
      <div style={{ height: 1, background: C("line"), margin: "16px -20px 16px" }} />

      {/* state-aware session, flowing directly on the card (no nested surface) */}
      <DayDetail
        key={sel.dateKey}
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
        onHistory={() => (onNavigate ? onNavigate("history") : undefined)}
        t={t}
      />
    </div>
  );
}

function DayChip({ day, selected, onSelect, t }: { day: ScheduledDay; selected: boolean; onSelect: () => void; t: (k: string) => string }) {
  const isTodayDisc = day.isToday;
  const numColor = chipNumColor(day);
  // The number lives in a 28px slot. Today = a filled chartreuse disc (the one
  // point of focus). A tapped, non-today day = a hairline disc (preview cue).
  const numInner: CSSProperties = isTodayDisc
    ? { width: 28, height: 28, borderRadius: 999, background: C("lime"), color: "var(--on-accent)", fontWeight: 800, fontSize: 14, display: "grid", placeItems: "center" }
    : selected
      ? { width: 28, height: 28, borderRadius: 999, border: `1px solid color-mix(in srgb, ${C("chalk")} 32%, ${C("line")})`, color: C("chalk"), fontWeight: 700, fontSize: 15, display: "grid", placeItems: "center" }
      : { fontWeight: 700, fontSize: 15, color: numColor, textDecoration: day.status === "skipped" ? "line-through" : "none" };

  const base: CSSProperties = {
    flex: 1, cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
    padding: "6px 0 5px", border: "none", background: "transparent",
    opacity: day.isRest ? 0.45 : 1,
  };
  return (
    <button className="pressable" onClick={onSelect} aria-label={`${day.weekdayShort} ${day.dayOfMonth} — ${t(`w.home.rail.${day.status}`)}`} aria-pressed={selected} style={base}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), opacity: 0.8 }}>{day.weekdayShort}</span>
      <span style={{ height: 28, display: "grid", placeItems: "center", fontFamily: "var(--font-display)" }}>
        <span style={numInner}>{day.dayOfMonth}</span>
      </span>
      <span style={{ height: 12, display: "grid", placeItems: "center", color: C("ash"), opacity: day.status === "done" ? 0.7 : 1 }}>{chipGlyph(day)}</span>
    </button>
  );
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

/** A session's tab/label: the plan's time-of-day when it sets one (AM/PM), else a
 *  plain "Training N" — the ordinal, never a fabricated time, is the anchor. */
function sessionLabel(s: PlanDaySession, t: (k: string) => string): string {
  return s.timeOfDay ?? `${t("w.home.rail.session")} ${s.ordinal}`;
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

function LiftRow({ r, showSession, first }: { r: { name: string; session?: string | null; detail: string; note?: string | null }; showSession: boolean; first: boolean }) {
  const steps = parseLoadSteps(r.detail);
  return (
    <div style={{ padding: "12px 0", borderTop: first ? "none" : `1px solid ${C("line")}` }}>
      <div style={{ fontWeight: 600, fontSize: fs.bodyLg, letterSpacing: "-.01em", marginBottom: 8 }}>
        {showSession && r.session ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginRight: 8 }}>{r.session}</span> : null}
        {r.name}
        {r.note ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), fontWeight: 400 }}> ({r.note})</span> : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
        {steps ? steps.map((s, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <b style={{ fontWeight: 600, fontSize: fs.bodyLg, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{s.load}</b>
            <i style={{ fontFamily: "var(--font-mono)", fontStyle: "normal", fontSize: fs.micro, color: C("ash") }}>{s.scheme}</i>
          </span>
        )) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{r.detail}</span>
        )}
      </div>
    </div>
  );
}

function DayDetail({ day, receipt, units, streakDays, doneFloor, onStart, onSkip, onUnskip, onPostpone, canPostpone, onHistory, t }: {
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
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: C("ash"), display: "grid", placeItems: "center", flexShrink: 0 }}><Moon c={C("ash")} s={26} /></span>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.home.rail.restDay")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2, lineHeight: 1.5 }}>{t("w.home.rail.restNote")}</div>
          </div>
        </div>
        {/* A rest day asks for nothing — but an easy swim still happened, and it
            used to sit in a card of its own with nothing tying it to the rest
            note above. One card now says both. */}
        {doneFloor}
      </div>
    );
  }

  // Sessions postponed ONTO this date — a light catch-up list (all states).
  const catchUp = day.postponedIn.length > 0 && (
    <div style={{ marginTop: 16, borderTop: `1px solid ${C("line")}`, paddingTop: 12 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>{t("w.home.rail.catchUp")}</div>
      {day.postponedIn.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: i ? 8 : 0 }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 700, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span>
            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{t("w.home.rail.movedFrom")} {fmtKey(it.fromDateKey)}</span>
          </span>
          <button className="pressable" onClick={() => onStart(it.blocks)} style={{ ...neutralGhostBtn, flex: "0 0 auto", padding: "8px 16px" }}>{t("w.home.rail.doItNow")}</button>
        </div>
      ))}
    </div>
  );

  // DONE — the day collapses to a receipt ("The receipt, corrected", see
  // design/done-card-redesign-ideas.html): one headline, the finishing time,
  // only trustworthy figures, and a quiet text link into History instead of a
  // pill. The prescription is settled — it doesn't re-list.
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
      <div>
        <ReceiptBlock
          receipt={receipt}
          units={units}
          title={t(day.isToday ? "w.home.rail.allDone" : "w.home.rail.done")}
          stamp={stamp}
        />
        {doneFloor}
        <button className="pressable" onClick={onHistory} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, margin: "16px 0 0", padding: `16px 0 0 ${RECEIPT_GUTTER}px`, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
          <CtaLabel size={12}>{`${t("w.home.rail.viewHistory")} →`}</CtaLabel>
        </button>
        {catchUp}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, letterSpacing: "-.02em" }}>{day.title}</div>
        {stamp && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>{stamp}</span>}
      </div>

      {/* a short state note only where it carries meaning (moved / missed / skipped) */}
      {day.status === "postponed" ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), margin: "5px 0 0", lineHeight: 1.5 }}>
          {t("w.home.rail.movedTo")} {day.postponedTo ? fmtKey(day.postponedTo) : ""}
        </div>
      ) : (day.status === "missed" || day.status === "skipped") ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: day.status === "missed" ? "var(--red-text)" : C("ash"), margin: "5px 0 0", lineHeight: 1.5 }}>
          {t(`w.home.rail.${day.status}Note`)}
        </div>
      ) : null}

      {/* session toggle — an underlined text switch (no boxed segment), only when
          the day holds more than one training. Label = time-of-day or "Training N". */}
      {multi && (
        <div role="tablist" aria-label={day.title} style={{ display: "flex", gap: 20, margin: "16px 0 2px" }}>
          {sessions.map((s, i) => {
            const on = i === activeIdx;
            return (
              <button className="pressable" key={i} role="tab" aria-selected={on} onClick={() => setActive(i)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 8px", position: "relative", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".08em", fontWeight: on ? 600 : 400, color: on ? "var(--lime-text)" : C("ash") }}>
                {sessionLabel(s, t)}
                {on && <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: C("lime"), borderRadius: 2 }} />}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ position: "relative", marginTop: multi ? 4 : 8 }}>
        {shown.map((r, i) => (
          <LiftRow key={i} r={r} showSession={!multi} first={i === 0} />
        ))}
        {hasMore && (
          <button className="pressable" onClick={() => setOpen((v) => !v)} style={{ position: "relative", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "12px 0 2px", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em", color: C("ash"), display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {!open && <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: "100%", height: 40, pointerEvents: "none", background: `linear-gradient(to top, ${C("ink2")} 14%, transparent)` }} />}
            {open ? t("w.home.rail.showLess") : t("w.home.rail.showMore").replace("{n}", String(rows.length - PEEK))}
            <Caret open={open} />
          </button>
        )}
      </div>

      {/* actions by state — one accent (Start), the rest neutral glyph/ghosts */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 8, marginTop: 16 }}>
        {(day.status === "today" || day.status === "missed") && (<>
          <button onClick={() => onStart(startBlocks)} className="start-glow pressable" style={primaryBtn}><CtaLabel>{t(day.status === "today" ? "w.home.today.start" : "w.home.rail.doItNow")}</CtaLabel></button>
          <button className="pressable" onClick={onSkip} aria-label={t("w.home.rail.skip")} title={t("w.home.rail.skip")} style={iconBtn}><SkipGlyph /></button>
          {canPostpone && <button className="pressable" onClick={onPostpone} aria-label={t("w.home.rail.postpone")} title={t("w.home.rail.postpone")} style={iconBtn}><PostponeGlyph /></button>}
        </>)}
        {day.status === "upcoming" && (<>
          <button onClick={() => onStart(startBlocks)} className="start-glow pressable" style={primaryBtn}><CtaLabel>{t("w.home.rail.startEarly")}</CtaLabel></button>
          {canPostpone && <button className="pressable" onClick={onPostpone} aria-label={t("w.home.rail.postpone")} title={t("w.home.rail.postpone")} style={iconBtn}><PostponeGlyph /></button>}
        </>)}
        {day.status === "skipped" && (
          <button className="pressable" onClick={onUnskip} style={{ ...neutralGhostBtn, flex: 1 }}>{t("w.home.rail.undoSkip")}</button>
        )}
        {day.status === "postponed" && (<>
          <button onClick={() => onStart(startBlocks)} className="start-glow pressable" style={primaryBtn}><CtaLabel>{t("w.home.rail.doItNow")}</CtaLabel></button>
          <button className="pressable" onClick={onUnskip} style={neutralGhostBtn}>{t("w.home.rail.unpostpone")}</button>
        </>)}
      </div>

      {catchUp}
      {/* …and below the seam, what was already logged on this day — an off-plan
          run on a day the plan is still waiting for, or the tennis you played
          instead of the session you missed. Both are true at once, and the card
          now says so. */}
      {doneFloor}
    </div>
  );
}

const primaryBtn: CSSProperties = { flex: 1, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "12px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, letterSpacing: "-.01em", cursor: "pointer" };
// Neutral secondary — undo / history / unpostpone. No second accent colour.
const neutralGhostBtn: CSSProperties = { flex: 1, background: "transparent", border: `1px solid ${C("line")}`, color: C("ash"), borderRadius: 999, padding: "12px", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" };
// Compact glyph button for rare secondary actions (skip / postpone).
const iconBtn: CSSProperties = { flex: "0 0 auto", width: 48, height: 48, borderRadius: 999, background: "transparent", border: `1px solid ${C("line")}`, color: C("ash"), display: "grid", placeItems: "center", cursor: "pointer" };
