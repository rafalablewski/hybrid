import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import {
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
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { RADIUS, Ring, withAlpha } from "./kit";

// ── AURORA History views (mobile) ───────────────────────────────────────────
// The five merged History × Calendar layouts (agenda / journal / weeks /
// timeline / blocks) behind the History screen's view switcher — parity with
// apps/web/components/aurora/history-views.tsx. All grouping math lives in
// @hybrid/core (engines/history-views.ts); these components only render.
// Chartreuse = lifting, teal = sport/cardio, shading = sRPE load.

const keyTs = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const fmtDayLong = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtDayShort = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtWeekday = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const fmtMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export interface ViewCtx {
  sessions: LoggedSession[];
  units: WeightUnit;
  /** dated bodyweight lookup — passed into every engine call so aggregate
   *  tonnage matches the bodyweight-aware per-session cards. */
  bw: BodyweightLookup;
  schedule: PlanScheduleResult | null;
  prs: (id: string) => number;
  onOpen: (id: string) => void;
}

const sessionVolumeOf = (s: LoggedSession, ctx: ViewCtx) => sessionVolume(s.blocks, false, ctx.bw(s.startedAt));

function Chip({ C, color, label, strong }: { C: Palette; color: string; label: string; strong?: boolean }) {
  return (
    <View style={{ backgroundColor: withAlpha(color, strong ? 0.16 : 0.13), borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color), fontWeight: strong ? "700" : "400" }}>{label}</Text>
    </View>
  );
}

/** The one-line key metric of a session: tonnage for lifting, distance–time for
 *  cardio; conditioning-only sessions (a match, a circuit) fall back to their
 *  summed minutes, then to the block count. */
function keyMetric(s: LoggedSession, ctx: ViewCtx, t: (k: string) => string): { color: "blue" | "ash"; label: string } {
  if (sessionShape(s) === "cardio") {
    const ct = sessionCardioTotals(s.blocks);
    const parts = [ct.distanceKm > 0 ? `${ct.distanceKm.toFixed(1)} km` : null, ct.minutes ? `${ct.minutes} min` : null].filter(Boolean);
    if (parts.length) return { color: "blue", label: parts.join(" – ") };
    const minutes = s.blocks.reduce((sum, b) => sum + (b.kind !== "strength" ? (b.minutes ?? 0) : 0), 0);
    return { color: "blue", label: minutes > 0 ? `${minutes} min` : `${s.blocks.length} ${s.blocks.length === 1 ? t("history.block") : t("history.blocks")}` };
  }
  return { color: "ash", label: fmtTonnage(sessionVolumeOf(s, ctx), ctx.units) };
}

/** Compact tappable session card shared by agenda / timeline / journal. */
function SessionCard({ C, s, ctx, ghost, lines = 3 }: { C: Palette; s: LoggedSession; ctx: ViewCtx; ghost?: boolean; lines?: number }) {
  const { t } = useLang();
  const prs = ctx.prs(s.id);
  const km = keyMetric(s, ctx, t);
  return (
    <Pressable
      onPress={() => ctx.onOpen(s.id)}
      style={{
        borderRadius: 22,
        padding: 15,
        backgroundColor: ghost ? "transparent" : C.ink2,
        borderWidth: ghost ? 1.5 : 1,
        borderStyle: ghost ? "dashed" : "solid",
        borderColor: ghost ? withAlpha(C.ash, 0.38) : C.line,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.note, color: ghost ? C.ash : C.chalk }}>{s.title}</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {prs > 0 && <Chip C={C} color={C.lime} label={`↑ ${prs} PR`} strong />}
          <Chip C={C} color={km.color === "blue" ? C.blue : C.ash} label={km.label} />
        </View>
      </View>
      {s.blocks.slice(0, lines).map((b, i) => (
        <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: i === 0 ? 8 : 4 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: ghost ? C.ash : withAlpha(C.chalk, 0.74) }}>{b.name}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{blockSummary(b)}</Text>
        </View>
      ))}
      {s.blocks.length > lines && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 5 }}>+{s.blocks.length - lines} {t("history.blocks")}</Text>
      )}
    </Pressable>
  );
}

function DayLabel({ C, text, today }: { C: Palette; text: string; today?: boolean }) {
  return <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: today ? (txt(C, C.lime) as string) : C.ash }}>{text}</Text>;
}

function RestGapRow({ C, days }: { C: Palette; days: number }) {
  const { t } = useLang();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: withAlpha(C.ash, 0.7) }}>
        {days} {days === 1 ? t("histview.restDay") : t("histview.restDays")}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    </View>
  );
}

// ============================================================
//  Switcher
// ============================================================

