import { useMemo, useRef } from "react";
import { View, Text } from "react-native";
import {
  fmtTonnage,
  sessionHeadline,
  weekChapters,
  localDayKey,
  type LoggedSession,
  type SessionHeadline,
  type WeightUnit,
  type BodyweightLookup,
  sessionTitleText,
  ALPHA,
} from "@hybrid/core";
import { useLang, useSessionCount } from "../../lib/i18n";
import { SHARED_ELEMENTS } from "@hybrid/core";
import { useSharedElementSource } from "../../lib/shared-element";
import { useTheme, txt } from "../../lib/theme";
import { Chip, F, MAX_FONT_SCALE, PressScale as Pressable, fs, tracking } from "../../lib/ui";
import { ACard, withAlpha } from "./kit";
import { DoorRow } from "./week-verdict";
import { WeekMarks } from "./week-marks";

// ── AURORA History views (mobile) ───────────────────────────────────────────
// History is ONE layout: calendar-week chapters, each of which opens its own
// week summary. The four merged History × Calendar layouts (agenda / weeks /
// timeline / trend) and the switcher above them were retired in Aug 2026 —
// four projections of one set of sessions is four places for the same fact to
// be stated differently, and the week is the grain an athlete reviews in. All
// grouping math lives in @hybrid/core (engines/history-views.ts); this file
// only renders. Chartreuse = lifting, teal = sport/cardio.

const keyTs = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const fmtDayShort = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtWeekday = (key: string) => new Date(keyTs(key)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

export interface ViewCtx {
  sessions: LoggedSession[];
  units: WeightUnit;
  /** dated bodyweight lookup — passed into every engine call so aggregate
   *  tonnage matches the bodyweight-aware per-session cards. */
  bw: BodyweightLookup;
  prs: (id: string) => number;
  onOpen: (id: string) => void;
  /** Open a week's own summary — the door at the end of each chapter. */
  onWeek: (startKey: string) => void;
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

// ============================================================
//  Week chapters
// ============================================================

export function WeeksView({ ctx }: { ctx: ViewCtx }) {
  // One ref per row title; only the tapped row is ever measured.
  const titleRefs = useRef<Record<string, Text | null>>({});
  const armTitle = useSharedElementSource();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const sessionCount = useSessionCount();
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
            <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk }}>{fmtDayShort(w.startKey)} – {fmtDayShort(w.endKey)}</Text>
            {w.isCurrent && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: lime, letterSpacing: tracking(fs.nano, "caps"), textTransform: "uppercase" }}>{t("histview.thisWeek")}</Text>}
          </View>
          <View style={{ marginTop: 12 }}>
            <WeekMarks days={w.days} max={maxLoad} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12, marginBottom: 4 }}>
            {w.totals.volume > 0 && <Chip color={C.lime}>{fmtTonnage(w.totals.volume, ctx.units)}</Chip>}
            <Chip color={C.ash}>{sessionCount(w.totals.sessions)}</Chip>
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
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} ref={(r) => { titleRefs.current[s.id] = r; }} numberOfLines={1} style={titleStyle}>{sessionTitleText(s.title, t)}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 1 }}>
                    {[`${h.value} ${unitOf(h, t)}`, ...headlineMeta(h, t)].join(" – ")}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.mono, color: C.ash }}>›</Text>
              </Pressable>
            );
          })}
          {/* THE WEEK'S OWN DOOR — one per chapter, at the end of the thing, in
              the shared door row (ringed glyph = it LEAVES). It replaced a
              single "Share your week" pager that sat above the whole list and
              only ever spoke for the current week: every week has a report now,
              and it is reached the same way. */}
          <DoorRow
            glyph="◫"
            title={t("histview.weekSummary")}
            sub={weekDoorSub(w.totals, ctx.units, t, sessionCount)}
            onPress={() => ctx.onWeek(w.startKey)}
          />
        </ACard>
      ))}
    </View>
  );
}

/** What is behind the door, as a live figure — a door with a generic caption is
 *  a door nobody opens twice. */
function weekDoorSub(
  totals: { volume: number; sessions: number; prs: number },
  units: WeightUnit,
  t: (k: string) => string,
  sessionCount: (n: number) => string,
): string {
  return [
    totals.volume > 0 ? fmtTonnage(totals.volume, units) : null,
    sessionCount(totals.sessions),
    totals.prs > 0 ? `${totals.prs} ${t("recap.prs")}` : null,
  ]
    .filter(Boolean)
    .join(" – ");
}
