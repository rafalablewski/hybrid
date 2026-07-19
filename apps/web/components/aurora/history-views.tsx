"use client";

import { useMemo, useState } from "react";
import {
  fs,
  space,
  fmtTonnage,
  sessionVolume,
  sessionShape,
  sessionCardioTotals,
  sessionsByDay,
  historyStream,
  upcomingPlanDays,
  journalMonth,
  latestTrainingDayKey,
  weekChapters,
  blockChapters,
  blockSummary,
  HISTORY_VIEWS,
  WEEKDAY_LABEL_KEYS,
  localDayKey,
  localTodayKey,
  localMondayMs,
  addLocalDays,
  type HistoryViewId,
  type LoggedSession,
  type PlanScheduleResult,
  type WeightUnit,
  type BodyweightLookup,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";

// ── AURORA History views (web) ──────────────────────────────────────────────
// The five merged History × Calendar layouts (agenda / journal / weeks /
// timeline / blocks) behind the History screen's view switcher. All grouping
// math lives in @hybrid/core (engines/history-views.ts); these components only
// render. Chartreuse = lifting, teal = sport/cardio, shading = sRPE load — the
// same encoding as the month calendar. Mirrored on mobile
// (apps/mobile/components/aurora/history-views.tsx).

const C = (v: string) => `var(--color-${v})`;
const MONO = "var(--font-mono)";
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 22, boxShadow: "var(--shadow-card)", padding: 16 } as const;

const keyTs = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const fmtDayLong = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtDayShort = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export interface ViewCtx {
  sessions: LoggedSession[];
  units: WeightUnit;
  /** dated bodyweight lookup — passed into every engine call so aggregate
   *  tonnage (day chips, weekly totals) matches the bodyweight-aware
   *  per-session cards. */
  bw: BodyweightLookup;
  schedule: PlanScheduleResult | null;
  prs: (id: string) => number;
  onOpen: (id: string) => void;
}

const chip = (color: string, label: string, strong = false) => (
  <span style={{ background: `color-mix(in srgb, ${color} ${strong ? 16 : 13}%, transparent)`, color, borderRadius: 999, padding: "3px 10px", fontFamily: MONO, fontSize: fs.micro, fontWeight: strong ? 700 : 400, whiteSpace: "nowrap" }}>{label}</span>
);

/** The one-line key metric of a session: tonnage for lifting, distance–time for
 *  cardio; conditioning-only sessions (a match, a circuit) fall back to their
 *  summed minutes, then to the block count. One source of truth — the chip and
 *  the weeks-view row text both read from it (mirrors mobile's keyMetric). */
function keyMetric(s: LoggedSession, ctx: ViewCtx, t: (k: string) => string): { color: string; label: string } {
  if (sessionShape(s) === "cardio") {
    const ct = sessionCardioTotals(s.blocks);
    const parts = [ct.distanceKm > 0 ? `${ct.distanceKm.toFixed(1)} km` : null, ct.minutes ? `${ct.minutes} min` : null].filter(Boolean);
    if (parts.length) return { color: "var(--blue-text)", label: parts.join(" – ") };
    const minutes = s.blocks.reduce((sum, b) => sum + (b.kind !== "strength" ? (b.minutes ?? 0) : 0), 0);
    return { color: "var(--blue-text)", label: minutes > 0 ? `${minutes} min` : `${s.blocks.length} ${s.blocks.length === 1 ? t("w.analyze.hist.block") : t("w.analyze.hist.blocks")}` };
  }
  return { color: C("ash"), label: fmtTonnage(sessionVolumeOf(s, ctx), ctx.units) };
}
const keyChip = (s: LoggedSession, ctx: ViewCtx, t: (k: string) => string) => {
  const km = keyMetric(s, ctx, t);
  return chip(km.color, km.label);
};
const sessionVolumeOf = (s: LoggedSession, ctx: ViewCtx) => sessionVolume(s.blocks, false, ctx.bw(s.startedAt));

