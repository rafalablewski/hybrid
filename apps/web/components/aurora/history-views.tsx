"use client";

import { useMemo, useState } from "react";
import {
  fs,
  space,
  fmtTonnage,
  sessionHeadline,
  sessionsByDay,
  historyStream,
  upcomingPlanDays,
  weekChapters,
  sessionBuckets,
  weeklyRecap,
  HISTORY_VIEWS,
  WEEKDAY_LABEL_KEYS,
  localDayKey,
  localTodayKey,
  localMondayMs,
  addLocalDays,
  type HistoryViewId,
  type LoggedSession,
  type PlanScheduleResult,
  type SessionHeadline,
  type WeightUnit,
  type BodyweightLookup,
  type StatRange,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";

// ── AURORA History views (web) ──────────────────────────────────────────────
// The four merged History × Calendar layouts (agenda / weeks / timeline / trend)
// behind the History screen's view switcher. All grouping math lives in
// @hybrid/core (engines/history-views.ts); these components only render.
// Session cards use the "headline number" treatment: one large figure
// (sessionHeadline), one mono meta line — each fact stated exactly once.
// Chartreuse = lifting, teal = sport/cardio, shading = sRPE load — the same
// encoding as the month calendar. Mirrored on mobile
// (apps/mobile/components/aurora/history-views.tsx).

const C = (v: string) => `var(--color-${v})`;
const MONO = "var(--font-mono)";
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 16 } as const;

const keyTs = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const fmtDayLong = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtDayShort = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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

/** The headline's unit label — localized block count for the last-resort kind. */
const unitOf = (h: SessionHeadline, t: (k: string) => string) =>
  h.kind === "blocks" ? t(h.value === "1" ? "w.analyze.hist.block" : "w.analyze.hist.blocks") : h.unit;

/** The mono meta parts that follow the title: lift count, summed minutes
 *  (unless minutes IS the headline), then pace — each fact exactly once. */
function headlineMeta(h: SessionHeadline, t: (k: string) => string): string[] {
  const parts: string[] = [];
  if (h.lifts > 0) parts.push(`${h.lifts} ${t(h.lifts === 1 ? "histview.liftLbl" : "histview.liftsLbl")}`);
  if (h.minutes > 0 && h.kind !== "minutes") parts.push(`${h.minutes} min`);
  if (h.pace) parts.push(h.pace);
  return parts;
}

/** Tappable session card shared by agenda / timeline — the "headline number"
 *  treatment: one large figure (tonnage / distance / minutes), then a single
 *  mono meta line (title – lifts – minutes – pace – PRs). Sets, splits and the
 *  full block list live on the session page, one tap deep. Mirrors mobile. */
