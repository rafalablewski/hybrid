import { useMemo, useRef, useState } from "react";
import { View, Text } from "react-native";
import {
  fmtTonnage,
  fmtKm,
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
  sessionTitleText,
  ALPHA,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { SHARED_ELEMENTS } from "@hybrid/core";
import { useSharedElementSource } from "../../lib/shared-element";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, fs, F, PressScale as Pressable, Chip, FIXED_FONT_SCALE, MAX_FONT_SCALE , tracking} from "../../lib/ui";
import { ACard, APressCard, RADIUS, CARD_PAD, withAlpha, DockRail, DockChip } from "./kit";

// ── AURORA History views (mobile) ───────────────────────────────────────────
// The four merged History × Calendar layouts (agenda / weeks / timeline / trend)
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
    /* APressCard — a card that IS the tap target, which is exactly the shape
       ACard could not supply until this branch, and exactly why this one was
       hand-drawn. It also gains an accessible NAME: the bare Pressable had
       neither role nor label, so VoiceOver read the whole card's text as one
       run and never announced it as a button. */
    <APressCard onPress={() => ctx.onOpen(s.id)} a11yLabel={sessionTitleText(s.title, t)}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.display, letterSpacing: tracking.display, color: C.chalk }}>
        {h.value}
        <Text style={{ fontSize: fs.bodyLg, letterSpacing: tracking.normal, color: C.ash }}> {unitOf(h, t)}</Text>
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6 }}>
        {[sessionTitleText(s.title, t), ...headlineMeta(h, t)].join(" – ")}
        {prs > 0 && (
          <>
            {" – "}
            <Text style={{ color: txt(C, C.lime) as string }}>{`↑ ${prs} PR`}</Text>
          </>
        )}
      </Text>
    </APressCard>
  );
}

function DayLabel({ C, text, today }: { C: Palette; text: string; today?: boolean }) {
  return <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.caps, textTransform: "uppercase", color: today ? (txt(C, C.lime) as string) : C.ash }}>{text}</Text>;
}

function RestGapRow({ C, days }: { C: Palette; days: number }) {
  const { t } = useLang();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: withAlpha(C.ash, 0.7) }}>
        {days} {days === 1 ? t("histview.restDay") : t("histview.restDays")}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    </View>
  );
}

// ============================================================
//  Switcher
// ============================================================

/**
 * History's view rail — a SCROLLING chip rail, which is why it is chips and not
 * ASegment. A segmented control is equal-width and lives in a track; this rail
 * is full-bleed, scrolls past the screen edge, and a fifth layout must be able
 * to join it without a redesign. Naming that correctly is what kept it out of
 * the segmented-control merge.
 *
 * It rides `DockRail` with `role="mode"`: the chips SELECT (one always on, the
 * layout below changes), which is what earns them the accent tint. It used to
 * borrow `AChip` — the in-content filter — and that is why mobile History drew
 * Archivo bold 13 in a band where all three other rails drew mono 12. See
 * packages/core/src/dock-rail.ts.
 */
