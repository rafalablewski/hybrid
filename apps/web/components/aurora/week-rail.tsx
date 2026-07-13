"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  planSchedule,
  fs,
  space,
  type LoggedSession,
  type SessionBlock,
  type ScheduledDay,
  type PlanDayStatus,
} from "@hybrid/core";
import { usePlanOverrides } from "@/lib/plan-overrides";
import { useLang } from "@/lib/i18n";

// ── AURORA Week rail (web) ──────────────────────────────────────────────────
// The date-anchored replacement for the count-based "Your plan today". A
// scrollable seven-day strip where every day wears its status (done / missed /
// skipped / today / upcoming / rest); tapping a day opens a state-aware card that
// decides what you can do (Start, Do it now, View, Undo skip). Pure data comes
// from @hybrid/core's planSchedule; skips persist via usePlanOverrides. Mirrored
// on mobile (aurora/week-rail.tsx). Renders nothing (caller falls back) unless a
// program plan + start date resolve a schedule.

const C = (v: string) => `var(--color-${v})`;

type Palette = { text: string; ring: string; soft: string };
function statusPalette(s: PlanDayStatus): Palette {
  switch (s) {
    case "done":
      return { text: "var(--lime-text)", ring: C("lime"), soft: `color-mix(in srgb, ${C("lime")} 16%, transparent)` };
    case "missed":
      return { text: "var(--amber-text)", ring: C("amber"), soft: `color-mix(in srgb, ${C("amber")} 14%, transparent)` };
    case "skipped":
      return { text: "var(--blue-text)", ring: C("blue"), soft: `color-mix(in srgb, ${C("blue")} 12%, transparent)` };
    case "postponed":
      return { text: "var(--violet-text)", ring: C("violet"), soft: `color-mix(in srgb, ${C("violet")} 13%, transparent)` };
    case "today":
      return { text: "var(--lime-text)", ring: C("lime"), soft: `color-mix(in srgb, ${C("lime")} 12%, transparent)` };
    case "rest":
      return { text: C("ash"), ring: C("line"), soft: "transparent" };
    default: // upcoming
      return { text: C("chalk"), ring: C("line"), soft: "transparent" };
  }
}

