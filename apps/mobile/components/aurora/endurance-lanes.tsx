import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Svg, { Polyline, Polygon, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  enduranceLanes, orderLanes, nextLaneOrder, laneWeekTotals, zonePercents,
  paceDelta, formatPaceDelta, paceDeltaArrow, paceTrendPoints, volumeBars, formatDisciplinePace,
  DISCIPLINE_META, LANE_CAP, ago,
  type CardioDiscipline, type EnduranceLane, type LaneOrder, type LoggedSession,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";
import { RADIUS } from "./kit";

/**
 * SPORT LANES — the Endurance block at the bottom of Today, the TWIN of
 * components/aurora/endurance-lanes.tsx on web.
 *
 * The hub moved out of More and onto Today, and inverted while it did: instead
 * of one discipline behind a picker, EVERY logged discipline gets a lane, and a
 * lane is a full-bleed rail of that discipline's own analytics — efforts /
 * distance / time, eight-week volume, pace trend, pace zones, last effort.
 *
 * Adding a metric widens a rail; it never lengthens the block. That is the only
 * reason the whole endurance read fits under Nutrition without Today growing a
 * second screen. Three lanes render, the rest sit behind the expander.
 *
 * Every number comes from @hybrid/core endurance-lanes.ts — lane order, the
 * cap, the zone rounding, the "faster is up" rule — so web can't drift.
 */

const ORDER_KEY: Record<LaneOrder, string> = {
  trained: "w.home.end.orderTrained",
  recent: "w.home.end.orderRecent",
  longest: "w.home.end.orderLongest",
};

const TILE_H = 118;

export default function AuroraEnduranceLanes({
  sessions,
  onOpen,
}: {
  sessions: LoggedSession[];
  onOpen?: (discipline: CardioDiscipline) => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const [order, setOrder] = useState<LaneOrder>("trained");
  const [expanded, setExpanded] = useState(false);

  const lanes = useMemo(() => enduranceLanes(sessions), [sessions]);
  // No endurance logged → no block. A lane exists because something is in it,
  // which is why no lane needs an empty state of its own.
  if (lanes.length === 0) return null;

  const stacked = orderLanes(lanes, order);
  const shown = expanded ? stacked : stacked.slice(0, LANE_CAP);
  const rest = stacked.length - LANE_CAP;
  const week = laneWeekTotals(lanes);

  return (
    <View style={{ marginTop: 24 }}>
      {/* Explore-standard head: display-face title left, mono action right. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("endurance.title")}</Text>
        <Pressable
          onPress={() => setOrder(nextLaneOrder(order))}
          accessibilityRole="button"
          accessibilityLabel={`${t("endurance.title")} – ${t(ORDER_KEY[order])}`}
          hitSlop={10}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: txt(C, C.lime) }}>
            {t(ORDER_KEY[order])} ↓
          </Text>
        </Pressable>
      </View>

      {/* The one number a stack of lanes can't give you: the week across every
          sport. Same three figures the hub opens with, summed — on the same
          card surface Readiness uses (ink2, hairline, radius 22) rather than a
          bare hairline strip, which was the one un-carded block on Today. */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 22,
          paddingHorizontal: 16, paddingVertical: 15,
        }}
      >
        <Cell first label={t("endurance.efforts")} value={String(week.efforts)} />
        <Cell label="KM" value={String(week.distanceKm)} />
        <Cell label="H" value={String(Math.round(week.minutes / 6) / 10)} />
      </View>

      {shown.map((lane) => <Lane key={lane.discipline} lane={lane} onOpen={onOpen} />)}

      {rest > 0 && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            marginHorizontal: 2, marginTop: 12, paddingHorizontal: 14, paddingVertical: 11,
            borderWidth: 1, borderColor: C.line, borderRadius: 14,
          }}
        >
          <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>
            {expanded ? t("w.home.end.fewer") : t("w.home.end.allSports")}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{expanded ? "−" : "+"}{rest}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Lane({ lane, onOpen }: { lane: EnduranceLane; onOpen?: (d: CardioDiscipline) => void }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const zones = zonePercents(lane.zones);
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.note, color: C.chalk }}>
          {DISCIPLINE_META[lane.discipline].emoji} {t(lane.labelKey)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
            {lane.efforts} {t("endurance.efforts")}
          </Text>
          {onOpen && (
            <Pressable onPress={() => onOpen(lane.discipline)} accessibilityRole="button" hitSlop={10}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.explore.seeAll")} ›</Text>
            </Pressable>
          )}
        </View>
      </View>
      {/* Full-bleed rail — negative margins the width of AuroraScreen's 16dp
          gutter pull the scroll clip to the true screen edge, with matching
          internal padding so resting tiles stay on the content column. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 2 }}
      >
        <SummaryTile lane={lane} />
        <VolumeTile lane={lane} />
        {lane.paceTrend.length > 1 && <TrendTile lane={lane} />}
        {zones.any && <ZoneTile lane={lane} />}
        {lane.last && <LastTile lane={lane} />}
      </ScrollView>
    </View>
  );
}

/** One rail tile. Fixed width, shared minimum height so a rail's cards sit on
 *  one baseline however differently they're filled. */
function Tile({ w, label, children }: { w: number; label: string; children: React.ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View
      style={{
        width: w, minHeight: TILE_H, gap: 6,
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
        paddingHorizontal: 12, paddingTop: 11, paddingBottom: 12,
      }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      {children}
    </View>
  );
}

/** One cell of the cross-sport totals card. */
function Cell({ label, value, first }: { label: string; value: string; first?: boolean }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flex: 1, paddingLeft: first ? 0 : 12, borderLeftWidth: first ? 0 : 1, borderLeftColor: C.line }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.heading, letterSpacing: -0.4, marginTop: 3, color: C.chalk }}>{value}</Text>
    </View>
  );
}