export function ViewSwitcher({ view, onChange }: { view: HistoryViewId; onChange: (v: HistoryViewId) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 7, paddingBottom: 4 }}>
      {HISTORY_VIEWS.map((v) => {
        const on = v.id === view;
        return (
          <Pressable key={v.id} onPress={() => onChange(v.id)} style={{ borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : C.ink2 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? C.onAccent : C.ash, fontWeight: on ? "700" : "400" }}>{t(v.labelKey)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ============================================================
//  1 — Agenda
// ============================================================

export function AgendaView({ ctx }: { ctx: ViewCtx }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const stream = useMemo(() => historyStream(ctx.sessions, { prs: ctx.prs, bw: ctx.bw }), [ctx.sessions, ctx.prs, ctx.bw]);
  const upcoming = useMemo(() => upcomingPlanDays(ctx.schedule, 2), [ctx.schedule]);
  const byDay = useMemo(() => sessionsByDay(ctx.sessions), [ctx.sessions]);
  const lime = txt(C, C.lime) as string;

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
    <View style={{ gap: 12, marginTop: 12 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {week.map((d, i) => (
          <View key={d.key} style={{ flex: 1, alignItems: "center", gap: 5, paddingTop: 8, paddingBottom: 9, borderRadius: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: d.isToday ? C.lime : C.line }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(WEEKDAY_LABEL_KEYS[i]!).slice(0, 1)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, fontWeight: "700", color: d.isToday ? lime : d.future ? C.ash : C.chalk }}>{d.dayNum}</Text>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: d.dot === 2 ? C.lime : d.dot === 1 ? withAlpha(C.lime, 0.45) : "transparent" }} />
          </View>
        ))}
      </View>

      {/* plan-day ghosts, furthest first so today's due session sits right above
          the stream; a due-today ghost replaces the "nothing today" row */}
      {[...upcoming].reverse().map((u) => (
        <View key={u.dateKey} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <DayLabel C={C} text={u.isToday ? `${t("w.analyze.cal.today")} – ${fmtDayLong(u.dateKey)}` : fmtDayLong(u.dateKey)} today={u.isToday} />
            <Chip C={C} color={u.isToday ? C.lime : C.ash} label={t("histview.planned")} />
          </View>
          <View style={{ borderRadius: 22, padding: 15, borderWidth: 1.5, borderStyle: "dashed", borderColor: withAlpha(u.isToday ? C.lime : C.ash, 0.38) }}>
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: u.isToday ? C.chalk : C.ash }}>{u.planName} – {u.week != null ? `${t("histview.weekLbl")} ${u.week}, ${u.title}` : u.title}</Text>
            {u.blockNames.length > 0 && (
              <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6 }}>
                {u.blockNames.slice(0, 3).join(" – ")}{u.blockNames.length > 3 ? ` +${u.blockNames.length - 3}` : ""}
              </Text>
            )}
          </View>
        </View>
      ))}

      {!todayHasGroup && !upcoming.some((u) => u.isToday) && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <DayLabel C={C} text={`${t("w.analyze.cal.today")} – ${fmtDayLong(localTodayKey())}`} today />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.analyze.cal.nothing")}</Text>
        </View>
      )}

      {stream.map((item, i) =>
        item.kind === "gap" ? (
          <RestGapRow key={`g${i}`} C={C} days={item.days} />
        ) : (
          <View key={item.dateKey} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <DayLabel C={C} text={item.isToday ? `${t("w.analyze.cal.today")} – ${fmtDayLong(item.dateKey)}` : fmtDayLong(item.dateKey)} today={item.isToday} />
              <View style={{ flexDirection: "row", gap: 6 }}>
                {item.prs > 0 && <Chip C={C} color={C.lime} label={`↑ ${item.prs} PR`} strong />}
                {item.volume > 0 && <Chip C={C} color={C.ash} label={fmtTonnage(item.volume, ctx.units)} />}
              </View>
            </View>
            {item.sessions.map((s) => <SessionCard key={s.id} C={C} s={s} ctx={ctx} />)}
          </View>
        ),
      )}
    </View>
  );
}

// ============================================================
//  2 — Month journal
// ============================================================

