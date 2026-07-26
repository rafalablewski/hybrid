import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import {
  fmtTonnage,
  sessionHeadline,
  sessionsByDay,
  historyStream,
  upcomingPlanDays,
  weekChapters,
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
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { RADIUS, withAlpha } from "./kit";

// ── AURORA History views (mobile) ───────────────────────────────────────────
// The three merged History × Calendar layouts (agenda / weeks / timeline)
// behind the History screen's view switcher — parity with
// apps/web/components/aurora/history-views.tsx. All grouping math lives in
// @hybrid/core (engines/history-views.ts); these components only render.
// Session cards use the "headline number" treatment: one large figure
// (sessionHeadline), one mono meta line — each fact stated exactly once.
// Chartreuse = lifting, teal = sport/cardio, shading = sRPE load.

const keyTs = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const fmtDayLong = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtDayShort = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtWeekday = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

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

function Chip({ C, color, label, strong }: { C: Palette; color: string; label: string; strong?: boolean }) {
  return (
    <View style={{ backgroundColor: withAlpha(color, strong ? 0.16 : 0.13), borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color), fontWeight: strong ? "700" : "400" }}>{label}</Text>
    </View>
  );
}

/** The headline's unit label — localized block count for the last-resort kind. */
const unitOf = (h: SessionHeadline, t: (k: string) => string) =>
  h.kind === "blocks" ? t(h.value === "1" ? "w.analyze.hist.block" : "history.blocks") : h.unit;

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
 *  full block list live on the session page, one tap deep. */
function SessionCard({ C, s, ctx }: { C: Palette; s: LoggedSession; ctx: ViewCtx }) {
  const { t } = useLang();
  const prs = ctx.prs(s.id);
  const h = sessionHeadline(s, ctx.units, ctx.bw(s.startedAt));
  return (
    <Pressable
      onPress={() => ctx.onOpen(s.id)}
      style={{ borderRadius: 22, padding: 15, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.display, letterSpacing: -0.5, color: C.chalk }}>
        {h.value}
        <Text style={{ fontSize: fs.bodyLg, letterSpacing: 0, color: C.ash }}> {unitOf(h, t)}</Text>
      </Text>
      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6 }}>
        {[s.title, ...headlineMeta(h, t)].join(" – ")}
        {prs > 0 && (
          <>
            {" – "}
            <Text style={{ color: txt(C, C.lime) as string }}>{`↑ ${prs} PR`}</Text>
          </>
        )}
      </Text>
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
    // Full-bleed chip rail — clips at the screen edge, rests on the column.
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -16 }} contentContainerStyle={{ gap: 7, paddingBottom: 4, paddingHorizontal: 16 }}>
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
            {/* the cards lead with their own figures now — a day-level tonnage/PR
                chip here would restate them (say it once). */}
            <DayLabel C={C} text={item.isToday ? `${t("w.analyze.cal.today")} – ${fmtDayLong(item.dateKey)}` : fmtDayLong(item.dateKey)} today={item.isToday} />
            {item.sessions.map((s) => <SessionCard key={s.id} C={C} s={s} ctx={ctx} />)}
          </View>
        ),
      )}
    </View>
  );
}

// ============================================================
//  2 — Week chapters
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
            const h = sessionHeadline(s, ctx.units, ctx.bw(s.startedAt));
            return (
              <Pressable key={s.id} onPress={() => ctx.onOpen(s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                <View style={{ width: 32, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase" }}>{fmtWeekday(key)}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, fontWeight: "700" }}>{Number(key.slice(8, 10))}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{s.title}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 1 }}>
                    {[`${h.value} ${unitOf(h, t)}`, ...headlineMeta(h, t)].join(" – ")}
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
//  3 — Timeline rail
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
              {item.sessions.map((s) => <SessionCard key={s.id} C={C} s={s} ctx={ctx} />)}
            </View>
          </View>
        ),
      )}
    </View>
  );
}