function MetaRow({ l, r, strong }: { l: string; r: string; strong?: boolean }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{l}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: strong ? C.chalk : C.ash }}>{r}</Text>
    </View>
  );
}

function SummaryTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Tile w={126} label={t("endurance.efforts")}>
      <Text style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -0.7, color: C.chalk }}>{lane.efforts}</Text>
      <View style={{ gap: 3, marginTop: "auto" }}>
        <MetaRow l="KM" r={String(lane.distanceKm)} strong />
        <MetaRow l="H" r={String(Math.round(lane.minutes / 6) / 10)} strong />
      </View>
    </Tile>
  );
}

function VolumeTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const bars = volumeBars(lane.weeks);
  return (
    <Tile w={178} label={t("w.home.exw.volume")}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 46, marginTop: "auto" }}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              flex: 1, height: Math.max(3, h * 46), borderTopLeftRadius: 3, borderTopRightRadius: 3,
              backgroundColor: i === bars.length - 1 ? C.blue : `${C.blue}57`,
            }}
          />
        ))}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
        {lane.thisWeek.km} km {t("w.home.end.thisWeek").toLowerCase()}
      </Text>
    </Tile>
  );
}

const TREND_W = 176 - 24; // tile width less its horizontal padding
const TREND_H = 38;

function TrendTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const pts = paceTrendPoints(lane.paceTrend);
  const delta = paceDelta(lane.paceTrend);
  // 0 → top of the box, so the fastest week sits highest on every discipline.
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * TREND_W, 4 + p * (TREND_H - 8)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const end = xy[xy.length - 1]!;
  return (
    <Tile w={176} label={t("session.paceTrend")}>
      <View style={{ marginTop: "auto" }}>
        <Svg width={TREND_W} height={TREND_H}>
          <Defs>
            <LinearGradient id={`lane-${lane.discipline}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.blue} stopOpacity="0.22" />
              <Stop offset="1" stopColor={C.blue} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Polygon points={`0,${TREND_H} ${line} ${TREND_W},${TREND_H}`} fill={`url(#lane-${lane.discipline})`} />
          <Polyline points={line} fill="none" stroke={C.blue} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={end[0]} cy={end[1]} r={2.4} fill={C.blue} stroke={C.ink2} strokeWidth={1.4} />
        </Svg>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk }}>
          {formatDisciplinePace(lane.paceTrend[lane.paceTrend.length - 1]!, lane.discipline)}
        </Text>
        {delta && (
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 9.5, color: txt(C, delta.faster ? C.lime : C.red) }}>
            {paceDeltaArrow(delta, lane.discipline)} {formatPaceDelta(delta, lane.discipline)}
          </Text>
        )}
      </View>
    </Tile>
  );
}

/** One stacked legend row — swatch, zone name, percentage hard right. */
function Leg({ label, pct, c }: { label: string; pct: number; c: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: c }} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: 10, color: C.ash }}>{label}</Text>
      <Text style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 10, color: C.chalk }}>{pct}%</Text>
    </View>
  );
}

function ZoneTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const z = zonePercents(lane.zones);
  // The legend runs DOWN, not across: three zone words side by side blow a
  // rail-width tile apart the moment "Steady" becomes "Stałe"/"Gleichmäßig".
  // Stacked, it survives any language and the percentages align in a column.
  return (
    <Tile w={152} label={t("w.home.end.zones")}>
      <View style={{ flexDirection: "row", gap: 2, height: 8, marginTop: "auto" }}>
        {([[z.easy, C.lime], [z.moderate, C.amber], [z.hard, C.red]] as [number, string][]).map(
          ([pct, c]) => pct > 0 && <View key={c} style={{ flex: pct, backgroundColor: c, borderRadius: 2 }} />,
        )}
      </View>
      <View style={{ gap: 3, marginTop: 2 }}>
        <Leg label={t("running.easy")} pct={z.easy} c={C.lime} />
        <Leg label={t("running.moderate")} pct={z.moderate} c={C.amber} />
        <Leg label={t("running.hard")} pct={z.hard} c={C.red} />
      </View>
    </Tile>
  );
}

function LastTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const e = lane.last!;
  return (
    <Tile w={184} label={t("w.home.end.last")}>
      <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk, marginTop: 3 }}>{e.name}</Text>
      <View style={{ gap: 3, marginTop: "auto" }}>
        <MetaRow
          l={e.distanceKm > 0 ? `${e.distanceKm} km` : "–"}
          r={e.secPerKm != null ? formatDisciplinePace(e.secPerKm, lane.discipline) : "–"}
        />
        <MetaRow l={ago(e.startedAt)} r={`${e.minutes} min`} />
      </View>
    </Tile>
  );
}
