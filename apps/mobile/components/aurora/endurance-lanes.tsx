import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Svg, { Polyline, Polygon, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  enduranceLanes, orderLanes, nextLaneOrder, zonePercents,
  paceDelta, formatPaceDelta, paceDeltaArrow, paceTrendPoints, volumeBars, formatDisciplinePace,
  progressParentage,
  DISCIPLINE_META, LANE_CAP, ago,
  type CardioDiscipline, type EnduranceLane, type LaneOrder, type LoggedSession,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";
import { RADIUS } from "./kit";
import HistoryStrip from "./history-strip";

/**
 * SPORT LANES — the Endurance block on Today, directly under the "This week"
 * card, the TWIN of components/aurora/endurance-lanes.tsx on web.
 *
 * The hub moved out of More and onto Today, and inverted while it did: instead
 * of one discipline behind a picker, EVERY logged discipline gets a lane, and a
 * lane is a full-bleed rail of that discipline's own analytics — efforts /
 * distance / time, eight-week volume, pace trend, pace zones, last effort.
 *
 * Adding a metric widens a rail; it never lengthens the block. That is the only
 * reason the whole endurance read fits inline without Today growing a second
 * screen — and why it can now sit high on the scroll, under the week it
 * details, rather than being exiled to the foot of it. Three lanes render, the
 * rest sit behind the expander.
 *
 * Every number comes from @hybrid/core endurance-lanes.ts — lane order, the
 * cap, the zone rounding, the "faster is up" rule — so web can't drift.
 *
 * The block used to OPEN with a cross-sport totals card (efforts / km / h for
 * the week). It is gone: the "This week" card higher up Today already states
 * the week, and two totals cards on one screen counting different populations
 * under near-identical labels — "5 sessions, 3.2 h" over "3 efforts, 0.9 h" —
 * is a misreading waiting to happen. The week's distance moved into that card
 * as its own column; per-sport figures stay in the lanes, where the lane names
 * the scope.
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
  // WAVE-3 PARENTAGE: the head quotes the This-week card's DISTANCE column —
  // the figure these lanes break down per discipline. Same activitySummary,
  // same week range (core progress-parentage.ts), so they cannot disagree.
  const parentage = useMemo(() => progressParentage(sessions), [sessions]);
  // No endurance logged → no block. A lane exists because something is in it,
  // which is why no lane needs an empty state of its own.
  if (lanes.length === 0) return null;

  const stacked = orderLanes(lanes, order);
  const shown = expanded ? stacked : stacked.slice(0, LANE_CAP);
  const rest = stacked.length - LANE_CAP;
  const km = Math.round(parentage.distanceKm * 10) / 10;

  return (
    <View style={{ marginTop: 24 }}>
      {/* One item in the head's right slot: the quoted FACT (ash). The sort
          ACTION moved to its own quiet row below — a head carries at most one
          right-slot item, and the fact is the one that names the block.
          Mirrors web endurance-lanes.tsx. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("endurance.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
          {t("w.home.group.metaWeek").replace("{v}", `${km} km`)}
        </Text>
      </View>
      {/* The lane-order toggle — only when there is an order to change. */}
      {stacked.length > 1 && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginHorizontal: 2 }}>
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
      )}

      {shown.map((lane) => <Lane key={lane.discipline} lane={lane} onOpen={onOpen} />)}

      {/* The block's exit, in the DOOR-ROW anatomy (the This-week card's
          idiom): full-width blocks end in a door, rails end in a trailing
          ghost tile — the cluster's one "see more" rule. The old bare "+N"
          outline button is retired. Mirrors web endurance-lanes.tsx. */}
      {rest > 0 && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            marginHorizontal: 2, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12,
            backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16,
          }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, color: C.ash }}>{expanded ? "−" : "＋"}</Text>
          </View>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>
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
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
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

/** One rail tile — the cluster's shared skeleton (name row → figure → chart →
 *  footer). Fixed width, shared minimum height so a rail's cards sit on one
 *  baseline however differently they're filled. `right` rides the name row
 *  (a delta, a qualifier) — the same slot the exercises tiles use. */
function Tile({ w, label, right, children }: { w: number; label: string; right?: React.ReactNode; children: React.ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View
      style={{
        width: w, minHeight: TILE_H, gap: 6,
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
        paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{label}</Text>
        {right}
      </View>
      {children}
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
      <Text style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -1, color: C.chalk }}>{lane.efforts}</Text>
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
  // The tile skeleton (wave 2): label row → this week's km as the FIGURE →
  // the shared HistoryStrip as the chart → the window as the footer. The old
  // 46px one-off bar block is retired for the cluster's one chart language.
  return (
    <Tile w={178} label={t("w.home.exw.volume")}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -1, color: C.chalk }}>{lane.thisWeek.km}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>km</Text>
      </View>
      <View style={{ marginTop: "auto" }}>
        <HistoryStrip bars={volumeBars(lane.weeks)} color={C.blue} />
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.home.end.window8")}</Text>
    </Tile>
  );
}

const TREND_W = 176 - 24; // tile width less its horizontal padding
// The strip's shared 24px chart zone — the line is the one honest exception
// to the bar strip (pace is a level over time, not a quantity per week), and
// it draws at the strip's own height so even the exception aligns (wave 2).
const TREND_H = 24;

function TrendTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const pts = paceTrendPoints(lane.paceTrend);
  const delta = paceDelta(lane.paceTrend);
  // 0 → top of the box, so the fastest week sits highest on every discipline.
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * TREND_W, 3 + p * (TREND_H - 6)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const end = xy[xy.length - 1]!;
  return (
    <Tile
      w={176}
      label={t("session.paceTrend")}
      right={delta ? (
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10, color: txt(C, delta.faster ? C.lime : C.red) }}>
          {paceDeltaArrow(delta, lane.discipline)} {formatPaceDelta(delta, lane.discipline)}
        </Text>
      ) : undefined}
    >
      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -1, color: C.chalk }}>
        {formatDisciplinePace(lane.paceTrend[lane.paceTrend.length - 1]!, lane.discipline)}
      </Text>
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
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.home.end.window8")}</Text>
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