/** Compact tappable session card shared by agenda / timeline / journal. */
function SessionCard({ s, ctx, ghost, lines = 3 }: { s: LoggedSession; ctx: ViewCtx; ghost?: boolean; lines?: number }) {
  const { t } = useLang();
  const prs = ctx.prs(s.id);
  return (
    <div
      onClick={() => ctx.onOpen(s.id)}
      style={{ ...card, padding: 15, cursor: "pointer", ...(ghost ? { background: "transparent", boxShadow: "none", border: `1.5px dashed color-mix(in srgb, ${C("ash")} 38%, transparent)` } : {}) }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: fs.note, color: ghost ? C("ash") : C("chalk"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
        <span style={{ display: "flex", gap: 6, flex: "none" }}>
          {prs > 0 && chip("var(--lime-text)", `↑ ${prs} ${t("w.analyze.hist.pr")}`, true)}
          {keyChip(s, ctx, t)}
        </span>
      </div>
      {s.blocks.slice(0, lines).map((b, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: MONO, fontSize: fs.caption, marginTop: i === 0 ? 8 : 4 }}>
          <span style={{ color: ghost ? C("ash") : "color-mix(in srgb, var(--color-chalk) 74%, transparent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
          <span style={{ color: C("ash"), flex: "none" }}>{blockSummary(b)}</span>
        </div>
      ))}
      {s.blocks.length > lines && (
        <div style={{ fontFamily: MONO, fontSize: fs.micro, color: C("ash"), marginTop: 5 }}>+{s.blocks.length - lines} {t("w.analyze.hist.blocks")}</div>
      )}
    </div>
  );
}

/** Uppercase mono day label ("MON, JUL 13" — chartreuse for today). */
const DayLabel = ({ text, today }: { text: string; today?: boolean }) => (
  <span style={{ fontFamily: MONO, fontSize: fs.micro, letterSpacing: ".14em", textTransform: "uppercase", color: today ? "var(--lime-text)" : C("ash") }}>{text}</span>
);

/** Hairline rest-gap row ("3 REST DAYS ————"). */
function RestGapRow({ days }: { days: number }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 2px" }}>
      <span style={{ fontFamily: MONO, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: `color-mix(in srgb, ${C("ash")} 70%, transparent)` }}>
        {days} {days === 1 ? t("histview.restDay") : t("histview.restDays")}
      </span>
      <span style={{ flex: 1, height: 1, background: C("line") }} />
    </div>
  );
}

// ============================================================
//  Switcher
// ============================================================

export function ViewSwitcher({ view, onChange }: { view: HistoryViewId; onChange: (v: HistoryViewId) => void }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
      {HISTORY_VIEWS.map((v) => {
        const on = v.id === view;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            style={{ fontFamily: MONO, fontSize: fs.caption, whiteSpace: "nowrap", borderRadius: 999, padding: "6px 14px", cursor: "pointer", border: `1px solid ${on ? C("lime") : C("line")}`, color: on ? "var(--on-accent)" : C("ash"), background: on ? C("lime") : C("ink2"), fontWeight: on ? 700 : 400 }}
          >
            {t(v.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
//  1 — Agenda
// ============================================================

export function AgendaView({ ctx }: { ctx: ViewCtx }) {
  const { t } = useLang();
  const stream = useMemo(() => historyStream(ctx.sessions, { prs: ctx.prs, bw: ctx.bw }), [ctx.sessions, ctx.prs, ctx.bw]);
  const upcoming = useMemo(() => upcomingPlanDays(ctx.schedule, 2), [ctx.schedule]);
  const byDay = useMemo(() => sessionsByDay(ctx.sessions), [ctx.sessions]);

  // The pinned current week Mon–Sun with load dots.
  const week = useMemo(() => {
    const todayKey = localTodayKey();
    const monday = localMondayMs(Date.now());
    const max = Math.max(1, ...Object.values(byDay).map((d) => d.load));
    return Array.from({ length: 7 }, (_, i) => {
      const key = localDayKey(addLocalDays(monday, i));
      const load = byDay[key]?.load ?? 0;
      return { key, dayNum: Number(key.slice(8, 10)), isToday: key === todayKey, future: key > todayKey, dot: load <= 0 ? 0 : load / max > 0.5 ? 2 : 1 };
    });
  }, [byDay]);

  const todayHasGroup = stream.some((x) => x.kind === "day" && x.isToday);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {week.map((d, i) => (
          <div key={d.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "8px 0 9px", borderRadius: 14, background: C("ink2"), border: `1px solid ${d.isToday ? C("lime") : C("line")}`, boxShadow: d.isToday ? `0 0 12px color-mix(in srgb, ${C("lime")} 25%, transparent)` : "none" }}>
            <span style={{ fontFamily: MONO, fontSize: fs.nano, color: C("ash") }}>{t(WEEKDAY_LABEL_KEYS[i]!).slice(0, 1)}</span>
            <span style={{ fontFamily: MONO, fontSize: fs.body, fontWeight: 700, color: d.isToday ? "var(--lime-text)" : d.future ? C("ash") : C("chalk") }}>{d.dayNum}</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: d.dot === 2 ? C("lime") : d.dot === 1 ? `color-mix(in srgb, ${C("lime")} 45%, transparent)` : "transparent" }} />
          </div>
        ))}
      </div>

      {/* plan-day ghosts, furthest first so today's due session sits right above
          the stream; a due-today ghost replaces the "nothing today" row */}
      {[...upcoming].reverse().map((u) => (
        <div key={u.dateKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <DayLabel text={u.isToday ? `${t("w.analyze.cal.today")} – ${fmtDayLong(u.dateKey)}` : fmtDayLong(u.dateKey)} today={u.isToday} />
            {chip(u.isToday ? "var(--lime-text)" : C("ash"), t("histview.planned"))}
          </div>
          <div style={{ ...card, padding: 15, background: "transparent", boxShadow: "none", border: `1.5px dashed color-mix(in srgb, ${u.isToday ? C("lime") : C("ash")} 38%, transparent)` }}>
            <div style={{ fontWeight: 800, fontSize: fs.note, color: u.isToday ? C("chalk") : C("ash") }}>{u.planName} – {u.week != null ? `${t("histview.weekLbl")} ${u.week}, ${u.title}` : u.title}</div>
            {u.blockNames.length > 0 && (
              <div style={{ fontFamily: MONO, fontSize: fs.caption, color: C("ash"), marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.blockNames.slice(0, 3).join(" – ")}{u.blockNames.length > 3 ? ` +${u.blockNames.length - 3}` : ""}</div>
            )}
          </div>
        </div>
      ))}

      {!todayHasGroup && !upcoming.some((u) => u.isToday) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <DayLabel text={`${t("w.analyze.cal.today")} – ${fmtDayLong(localTodayKey())}`} today />
          <span style={{ fontFamily: MONO, fontSize: fs.micro, color: C("ash") }}>{t("w.analyze.cal.nothing")}</span>
        </div>
      )}

      {stream.map((item, i) =>
        item.kind === "gap" ? (
          <RestGapRow key={`g${i}`} days={item.days} />
        ) : (
          <div key={item.dateKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <DayLabel text={item.isToday ? `${t("w.analyze.cal.today")} – ${fmtDayLong(item.dateKey)}` : fmtDayLong(item.dateKey)} today={item.isToday} />
              <span style={{ display: "flex", gap: 6 }}>
                {item.prs > 0 && chip("var(--lime-text)", `↑ ${item.prs} ${t("w.analyze.hist.pr")}`, true)}
                {item.volume > 0 && chip(C("ash"), fmtTonnage(item.volume, ctx.units))}
              </span>
            </div>
            {item.sessions.map((s) => <SessionCard key={s.id} s={s} ctx={ctx} />)}
          </div>
        ),
      )}
    </div>
  );
}

// ============================================================
//  2 — Month journal
// ============================================================

export function JournalView({ ctx }: { ctx: ViewCtx }) {
  const { t } = useLang();
  const now = new Date();
  // Open on the latest training day's month so the default selection is
  // actually visible (last session may be in an earlier month than today).
  const [initKey] = useState(() => latestTrainingDayKey(ctx.sessions));
  const [year, setYear] = useState(() => Number(initKey.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(initKey.slice(5, 7)) - 1);
  const [selected, setSelected] = useState(initKey);
  const j = useMemo(() => journalMonth(ctx.sessions, year, month, { bw: ctx.bw, prs: ctx.prs }), [ctx.sessions, year, month, ctx.bw, ctx.prs]);
  const today = localTodayKey();
  const go = (d: number) => { const m = month + d; if (m < 0) { setMonth(11); setYear((y) => y - 1); } else if (m > 11) { setMonth(0); setYear((y) => y + 1); } else setMonth(m); };
  const selSessions = ctx.sessions.filter((s) => localDayKey(s.startedAt) === selected);
  const shade = ["transparent", `color-mix(in srgb, ${C("lime")} 7%, ${C("ink2")})`, `color-mix(in srgb, ${C("lime")} 11%, ${C("ink2")})`, `color-mix(in srgb, ${C("lime")} 16%, ${C("ink2")})`, `color-mix(in srgb, ${C("lime")} 24%, ${C("ink2")})`];
  const navBtn = { fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, minWidth: 34, height: 34, borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink"), color: C("chalk"), cursor: "pointer", padding: "0 12px" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 900, fontSize: fs.title }}>{fmtMonth(year, month)}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button aria-label={t("common.previous")} onClick={() => go(-1)} style={navBtn}>‹</button>
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(today); }} style={navBtn}>{t("w.analyze.cal.today")}</button>
            <button aria-label={t("common.next")} onClick={() => go(1)} style={navBtn}>›</button>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 4 }}>
          {WEEKDAY_LABEL_KEYS.map((k) => <span key={k} style={{ fontFamily: MONO, fontSize: fs.nano, textAlign: "center", textTransform: "uppercase", color: C("ash") }}>{t(k).slice(0, 1)}</span>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
          {j.matrix.flat().map((cell) => {
            const d = j.days[cell.date];
            const isSel = cell.date === selected;
            const isToday = cell.date === today;
            return (
              <button key={cell.date} onClick={() => setSelected(cell.date)} style={{ aspectRatio: ".84", borderRadius: 12, padding: "5px 4px 4px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", opacity: cell.inMonth ? 1 : 0.35, border: `1px solid ${isSel ? C("lime") : isToday ? `color-mix(in srgb, ${C("lime")} 40%, transparent)` : C("line")}`, background: d ? shade[d.level] : C("ink2"), boxShadow: isSel ? `0 0 14px color-mix(in srgb, ${C("lime")} 22%, transparent)` : "none" }}>
                {d?.pr && <span style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: "var(--lime-text)" }}>★</span>}
                <span style={{ fontFamily: MONO, fontSize: fs.micro, fontWeight: 600, color: isSel || isToday ? "var(--lime-text)" : C("chalk") }}>{Number(cell.date.slice(8, 10))}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2.5, width: "100%", padding: "0 4px", marginTop: "auto", marginBottom: 2 }}>
                  {(d?.ticks ?? []).slice(0, 3).map((tk, i) => (
                    <span key={i} style={{ height: 3.5, borderRadius: 2, background: tk === "cardio" ? C("blue") : C("lime") }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DayLabel text={fmtDayLong(selected)} today={selected === today} />
        {selSessions.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: fs.caption, color: C("ash") }}>{t("w.analyze.cal.nothing")}</div>
        ) : (
          selSessions.map((s) => <SessionCard key={s.id} s={s} ctx={ctx} lines={6} />)
        )}
      </div>
    </div>
  );
}

// ============================================================
//  3 — Week chapters
// ============================================================

export function WeeksView({ ctx }: { ctx: ViewCtx }) {
  const { t } = useLang();
  const weeks = useMemo(() => weekChapters(ctx.sessions, { bw: ctx.bw, prs: ctx.prs }), [ctx.sessions, ctx.bw, ctx.prs]);
  const maxLoad = Math.max(1, ...weeks.flatMap((w) => w.days.map((d) => d.load)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {weeks.map((w) => (
        <div key={w.startKey} style={{ ...card, border: `1px solid ${w.isCurrent ? `color-mix(in srgb, ${C("lime")} 30%, ${C("line")})` : C("line")}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontWeight: 900, fontSize: fs.note }}>{fmtDayShort(w.startKey)} – {fmtDayShort(w.endKey)}</span>
            {w.isCurrent && <span style={{ fontFamily: MONO, fontSize: fs.nano, color: "var(--lime-text)", letterSpacing: ".14em", textTransform: "uppercase" }}>{t("histview.thisWeek")}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 34, margin: "12px 0 4px" }}>
            {w.days.map((d) => {
              const h = d.load <= 0 ? 3 : Math.max(6, Math.round((d.load / maxLoad) * 34));
              return <span key={d.dateKey} style={{ flex: 1, height: h, borderRadius: "3px 3px 0 0", background: d.load <= 0 ? `color-mix(in srgb, ${C("ash")} 18%, transparent)` : d.hasCardio && !d.hasStrength ? C("blue") : C("lime") }} />;
            })}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {WEEKDAY_LABEL_KEYS.map((k) => <span key={k} style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 8, color: C("ash") }}>{t(k).slice(0, 1)}</span>)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 4px" }}>
            {w.totals.volume > 0 && chip("var(--lime-text)", fmtTonnage(w.totals.volume, ctx.units))}
            {chip(C("ash"), `${w.totals.sessions} ${t("histview.sessionsLbl")}`)}
            {w.totals.prs > 0 && chip("var(--lime-text)", `↑ ${w.totals.prs} ${t("w.analyze.hist.pr")}`, true)}
          </div>
          {w.sessions.map((s) => {
            const key = localDayKey(s.startedAt);
            return (
              <div key={s.id} onClick={() => ctx.onOpen(s.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 2px", borderTop: `1px solid ${C("line")}`, cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontSize: fs.nano, color: C("ash"), width: 32, flex: "none", textAlign: "center", lineHeight: 1.25, textTransform: "uppercase" }}>
                  {new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}<br />
                  <span style={{ fontSize: fs.body, color: C("chalk"), fontWeight: 700 }}>{Number(key.slice(8, 10))}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: fs.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                  <span style={{ display: "block", fontFamily: MONO, fontSize: fs.micro, color: C("ash"), marginTop: 1 }}>
                    {keyMetric(s, ctx, t).label} – {s.blocks.length} {s.blocks.length === 1 ? t("w.analyze.hist.block") : t("w.analyze.hist.blocks")}
                  </span>
                </span>
                <span style={{ fontFamily: MONO, color: C("ash") }}>›</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ============================================================
//  4 — Timeline rail
// ============================================================

export function TimelineView({ ctx }: { ctx: ViewCtx }) {
  const { t } = useLang();
  const stream = useMemo(() => historyStream(ctx.sessions, { prs: ctx.prs, bw: ctx.bw }), [ctx.sessions, ctx.prs, ctx.bw]);

  return (
    <div style={{ position: "relative", paddingLeft: 56 }}>
      <div style={{ position: "absolute", left: 24, top: 6, bottom: 0, width: 2, background: `linear-gradient(${C("lime")} 0, ${C("line")} 90px)` }} />
      {stream.map((item, i) =>
        item.kind === "gap" ? (
          <div key={`g${i}`} style={{ position: "relative", height: 34, marginBottom: 6 }}>
            <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontFamily: MONO, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}>
              {item.days} {item.days === 1 ? t("histview.restDay") : t("histview.restDays")}
            </span>
          </div>
        ) : (
          <div key={item.dateKey} style={{ position: "relative", marginBottom: 18 }}>
            <div style={{ position: "absolute", left: -56, top: 0, width: 48, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: item.level >= 3 ? 13 : 10, height: item.level >= 3 ? 13 : 10, borderRadius: "50%", background: item.shape === "cardio" ? C("blue") : C("lime"), border: `3px solid ${C("ink")}`, outline: `2px solid ${item.shape === "cardio" ? C("blue") : item.level >= 3 ? C("lime") : `color-mix(in srgb, ${C("lime")} 55%, transparent)`}`, marginBottom: 5, boxSizing: "content-box" }} />
              <span style={{ fontFamily: MONO, fontSize: fs.nano, color: C("ash"), textAlign: "center", lineHeight: 1.3, textTransform: "uppercase" }}>
                {new Date(keyTs(item.dateKey)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}<br />
                <span style={{ fontSize: fs.body, color: item.isToday ? "var(--lime-text)" : C("chalk"), fontWeight: 700 }}>{Number(item.dateKey.slice(8, 10))}</span>
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {item.sessions.map((s) => <SessionCard key={s.id} s={s} ctx={ctx} lines={2} />)}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

// ============================================================
//  5 — Block chapters
// ============================================================

export function BlocksView({ ctx }: { ctx: ViewCtx }) {
  const { t } = useLang();
  const chapters = useMemo(() => blockChapters(ctx.sessions, { schedule: ctx.schedule }), [ctx.sessions, ctx.schedule]);

  const statusLabel: Record<string, string> = {
    done: t("w.home.rail.done"),
    missed: t("w.home.rail.missed"),
    skipped: t("w.home.rail.skipped"),
    postponed: t("w.home.rail.postponed"),
    today: t("w.analyze.cal.today"),
    upcoming: t("w.home.rail.upcoming"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {chapters.map((ch, ci) => {
        const accent = ch.kind === "free" ? C("blue") : C("lime");
        const frac = ch.total > 0 ? ch.done / ch.total : 0;
        return (
          <div key={ci} style={{ ...card, position: "relative", overflow: "hidden", padding: 18 }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ width: 54, height: 54, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", position: "relative", background: `conic-gradient(${accent} 0 ${Math.round(frac * 360)}deg, ${C("line")} ${Math.round(frac * 360)}deg 360deg)` }}>
                <span style={{ position: "absolute", inset: 5, borderRadius: "50%", background: C("ink2") }} />
                <span style={{ position: "relative", fontFamily: MONO, fontSize: fs.caption, fontWeight: 700, color: ch.kind === "free" ? "var(--blue-text)" : "var(--lime-text)" }}>{ch.kind === "free" ? ch.done : `${ch.done}/${ch.total}`}</span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 900, fontSize: fs.note, lineHeight: 1.25 }}>{ch.planName ?? t("histview.freestyle")}</span>
                <span style={{ display: "block", fontFamily: MONO, fontSize: fs.nano, color: C("ash"), marginTop: 3, letterSpacing: ".06em", textTransform: "uppercase" }}>
                  {ch.kind === "free"
                    ? t("histview.outsidePlan")
                    : `${t("histview.weekLbl")} ${ch.week}${ch.complete ? ` — ${t("histview.completeLbl")}` : ""}`}
                </span>
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              {ch.rows.map((r) => {
                const done = r.status === "done";
                const openable = !!r.sessionId;
                return (
                  <div key={r.key} onClick={openable ? () => ctx.onOpen(r.sessionId!) : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", borderTop: `1px solid ${C("line")}`, cursor: openable ? "pointer" : "default" }}>
                    <span style={{ width: 19, height: 19, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 10, background: done ? `color-mix(in srgb, ${accent} 18%, transparent)` : "transparent", color: done ? (ch.kind === "free" ? "var(--blue-text)" : "var(--lime-text)") : "transparent", border: done ? "none" : `1.5px dashed color-mix(in srgb, ${C("ash")} 50%, transparent)` }}>✓</span>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: done ? 600 : 500, fontSize: fs.body, color: done ? C("chalk") : C("ash"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: fs.nano, color: r.status === "missed" ? "var(--red-text)" : C("ash"), textTransform: "uppercase", flex: "none" }}>
                      {r.dateKey ? fmtDayShort(r.dateKey) : ""}{!done ? ` – ${statusLabel[r.status] ?? r.status}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