const Check = ({ c = "currentColor", s = 12 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2.5 6.3 5 8.6 9.5 3.4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Cross = ({ c = "currentColor", s = 10 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden><path d="M3 3l6 6M9 3l-6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" /></svg>
);
const SkipGlyph = ({ c = "currentColor", s = 12 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 14 12" fill="none" aria-hidden><path d="M3 3l3.2 3-3.2 3M7.5 3l3.2 3-3.2 3" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Moon = ({ c = "currentColor", s = 12 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 14 14" fill="none" aria-hidden><path d="M11 8.2A4.2 4.2 0 1 1 5.8 3a3.3 3.3 0 0 0 5.2 5.2Z" stroke={c} strokeWidth="1.2" strokeLinejoin="round" /></svg>
);
const PostponeGlyph = ({ c = "currentColor", s = 12 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 14 12" fill="none" aria-hidden><path d="M2 6h8M6.5 2.5 10.5 6l-4 3.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M12.5 2v8" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></svg>
);
const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d={dir === "l" ? "M7.5 3 4 6l3.5 3" : "M4.5 3 8 6l-3.5 3"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
  const { t } = useLang();
  const { overrides, setOverride } = usePlanOverrides(planId);

  const schedule = useMemo(
    () => planSchedule({ planId, startedAt: planStartedAt, sessions, overrides, maxes }),
    [planId, planStartedAt, sessions, overrides, maxes],
  );

  // Selected day: follows today until the athlete taps another day.
  const [picked, setPicked] = useState<number | null>(null);
  const selectedIndex = picked ?? schedule?.todayIndex ?? 0;

  const railRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Centre today (or the picked day) on first paint + whenever the focus changes.
  useEffect(() => {
    const el = chipRefs.current[selectedIndex];
    if (el) el.scrollIntoView({ inline: "center", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.planId, selectedIndex]);

  const pageBy = useCallback((dir: number) => {
    const r = railRef.current;
    if (r) r.scrollBy({ left: dir * Math.round(r.clientWidth * 0.8), behavior: "smooth" });
  }, []);

  if (!schedule || !schedule.days.length) return null;
  const sel = schedule.days[selectedIndex] ?? schedule.days[schedule.todayIndex]!;

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 } as const;

  return (
    <div data-tour="today-plan" style={{ ...card }}>
      {/* header: plan name + progress + week pager */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{schedule.planName}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
            {sel.trainingDayNumber != null ? `${t("w.home.today.day")} ${sel.trainingDayNumber} / ${schedule.totalTrainingDays}` : t("w.home.rail.rest")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => pageBy(-1)} aria-label={t("w.home.rail.earlier")} style={pagerBtn}><Chevron dir="l" /></button>
          <button onClick={() => pageBy(1)} aria-label={t("w.home.rail.later")} style={pagerBtn}><Chevron dir="r" /></button>
        </div>
      </div>

      {/* the seven-day rail */}
      <div ref={railRef} style={{ display: "flex", gap: 6, overflowX: "auto", scrollSnapType: "x mandatory", margin: "14px -4px 4px", padding: "4px 4px 8px", scrollbarWidth: "none" }}>
        {schedule.days.map((d, i) => (
          <DayChip
            key={d.dateKey}
            day={d}
            selected={i === selectedIndex}
            onSelect={() => setPicked(i)}
            innerRef={(el) => { chipRefs.current[i] = el; }}
            t={t}
          />
        ))}
      </div>

      {/* legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", margin: "2px 2px 0" }}>
        <LegendDot color={C("lime")} label={t("w.home.rail.done")} />
        <LegendDot color={C("amber")} label={t("w.home.rail.missed")} />
        <LegendDot color={C("blue")} label={t("w.home.rail.skipped")} />
        <LegendDot color={C("lime")} outline label={t("w.home.rail.today")} />
      </div>

      {/* state-aware detail card */}
      <DayDetail
        key={sel.dateKey}
        day={sel}
        onStart={onStart}
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

const pagerBtn: CSSProperties = { width: 30, height: 30, borderRadius: 10, background: C("ink"), border: `1px solid ${C("line")}`, color: C("ash"), display: "grid", placeItems: "center", cursor: "pointer" };

function LegendDot({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase", color: C("ash") }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: outline ? "transparent" : color, border: outline ? `1px solid ${color}` : "none" }} />
      {label}
    </span>
  );
}

function DayChip({ day, selected, onSelect, innerRef, t }: { day: ScheduledDay; selected: boolean; onSelect: () => void; innerRef: (el: HTMLButtonElement | null) => void; t: (k: string) => string }) {
  const p = statusPalette(day.status);
  const filled = day.status === "done";
  const base: CSSProperties = {
    flex: "0 0 44px", scrollSnapAlign: "center", cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    padding: "8px 0 7px", borderRadius: 13, position: "relative",
    border: `1px solid ${day.status === "skipped" ? "transparent" : p.ring === C("line") ? C("line") : `color-mix(in srgb, ${p.ring} 55%, transparent)`}`,
    background: filled ? C("lime") : p.soft || C("ink"),
    color: filled ? "var(--on-accent)" : p.text,
    opacity: day.isRest ? 0.6 : 1,
    boxShadow: selected ? `0 8px 18px -8px rgba(0,0,0,.6), 0 0 0 2px ${C("chalk")}` : day.isToday ? `0 0 0 1px ${C("lime")}` : "none",
    transform: selected ? "translateY(-2px)" : "none",
    transition: "transform .16s ease, box-shadow .16s ease",
    ...(day.status === "skipped" ? { borderStyle: "dashed", borderColor: `color-mix(in srgb, ${C("blue")} 45%, transparent)` } : {}),
  };
  return (
    <button ref={innerRef} onClick={onSelect} aria-label={`${day.weekdayShort} ${day.dayOfMonth} — ${t(`w.home.rail.${day.status}`)}`} aria-pressed={selected} style={base}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.8 }}>{day.weekdayShort}</span>
      <span style={{ fontWeight: 800, fontSize: 13, lineHeight: 1, textDecoration: day.status === "skipped" ? "line-through" : "none" }}>{day.dayOfMonth}</span>
      <span style={{ height: 12, display: "grid", placeItems: "center" }}>
        {day.status === "done" ? <Check c="var(--on-accent)" /> :
         day.status === "missed" ? <Cross /> :
         day.status === "skipped" ? <SkipGlyph /> :
         day.status === "postponed" ? <PostponeGlyph /> :
         day.isRest ? <Moon c={C("ash")} /> :
         <span style={{ width: 6, height: 6, borderRadius: "50%", background: day.isToday ? C("lime") : "transparent", border: day.isToday ? "none" : `1.5px solid ${C("ash")}` }} />}
      </span>
    </button>
  );
}

function StatePill({ status, t }: { status: PlanDayStatus; t: (k: string) => string }) {
  const p = statusPalette(status);
  const icon = status === "done" ? <Check s={9} /> : status === "missed" ? <Cross s={8} /> : status === "skipped" ? <SkipGlyph s={10} /> : status === "postponed" ? <PostponeGlyph s={11} /> : status === "rest" ? <Moon s={10} /> : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: p.text, background: status === "upcoming" ? "transparent" : p.soft, border: `1px solid ${status === "upcoming" ? C("line") : `color-mix(in srgb, ${p.ring} 40%, transparent)`}`, borderRadius: 999, padding: "4px 10px" }}>
      {status === "today" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C("lime") }} />}
      {icon}
      {t(`w.home.rail.${status}`)}
    </span>
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

function DayDetail({ day, onStart, onSkip, onUnskip, onPostpone, canPostpone, onHistory, t }: {
  day: ScheduledDay;
  onStart: (b?: SessionBlock[]) => void;
  onSkip: () => void;
  onUnskip: () => void;
  onPostpone: () => void;
  canPostpone: boolean;
  onHistory: () => void;
  t: (k: string) => string;
}) {
  const p = statusPalette(day.status);
  const dateLine = `${day.weekdayShort} ${day.dayOfMonth} ${day.monthShort}`;

  return (
    <div style={{ marginTop: 14, border: `1px solid ${C("line")}`, borderLeft: `3px solid ${day.status === "upcoming" ? C("ash") : p.ring}`, borderRadius: 18, padding: 16, background: C("ink") }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
        <StatePill status={day.status} t={t} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap" }}>{dateLine}</span>
      </div>

      {day.isRest ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: `color-mix(in srgb, ${C("ash")} 12%, transparent)`, border: `1px solid ${C("line")}`, color: C("ash"), display: "grid", placeItems: "center", flexShrink: 0 }}><Moon c={C("ash")} s={20} /></span>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 16 }}>{t("w.home.rail.restDay")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2, lineHeight: 1.5 }}>{t("w.home.rail.restNote")}</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em" }}>{day.title}</div>
          {day.status === "postponed" ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--violet-text)", margin: "5px 0 0", lineHeight: 1.5 }}>
              {t("w.home.rail.movedTo")} {day.postponedTo ? fmtKey(day.postponedTo) : ""}
            </div>
          ) : (day.status === "missed" || day.status === "skipped" || day.status === "upcoming") ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), margin: "5px 0 0", lineHeight: 1.5 }}>
              {t(`w.home.rail.${day.status}Note`)}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: space.xs, marginTop: 11 }}>
            {day.rows.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: space.md, paddingTop: 6, borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                <span style={{ fontWeight: 600, fontSize: fs.body }}>{r.session ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginRight: 7 }}>{r.session}</span> : null}{r.name}{r.note ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}> ({r.note})</span> : null}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), textAlign: "right", flexShrink: 0 }}>{r.detail}</span>
              </div>
            ))}
          </div>

          {/* actions by state */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {(day.status === "today" || day.status === "missed") && (<>
              <button onClick={() => onStart(day.blocks)} style={primaryBtn}>{t(day.status === "today" ? "w.home.today.start" : "w.home.rail.doItNow")}</button>
              <button onClick={onSkip} style={ghostBtn(C("blue"))}>{t("w.home.rail.skip")}</button>
              {canPostpone && <button onClick={onPostpone} style={ghostBtn(C("violet"))}>{t("w.home.rail.postpone")}</button>}
            </>)}
            {day.status === "upcoming" && (<>
              <button onClick={() => onStart(day.blocks)} style={{ ...ghostBtn(C("lime")), flex: 2 }}>{t("w.home.rail.startEarly")}</button>
              {canPostpone && <button onClick={onPostpone} style={ghostBtn(C("violet"))}>{t("w.home.rail.postpone")}</button>}
            </>)}
            {day.status === "skipped" && (
              <button onClick={onUnskip} style={{ ...ghostBtn(C("ash")), flex: 1 }}>{t("w.home.rail.undoSkip")}</button>
            )}
            {day.status === "postponed" && (<>
              <button onClick={() => onStart(day.blocks)} style={primaryBtn}>{t("w.home.rail.doItNow")}</button>
              <button onClick={onUnskip} style={ghostBtn(C("ash"))}>{t("w.home.rail.unpostpone")}</button>
            </>)}
            {day.status === "done" && (
              <button onClick={onHistory} style={{ ...ghostBtn(C("ash")), flex: 1 }}>{t("w.home.rail.viewHistory")}</button>
            )}
          </div>
        </>
      )}

      {/* Sessions postponed ONTO this date — a light catch-up list. */}
      {day.postponedIn.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C("line")}`, paddingTop: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--violet-text)", marginBottom: 9 }}>{t("w.home.rail.catchUp")}</div>
          {day.postponedIn.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: i ? 8 : 0 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{t("w.home.rail.movedFrom")} {fmtKey(it.fromDateKey)}</span>
              </span>
              <button onClick={() => onStart(it.blocks)} style={{ ...ghostBtn(C("violet")), flex: "0 0 auto", padding: "8px 14px" }}>{t("w.home.rail.doItNow")}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const primaryBtn: CSSProperties = { flex: 2, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "12px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, cursor: "pointer" };
function ghostBtn(color: string): CSSProperties {
  return { flex: 1, background: "transparent", border: `1px solid color-mix(in srgb, ${color} 45%, ${C("line")})`, color, borderRadius: 999, padding: "11px", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" };
}