export function ViewSwitcher({ view, onChange }: { view: HistoryViewId; onChange: (v: HistoryViewId) => void }) {
  const { t } = useLang();
  return (
    <DockRail label={t("histview.switchView")}>
      {HISTORY_VIEWS.map((v) => (
        <DockChip key={v.id} role="mode" label={t(v.labelKey)} selected={v.id === view} onPress={() => onChange(v.id)} />
      ))}
    </DockRail>
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
          <View key={d.key} style={{ flex: 1, alignItems: "center", gap: 5, paddingTop: 8, paddingBottom: 8, borderRadius: RADIUS.inner, backgroundColor: C.ink2, borderWidth: 1, borderColor: d.isToday ? C.lime : C.line }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(WEEKDAY_LABEL_KEYS[i]!).slice(0, 1)}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: d.isToday ? lime : d.future ? C.ash : C.chalk }}>{d.dayNum}</Text>
            <View style={{ width: 5, height: 5, borderRadius: RADIUS.mark, backgroundColor: d.dot === 2 ? C.lime : d.dot === 1 ? withAlpha(C.lime, ALPHA.rim) : "transparent" }} />
          </View>
        ))}
      </View>

      {/* plan-day ghosts, furthest first so today's due session sits right above
          the stream; a due-today ghost replaces the "nothing today" row */}
      {[...upcoming].reverse().map((u) => (
        <View key={u.dateKey} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <DayLabel C={C} text={u.isToday ? `${t("w.analyze.cal.today")} – ${fmtDayLong(u.dateKey)}` : fmtDayLong(u.dateKey)} today={u.isToday} />
            <Chip color={u.isToday ? C.lime : C.ash}>{t("histview.planned")}</Chip>
          </View>
          <View style={{ borderRadius: RADIUS.card, padding: CARD_PAD, borderWidth: 1.5, borderStyle: "dashed", borderColor: withAlpha(u.isToday ? C.lime : C.ash, ALPHA.rim) }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: u.isToday ? C.chalk : C.ash }}>{u.planName} – {u.week != null ? `${t("histview.weekLbl")} ${u.week}, ${u.title}` : u.title}</Text>
            {u.blockNames.length > 0 && (
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6 }}>
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
  // One ref per row title; only the tapped row is ever measured.
  const titleRefs = useRef<Record<string, Text | null>>({});
  const armTitle = useSharedElementSource();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const weeks = useMemo(() => weekChapters(ctx.sessions, { bw: ctx.bw, prs: ctx.prs }), [ctx.sessions, ctx.bw, ctx.prs]);
  const maxLoad = Math.max(1, ...weeks.flatMap((w) => w.days.map((d) => d.load)));
  const lime = txt(C, C.lime) as string;

  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      {weeks.map((w) => (
        /* The current week keeps its lime-tinted hairline — that is the one
           value here that is genuinely this card's, so it is the one thing
           passed. Everything else was the kit's, written out. */
        <ACard key={w.startKey} style={w.isCurrent ? { borderColor: withAlpha(C.lime, ALPHA.line) } : undefined}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.chalk }}>{fmtDayShort(w.startKey)} – {fmtDayShort(w.endKey)}</Text>
            {w.isCurrent && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: lime, letterSpacing: tracking.caps, textTransform: "uppercase" }}>{t("histview.thisWeek")}</Text>}
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, height: 34, marginTop: 12, marginBottom: 4 }}>
            {w.days.map((d) => {
              const h = d.load <= 0 ? 3 : Math.max(6, Math.round((d.load / maxLoad) * 34));
              return <View key={d.dateKey} style={{ flex: 1, height: h, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: d.load <= 0 ? withAlpha(C.ash, ALPHA.solid) : d.hasCardio && !d.hasStrength ? C.blue : C.lime }} />;
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {WEEKDAY_LABEL_KEYS.map((k) => <Text key={k} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(k).slice(0, 1)}</Text>)}
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12, marginBottom: 4 }}>
            {w.totals.volume > 0 && <Chip color={C.lime}>{fmtTonnage(w.totals.volume, ctx.units)}</Chip>}
            <Chip color={C.ash}>{`${w.totals.sessions} ${t("histview.sessionsLbl")}`}</Chip>
            {w.totals.prs > 0 && <Chip color={C.lime}>{`↑ ${w.totals.prs} PR`}</Chip>}
          </View>
          {w.sessions.map((s) => {
            const key = localDayKey(s.startedAt);
            const h = sessionHeadline(s, ctx.units, ctx.bw(s.startedAt));
            const titleStyle = { fontFamily: F.bold, fontSize: fs.body, color: C.chalk } as const;
            return (
              <Pressable
                key={s.id}
                // SHARED ELEMENT: the session's title flies into the heading of
                // its own breakdown rather than the page re-rendering it. Only
                // the TAPPED row arms — a list of rows all claiming the name
                // would collide — and if the destination declines it (a
                // celebration reveal owns the motion there) the arm simply
                // expires and the ordinary push carries the change.
                onPress={() => {
                  armTitle(SHARED_ELEMENTS.sessionHero, titleRefs.current[s.id] ?? null, sessionTitleText(s.title, t), titleStyle);
                  ctx.onOpen(s.id);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line }}
              >
                <View style={{ width: 32, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase" }}>{fmtWeekday(key)}</Text>
                  <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{Number(key.slice(8, 10))}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} ref={(r) => { titleRefs.current[s.id] = r; }} numberOfLines={1} style={titleStyle}>{sessionTitleText(s.title, t)}</Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 1 }}>
                    {[`${h.value} ${unitOf(h, t)}`, ...headlineMeta(h, t)].join(" – ")}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.mono, color: C.ash }}>›</Text>
              </Pressable>
            );
          })}
        </ACard>
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
            <Text style={{ position: "absolute", left: 0, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: withAlpha(C.ash, 0.55) }}>
              {item.days} {item.days === 1 ? t("histview.restDay") : t("histview.restDays")}
            </Text>
          </View>
        ) : (
          <View key={item.dateKey} style={{ marginBottom: 16 }}>
            <View style={{ position: "absolute", left: -56, top: 0, width: 48, alignItems: "center" }}>
              <View style={{ width: item.level >= 3 ? 13 : 10, height: item.level >= 3 ? 13 : 10, borderRadius: 7, backgroundColor: item.shape === "cardio" ? C.blue : C.lime, borderWidth: 3, borderColor: C.ink, marginBottom: 5 }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "center", textTransform: "uppercase" }}>{fmtWeekday(item.dateKey)}</Text>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: item.isToday ? lime : C.chalk }}>{Number(item.dateKey.slice(8, 10))}</Text>
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
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [range, setRange] = useState<StatRange>("week");
  const buckets = useMemo(() => sessionBuckets(ctx.sessions, range), [ctx.sessions, range]);
  const recap = useMemo(() => weeklyRecap(ctx.sessions, Date.now(), ctx.bw), [ctx.sessions, ctx.bw]);
  const hasData = ctx.sessions.length > 0;
  const maxVal = Math.max(1, ...buckets.buckets.map((b) => b.value));

  /* `cardStyle` is gone: it was ACard's base style hoisted into a const and
     spread into two Views, which is the copy one step further along — the
     values were shared, so they looked deliberate, and neither shape could
     mount the glass. Both are ACard now, and each passes only what is its
     own. */
  const Mini = ({ label, value }: { label: string; value: string }) => (
    /* a TILE in a row of tiles, not a full-width card — it keeps the compact inset */
    <ACard style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.heading, letterSpacing: tracking.display, marginTop: 4, color: C.chalk }}>{value}</Text>
    </ACard>
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 4, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 3 }}>
        {TREND_RANGES.map((rg) => {
          const on = range === rg.id;
          return (
            <Pressable
              key={rg.id}
              onPress={() => setRange(rg.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: RADIUS.pill, alignItems: "center", backgroundColor: on ? C.lime : "transparent" }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: on ? C.onAccent : C.ash }}>
                {t(rg.key)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ACard>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{t("w.analyze.stats.sessions")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
            {buckets.total} {t("w.analyze.stats.inRange")} {t(TREND_RANGES.find((r) => r.id === range)!.key).toLowerCase()}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 118, marginTop: 16, gap: 6 }}>
          {buckets.buckets.map((b, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{ width: "100%", height: Math.max(4, (b.value / maxVal) * 92), borderRadius: 5, backgroundColor: i === buckets.peakIndex ? C.lime : C.line }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{b.label}</Text>
            </View>
          ))}
        </View>
      </ACard>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {/* Core figure-order.ts: active days sit with the session count they
            are a fact about, then time, then the ground covered. */}
        <Mini label={t("w.analyze.stats.activeDays")} value={hasData ? String(buckets.activeDays) : "—"} />
        <Mini label={t("w.analyze.stats.minutes")} value={hasData ? String(Math.round(recap.minutes)) : "—"} />
        <Mini label={t("w.analyze.stats.distance")} value={hasData ? fmtKm(recap.distanceKm) : "—"} />
      </View>

      {!hasData && (
        <Text style={{ fontSize: fs.body, color: C.ash, textAlign: "center", marginTop: 6, lineHeight: leading(fs.body) }}>{t("w.analyze.stats.empty")}</Text>
      )}
    </View>
  );
}