export function JournalView({ ctx }: { ctx: ViewCtx }) {
  const { palette: C } = useTheme();
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
  const lime = txt(C, C.lime) as string;
  const go = (d: number) => { const m = month + d; if (m < 0) { setMonth(11); setYear((y) => y - 1); } else if (m > 11) { setMonth(0); setYear((y) => y + 1); } else setMonth(m); };
  const selSessions = ctx.sessions.filter((s) => localDayKey(s.startedAt) === selected);
  const shadeAlpha = [0, 0.07, 0.11, 0.16, 0.24];
  const navBtn = { minWidth: 34, height: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink, alignItems: "center" as const, justifyContent: "center" as const };

  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{fmtMonth(year, month)}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.previousMonth")} onPress={() => go(-1)} style={navBtn}><Text style={{ fontFamily: F.bold, color: C.chalk }}>‹</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(today); }} style={navBtn}><Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{t("w.analyze.cal.today")}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.nextMonth")} onPress={() => go(1)} style={navBtn}><Text style={{ fontFamily: F.bold, color: C.chalk }}>›</Text></Pressable>
          </View>
        </View>
        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          {WEEKDAY_LABEL_KEYS.map((k) => <Text key={k} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(k).slice(0, 1)}</Text>)}
        </View>
        {j.matrix.map((week, wi) => (
          <View key={wi} style={{ flexDirection: "row" }}>
            {week.map((cell) => {
              const d = j.days[cell.date];
              const isSel = cell.date === selected;
              const isToday = cell.date === today;
              return (
                <Pressable key={cell.date} onPress={() => setSelected(cell.date)} style={{ flex: 1, aspectRatio: 0.84, margin: 2, borderRadius: 12, paddingTop: 5, alignItems: "center", opacity: cell.inMonth ? 1 : 0.35, borderWidth: 1, borderColor: isSel ? C.lime : isToday ? withAlpha(C.lime, 0.4) : C.line, backgroundColor: d ? withAlpha(C.lime, shadeAlpha[d.level]!) : C.ink }}>
                  {d?.pr && <Text style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: lime }}>★</Text>}
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "600", color: isSel || isToday ? lime : C.chalk }}>{Number(cell.date.slice(8, 10))}</Text>
                  <View style={{ gap: 2.5, width: "100%", paddingHorizontal: 5, marginTop: "auto", marginBottom: 3 }}>
                    {(d?.ticks ?? []).slice(0, 3).map((tk, i) => (
                      <View key={i} style={{ height: 3.5, borderRadius: 2, backgroundColor: tk === "cardio" ? C.blue : C.lime }} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <DayLabel C={C} text={fmtDayLong(selected)} today={selected === today} />
        {selSessions.length === 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.cal.nothing")}</Text>
        ) : (
          selSessions.map((s) => <SessionCard key={s.id} C={C} s={s} ctx={ctx} lines={6} />)
        )}
      </View>
    </View>
  );
}

// ============================================================
//  3 — Week chapters
// ============================================================

export function WeeksView({ ctx }: { ctx: ViewCtx }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const weeks = useMemo(() => weekChapters(ctx.sessions, { bw: ctx.bw, prs: ctx.prs }), [ctx.sessions, ctx.bw, ctx.prs]);
  const maxLoad = Math.max(1, ...weeks.flatMap((w) => w.days.map((d) => d.load)));
  const lime = txt(C, C.lime) as string;

  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      {weeks.map((w) => (
        <View key={w.startKey} style={{ backgroundColor: C.ink2, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: w.isCurrent ? withAlpha(C.lime, 0.3) : C.line }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.chalk }}>{fmtDayShort(w.startKey)} – {fmtDayShort(w.endKey)}</Text>
            {w.isCurrent && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: lime, letterSpacing: 1.4, textTransform: "uppercase" }}>{t("histview.thisWeek")}</Text>}
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, height: 34, marginTop: 12, marginBottom: 4 }}>
            {w.days.map((d) => {
              const h = d.load <= 0 ? 3 : Math.max(6, Math.round((d.load / maxLoad) * 34));
              return <View key={d.dateKey} style={{ flex: 1, height: h, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: d.load <= 0 ? withAlpha(C.ash, 0.18) : d.hasCardio && !d.hasStrength ? C.blue : C.lime }} />;
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {WEEKDAY_LABEL_KEYS.map((k) => <Text key={k} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 8, color: C.ash }}>{t(k).slice(0, 1)}</Text>)}
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12, marginBottom: 4 }}>
            {w.totals.volume > 0 && <Chip C={C} color={C.lime} label={fmtTonnage(w.totals.volume, ctx.units)} />}
            <Chip C={C} color={C.ash} label={`${w.totals.sessions} ${t("histview.sessionsLbl")}`} />
            {w.totals.prs > 0 && <Chip C={C} color={C.lime} label={`↑ ${w.totals.prs} PR`} strong />}
          </View>
          {w.sessions.map((s) => {
            const key = localDayKey(s.startedAt);
            const km = keyMetric(s, ctx, t);
            return (
              <Pressable key={s.id} onPress={() => ctx.onOpen(s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                <View style={{ width: 32, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase" }}>{fmtWeekday(key)}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, fontWeight: "700" }}>{Number(key.slice(8, 10))}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{s.title}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 1 }}>
                    {km.label} – {s.blocks.length} {s.blocks.length === 1 ? t("history.block") : t("history.blocks")}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.mono, color: C.ash }}>›</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ============================================================
//  4 — Timeline rail
// ============================================================

export function TimelineView({ ctx }: { ctx: ViewCtx }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const stream = useMemo(() => historyStream(ctx.sessions, { prs: ctx.prs, bw: ctx.bw }), [ctx.sessions, ctx.prs, ctx.bw]);
  const lime = txt(C, C.lime) as string;

  return (
    <View style={{ paddingLeft: 56, marginTop: 12 }}>
      <View style={{ position: "absolute", left: 24, top: 6, bottom: 0, width: 2, backgroundColor: C.line }} />
      {stream.map((item, i) =>
        item.kind === "gap" ? (
          <View key={`g${i}`} style={{ height: 34, marginBottom: 6, justifyContent: "center" }}>
            <Text style={{ position: "absolute", left: 0, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: withAlpha(C.ash, 0.55) }}>
              {item.days} {item.days === 1 ? t("histview.restDay") : t("histview.restDays")}
            </Text>
          </View>
        ) : (
          <View key={item.dateKey} style={{ marginBottom: 18 }}>
            <View style={{ position: "absolute", left: -56, top: 0, width: 48, alignItems: "center" }}>
              <View style={{ width: item.level >= 3 ? 13 : 10, height: item.level >= 3 ? 13 : 10, borderRadius: 7, backgroundColor: item.shape === "cardio" ? C.blue : C.lime, borderWidth: 3, borderColor: C.ink, marginBottom: 5 }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "center", textTransform: "uppercase" }}>{fmtWeekday(item.dateKey)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: item.isToday ? lime : C.chalk, fontWeight: "700" }}>{Number(item.dateKey.slice(8, 10))}</Text>
            </View>
            <View style={{ gap: 8 }}>
              {item.sessions.map((s) => <SessionCard key={s.id} C={C} s={s} ctx={ctx} lines={2} />)}
            </View>
          </View>
        ),
      )}
    </View>
  );
}

// ============================================================
//  5 — Block chapters
// ============================================================

export function BlocksView({ ctx }: { ctx: ViewCtx }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const chapters = useMemo(() => blockChapters(ctx.sessions, { schedule: ctx.schedule }), [ctx.sessions, ctx.schedule]);
  const lime = txt(C, C.lime) as string;
  const blue = txt(C, C.blue) as string;

  const statusLabel: Record<string, string> = {
    done: t("w.home.rail.done"),
    missed: t("w.home.rail.missed"),
    skipped: t("w.home.rail.skipped"),
    postponed: t("w.home.rail.postponed"),
    today: t("w.analyze.cal.today"),
    upcoming: t("w.home.rail.upcoming"),
  };

  return (
    <View style={{ gap: 14, marginTop: 12 }}>
      {chapters.map((ch, ci) => {
        const accent = ch.kind === "free" ? C.blue : C.lime;
        const accentText = ch.kind === "free" ? blue : lime;
        const pct = ch.total > 0 ? (ch.done / ch.total) * 100 : 0;
        return (
          <View key={ci} style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 18, overflow: "hidden" }}>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />
            <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
              <Ring value={pct} size={54} color={accent} track={C.line}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: accentText }}>{ch.kind === "free" ? ch.done : `${ch.done}/${ch.total}`}</Text>
              </Ring>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontFamily: F.black, fontSize: fs.note, color: C.chalk, lineHeight: 19 }}>{ch.planName ?? t("histview.freestyle")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3, letterSpacing: 0.6, textTransform: "uppercase" }}>
                  {ch.kind === "free"
                    ? t("histview.outsidePlan")
                    : `${t("histview.weekLbl")} ${ch.week}${ch.complete ? ` — ${t("histview.completeLbl")}` : ""}`}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              {ch.rows.map((r) => {
                const done = r.status === "done";
                const openable = !!r.sessionId;
                return (
                  <Pressable key={r.key} disabled={!openable} onPress={() => r.sessionId && ctx.onOpen(r.sessionId)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                    <View style={{ width: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: done ? withAlpha(accent, 0.18) : "transparent", borderWidth: done ? 0 : 1.5, borderStyle: done ? "solid" : "dashed", borderColor: done ? "transparent" : withAlpha(C.ash, 0.5) }}>
                      {done && <Text style={{ fontSize: 10, color: accentText }}>✓</Text>}
                    </View>
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: done ? F.semi : F.reg, fontSize: fs.body, color: done ? C.chalk : C.ash }}>{r.title}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: r.status === "missed" ? C.red : C.ash, textTransform: "uppercase" }}>
                      {r.dateKey ? fmtDayShort(r.dateKey) : ""}{!done ? ` – ${statusLabel[r.status] ?? r.status}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