function SessionCard({ s, ctx }: { s: LoggedSession; ctx: ViewCtx }) {
  const { t } = useLang();
  const prs = ctx.prs(s.id);
  const h = sessionHeadline(s, ctx.units, ctx.bw(s.startedAt));
  return (
    <div onClick={() => ctx.onOpen(s.id)} style={{ ...card, padding: 16, cursor: "pointer" }}>
      <div style={{ fontFamily: MONO, fontSize: fs.display, letterSpacing: "-.02em", lineHeight: 1.1, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
        {h.value}
        <span style={{ fontSize: fs.bodyLg, letterSpacing: 0, color: C("ash") }}> {unitOf(h, t)}</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: fs.micro, color: C("ash"), marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {[s.title, ...headlineMeta(h, t)].join(" – ")}
        {prs > 0 && (
          <>
            {" – "}
            <span style={{ color: "var(--lime-text)" }}>↑ {prs} {t("w.analyze.hist.pr")}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Uppercase mono day label ("MON, JUL 13" — chartreuse for today). */
const DayLabel = ({ text, today }: { text: string; today?: boolean }) => (
  <span style={{ fontFamily: MONO, fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", color: today ? "var(--lime-text)" : C("ash") }}>{text}</span>
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
    // Full-bleed chip rail — clips at the screen edge, rests on the column.
    <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", padding: "0 var(--page-pad-x, 16px) 4px", margin: "0 calc(-1 * var(--page-pad-x, 16px))" }}>
      {HISTORY_VIEWS.map((v) => {
        const on = v.id === view;
        return (
          <button className="pressable"
            key={v.id}
            onClick={() => onChange(v.id)}
            style={{ fontFamily: MONO, fontSize: fs.caption, whiteSpace: "nowrap", borderRadius: 999, padding: "6px 16px", cursor: "pointer", border: `1px solid ${on ? C("lime") : C("line")}`, color: on ? "var(--on-accent)" : C("ash"), background: on ? C("lime") : C("ink2"), fontWeight: on ? 700 : 400 }}
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
          <div key={d.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "8px 0 8px", borderRadius: 16, background: C("ink2"), border: `1px solid ${d.isToday ? C("lime") : C("line")}`, boxShadow: d.isToday ? `0 0 12px color-mix(in srgb, ${C("lime")} 25%, transparent)` : "none" }}>
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
          <div style={{ ...card, padding: 16, background: "transparent", boxShadow: "none", border: `1.5px dashed color-mix(in srgb, ${u.isToday ? C("lime") : C("ash")} 38%, transparent)` }}>
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
            {/* the cards lead with their own figures now — a day-level tonnage/PR
                chip here would restate them (say it once). */}
            <DayLabel text={item.isToday ? `${t("w.analyze.cal.today")} – ${fmtDayLong(item.dateKey)}` : fmtDayLong(item.dateKey)} today={item.isToday} />
            {item.sessions.map((s) => <SessionCard key={s.id} s={s} ctx={ctx} />)}
          </div>
        ),
      )}
    </div>
  );
}

// ============================================================
//  2 — Week chapters
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
            {w.isCurrent && <span style={{ fontFamily: MONO, fontSize: fs.nano, color: "var(--lime-text)", letterSpacing: ".12em", textTransform: "uppercase" }}>{t("histview.thisWeek")}</span>}
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
            const h = sessionHeadline(s, ctx.units, ctx.bw(s.startedAt));
            return (
              <div key={s.id} onClick={() => ctx.onOpen(s.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderTop: `1px solid ${C("line")}`, cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontSize: fs.nano, color: C("ash"), width: 32, flex: "none", textAlign: "center", lineHeight: 1.25, textTransform: "uppercase" }}>
                  {new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}<br />
                  <span style={{ fontSize: fs.body, color: C("chalk"), fontWeight: 700 }}>{Number(key.slice(8, 10))}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: fs.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                  <span style={{ display: "block", fontFamily: MONO, fontSize: fs.micro, color: C("ash"), marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[`${h.value} ${unitOf(h, t)}`, ...headlineMeta(h, t)].join(" – ")}
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
//  3 — Timeline rail
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
          <div key={item.dateKey} style={{ position: "relative", marginBottom: 16 }}>
            <div style={{ position: "absolute", left: -56, top: 0, width: 48, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: item.level >= 3 ? 13 : 10, height: item.level >= 3 ? 13 : 10, borderRadius: "50%", background: item.shape === "cardio" ? C("blue") : C("lime"), border: `3px solid ${C("ink")}`, outline: `2px solid ${item.shape === "cardio" ? C("blue") : item.level >= 3 ? C("lime") : `color-mix(in srgb, ${C("lime")} 55%, transparent)`}`, marginBottom: 5, boxSizing: "content-box" }} />
              <span style={{ fontFamily: MONO, fontSize: fs.nano, color: C("ash"), textAlign: "center", lineHeight: 1.3, textTransform: "uppercase" }}>
                {new Date(keyTs(item.dateKey)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}<br />
                <span style={{ fontSize: fs.body, color: item.isToday ? "var(--lime-text)" : C("chalk"), fontWeight: 700 }}>{Number(item.dateKey.slice(8, 10))}</span>
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {item.sessions.map((s) => <SessionCard key={s.id} s={s} ctx={ctx} />)}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

// ── TREND ────────────────────────────────────────────────────────────────────
// The retired Statistics screen, folded in as History's fourth view. History
// already owned "everything past this week"; a separate destination charting
// the same sessions at a coarser grain was the same screen twice, so its range
// toggle, session-count chart and window totals live here now. Same engines
// (sessionBuckets / weeklyRecap), so no number changed on the way over.

const TREND_RANGES: { id: StatRange; key: string }[] = [
  { id: "week", key: "w.analyze.stats.week" },
  { id: "month", key: "w.analyze.stats.month" },
  { id: "year", key: "w.analyze.stats.year" },
];

export function TrendView({ ctx }: { ctx: ViewCtx }) {
  const { t } = useLang();
  const [range, setRange] = useState<StatRange>("week");
  const buckets = useMemo(() => sessionBuckets(ctx.sessions, range), [ctx.sessions, range]);
  const recap = useMemo(() => weeklyRecap(ctx.sessions, Date.now(), ctx.bw), [ctx.sessions, ctx.bw]);
  const hasData = ctx.sessions.length > 0;
  const maxVal = Math.max(1, ...buckets.buckets.map((b) => b.value));

  const mini = (label: string, value: string) => (
    <div style={{ ...card, flex: 1, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{label}</div>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: fs.heading, letterSpacing: "-.02em", marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 3 }}>
        {TREND_RANGES.map((rg) => {
          const on = range === rg.id;
          return (
            <button className="pressable"
              key={rg.id}
              onClick={() => setRange(rg.id)}
              aria-pressed={on}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer",
                fontFamily: MONO, fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase",
                background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash"),
              }}
            >
              {t(rg.key)}
            </button>
          );
        })}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle }}>{t("w.analyze.stats.sessions")}</span>
          <span style={{ fontFamily: MONO, fontSize: fs.micro, color: C("ash") }}>{buckets.total} {t("w.analyze.stats.inRange")} {t(TREND_RANGES.find((r) => r.id === range)!.key).toLowerCase()}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 118, marginTop: 16, gap: 6 }}>
          {buckets.buckets.map((b, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: space.xs }}>
              <div style={{ width: "100%", height: Math.max(4, (b.value / maxVal) * 92), borderRadius: 5, background: i === buckets.peakIndex ? C("lime") : C("line") }} />
              <span style={{ fontFamily: MONO, fontSize: 9, color: C("ash") }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {mini(t("w.analyze.stats.activeDays"), hasData ? String(buckets.activeDays) : "—")}
        {mini(t("w.analyze.stats.distance"), hasData ? `${recap.distanceKm.toFixed(1)} km` : "—")}
        {mini(t("w.analyze.stats.minutes"), hasData ? String(Math.round(recap.minutes)) : "—")}
      </div>

      {!hasData && (
        <p style={{ fontSize: fs.body, color: C("ash"), textAlign: "center", margin: "6px 0 0", lineHeight: 1.5 }}>{t("w.analyze.stats.empty")}</p>
      )}
    </div>
  );
}
