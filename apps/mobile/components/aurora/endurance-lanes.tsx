import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import Svg, { Polyline, Polygon, Circle, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  activeDisciplines, enduranceLanes, orderLanes, nextLaneOrder, zonePercents,
  paceDelta, formatPaceDelta, paceDeltaArrow, paceTrendPoints, volumeBars, formatDisciplinePace,
  laneVolumeReading, lanePaceReading,
  DISCIPLINE_META, LANE_CAP, ago, durationUnits, formatDuration,
  type CardioDiscipline, type EnduranceLane, type LaneOrder, type LoggedSession,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { useChartScrub, type ScrubBind } from "./chart-scrub";
import { GUTTER, RADIUS } from "./kit";
import HistoryStrip from "./history-strip";
import RailTail from "./rail-tail";

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

/** The week a held point covers, in the tile's own label voice. */
const weekLabel = (t: (k: string) => string, iso: string) =>
  t("chart.weekOf").replace("{date}", iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

export default function AuroraEnduranceLanes({
  sessions,
  onOpen,
  canOpen,
  cap = LANE_CAP,
  head = true,
  order: controlledOrder,
}: {
  sessions: LoggedSession[];
  onOpen?: (discipline: CardioDiscipline) => void;
  /** Whether a discipline has somewhere to open — a lane with no destination
   *  shows no exit rather than a button that does nothing. */
  canOpen?: (discipline: CardioDiscipline) => boolean;
  /** Lanes shown before the expander. The Endurance SCREEN passes Infinity:
   *  it is the comparison, so there is nothing to hold back. */
  cap?: number;
  /** The block's own title row. Off on the screen, whose hero already says it. */
  head?: boolean;
  /** The lane order, when a CALLER owns it — Today does, because the chip that
   *  changes it lives on the Endurance headline row, outside this block. Given
   *  one, this block only READS it (the chip that writes it is the caller's);
   *  omit it and the state and the chip both stay in here. */
  order?: LaneOrder;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const [ownOrder, setOwnOrder] = useState<LaneOrder>("trained");
  const [expanded, setExpanded] = useState(false);
  const controlled = controlledOrder !== undefined;
  const order = controlledOrder ?? ownOrder;
  const cycle = useCallback(() => setOwnOrder((o) => nextLaneOrder(o)), []);

  const lanes = useMemo(() => enduranceLanes(sessions), [sessions]);
  // No endurance logged → no block. A lane exists because something is in it,
  // which is why no lane needs an empty state of its own.
  if (lanes.length === 0) return null;

  const stacked = orderLanes(lanes, order);
  const shown = expanded || !Number.isFinite(cap) ? stacked : stacked.slice(0, cap);
  const rest = Number.isFinite(cap) ? stacked.length - cap : 0;

  return (
    <View style={{ marginTop: 24 }}>
      {/* ONE item in the head's right slot — and for THIS block it is the
          CONTROL, not a fact.

          The slot used to quote the This-week card's distance column whole
          ("6.8 km this week"), which restated a figure the card had already
          printed three times: as the sentence's subject, inside its
          working-out line, and as the KM column itself. Worse, it was the
          wrong label for what sits underneath — a lane's summary tile carries
          WHOLE-HISTORY totals, its volume tile this week, its pace tile the
          latest week. No single head-level scope can be true of that, so scope
          moved onto the tile labels (see Tile below) and the slot went to the
          block's only interactive thing.

          The toggle also stops being a lime label on an orphan row: it is a
          state selector, not an action, so it wears the chip form in ash and
          chartreuse stays reserved for "go". Mirrors web endurance-lanes.tsx. */}
      {head && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("endurance.title")}</Text>
          {stacked.length > 1 && <LaneOrderChip order={order} onPress={cycle} />}
        </View>
      )}
      {/* Headless AND uncontrolled — the Endurance SCREEN — keeps its own row,
          because there its hero is the headline and this block has no head to
          hang the chip on. On Today the chip is hoisted to the cluster's
          headline (home.tsx), so `order` arrives controlled and nothing
          renders here. */}
      {!head && !controlled && stacked.length > 1 && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginHorizontal: 2, marginBottom: 8 }}>
          <LaneOrderChip order={order} onPress={cycle} />
        </View>
      )}

      {shown.map((lane) => <Lane key={lane.discipline} lane={lane} onOpen={onOpen} canOpen={canOpen ? canOpen(lane.discipline) : true} />)}

      {/* The block's END CONTROL — an EXPANDER, so it wears the expander
          grammar, not the door's (see week-verdict's DoorRow): chromeless
          like every end-of-thing affordance, but a BARE ＋/− with no ring,
          because the ring is what promises a screen and this only grows the
          block in place. The count drops chartreuse for ash with the fill —
          the accent is the "go" colour, and this control never goes
          anywhere. Mirrors web. */}
      {rest > 0 && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            marginHorizontal: 2, marginTop: 14, paddingVertical: 4,
          }}
        >
          <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 18, color: C.ash }}>{expanded ? "−" : "＋"}</Text>
          </View>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>
            {expanded ? t("w.home.end.fewer") : t("w.home.end.allSports")}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{expanded ? "−" : "+"}{rest}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * THE LANE-ORDER SELECTOR, in CONTROL form — a bordered chip in ash with a
 * chevron, not accent-coloured text. It cycles rather than opening a menu, so
 * the chip shows the order in force and the chevron says there are others.
 *
 * EXPORTED, because on Today it does not render here. The Endurance cluster's
 * headline row carries it (home.tsx, through GroupMark's `right` slot), which
 * is where the Explore SectionHead grammar puts a head-level control: beside
 * the title, on the same row, never on an orphan row of its own underneath. It
 * used to sit on such a row — right-aligned, floating between the section's
 * opener and its first lane, attached to neither. A control that orders the
 * whole section belongs at the section's altitude.
 *
 * The Endurance SCREEN still renders it internally: its own hero is the
 * headline there, and this block has no head to hang it on. Mirrors web.
 */
export function LaneOrderChip({ order, onPress }: { order: LaneOrder; onPress: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t("endurance.title")} – ${t(ORDER_KEY[order])}`}
      hitSlop={8}
      style={{
        flexDirection: "row", alignItems: "center", gap: 5,
        backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill,
        paddingHorizontal: 9, paddingVertical: 4,
      }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
        {t(ORDER_KEY[order])}
      </Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>⌄</Text>
    </Pressable>
  );
}

function Lane({ lane, onOpen, canOpen }: { lane: EnduranceLane; onOpen?: (d: CardioDiscipline) => void; canOpen: boolean }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const zones = zonePercents(lane.zones);
  return (
    <View style={{ marginTop: 16 }}>
      {/* IDENTITY LEFT, THE LANE'S WINDOW RIGHT — the Explore SectionHead
          grammar, and the head's one concession since it was cut back to the
          name alone.

          It used to carry "8 efforts" (which the tile below restated verbatim)
          and then a "See all ›" that competed with the rail's own tail. Neither
          objection applies to a SCOPE: it is not a figure any tile prints, and
          it is not a second exit. It is the one fact that makes the five
          figures underneath commensurable — and printing it here is what buys
          every tile below a one-word label. The rail used to spend three
          compound labels per lane saying it card by card, and still ended up
          with four different windows in five cards. Mirrors web. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.note, color: C.chalk }}>
          {DISCIPLINE_META[lane.discipline].emoji} {t(lane.labelKey)}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}
        >
          {t("w.home.end.scopeAll")}
        </Text>
      </View>
      {/* Full-bleed rail — negative margins the width of AuroraScreen's 12dp
          gutter pull the scroll clip to the true screen edge, with matching
          internal padding so resting tiles stay on the content column. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        style={{ marginHorizontal: -GUTTER }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, paddingVertical: 2 }}
      >
        <EffortsTile lane={lane} />
        <DistanceTile lane={lane} />
        {lane.paceTrend.length > 1 && <TrendTile lane={lane} />}
        {zones.any && <ZoneTile lane={lane} />}
        {lane.last && <LastTile lane={lane} />}
        {/* THE EXIT — last thing in the rail, so it's found by the same swipe
            that exhausts the tiles. Chromeless (see rail-tail.tsx): a lane's
            tiles each carry a metric, the exit carries none, so it must not
            draw as a sixth tile that turned out to be blank. `minHeight`
            matches Tile only so the rail keeps one height. */}
        {onOpen && canOpen && (
          <RailTail
            onOpen={() => onOpen(lane.discipline)}
            a11y={`${t("w.explore.seeAll")} – ${t(lane.labelKey)}`}
            w={112} minHeight={TILE_H}
          />
        )}
      </ScrollView>
    </View>
  );
}

/**
 * One rail tile — the cluster's shared skeleton, and the place the THREE-SLOT
 * RULE is enforced rather than merely documented:
 *
 *   lane head → the scope of every FIGURE in the lane, said ONCE (see Lane)
 *   label     → the METRIC, one word
 *   foot      → the window of the CHART, with `footRight` for a delta
 *
 * The middle slot used to carry metric AND figure-scope together, because there
 * was nowhere else for the scope to go — so a rail printed "Volume – this
 * week", "Pace – latest week" and "Zones – all time", three compounds per lane,
 * three lanes deep. Worse, those three scopes were REAL: the tiles were
 * measuring four different windows, and a rail is a comparison instrument. The
 * labels were the section apologising in advance for cards that could not be
 * read across. Giving the lane one window retires the apology and the compound
 * with it.
 *
 * `foot` is OPTIONAL and stays empty when the chart already shows its window: a
 * bar strip draws one countable bar per week, so "8 weeks" under eight bars is
 * the axis restated in prose. Only a chart with nothing to count (the pace
 * line) needs the window said out loud.
 *
 * Fixed width, shared minimum height so a rail's cards sit on one baseline
 * however differently they're filled.
 *
 * `bind` makes the WHOLE TILE the target of its own held chart. The strip
 * inside is 24dp tall — a fair chart and an unfair touch target — so the press
 * lands anywhere on the card while the fraction is still measured against the
 * drawing (the hook's `plotRef`). Holding swaps the FIGURE for that week's
 * value and names the week in the FOOT — never in the label, which is the
 * metric and must not change under a thumb. A tile whose foot is empty at rest
 * still RESERVES it (`foot=""`), so filling it shifts nothing.
 */
function Tile({ w, label, a11y, foot, footRight, bind, children }: {
  w: number;
  label: string;
  /** What a screen reader hears INSTEAD of the one-word label. The visible
   *  label sheds the scope because the lane head carries it; a listener has no
   *  head in view, so the long metric-plus-scope string (the very wording the
   *  labels used to show, translations and all) is announced here. */
  a11y?: string;
  /** `""` RESERVES the row without printing anything — a chart that answers on
   *  hold needs somewhere to put the week that isn't the label, and a row that
   *  appears on touch would move the chart under the finger. */
  foot?: string;
  footRight?: React.ReactNode;
  bind?: ScrubBind;
  children: React.ReactNode;
}) {
  const { palette: C } = useTheme();
  return (
    <View
      {...(bind ?? {})}
      style={{
        width: w, minHeight: TILE_H, gap: 6,
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
        paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12,
      }}
    >
      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        numberOfLines={1}
        accessibilityLabel={a11y}
        style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}
      >
        {label}
      </Text>
      {children}
      {(foot !== undefined || footRight) && (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{foot ?? ""}</Text>
          {footRight}
        </View>
      )}
    </View>
  );
}

/** Two INDEPENDENT facts on one row — not a key and its value.
 *
 *  `strong` went with the summary tile's `KM` / `TIME` keys: it existed to lift
 *  a value out of the ash its label sat in, and there are no labels here any
 *  more. LastTile is the sole consumer now, and there both cells are facts
 *  (distance and pace, then when and how long), so both read as ash. */
function MetaRow({ l, r }: { l: string; r: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{l}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{r}</Text>
    </View>
  );
}

/**
 * EFFORTS — the count, and the time it took.
 *
 * It used to be the "all time" tile, carrying three metrics under a label that
 * named none of them, which is the only reason it needed the `KM` / `TIME` row
 * keys: with the label spent on the scope, nothing else could say what the two
 * numbers were. The label is the metric now and the scope is on the lane head,
 * so the keys have nothing left to do — `2h 27min` is self-evidently a duration
 * and nothing else in the app is spelled that way.
 *
 * DISTANCE MOVED OUT, to DistanceTile. Under one window this tile's km and that
 * tile's figure are the same number, and the bars belong to the one that owns
 * the metric. Losing it also settles the tile's grammar: it opened as
 * figure-plus-unit and then switched to a right-flushed key-value table, two
 * reading directions in the narrowest card on the screen. Size carries the
 * hierarchy now, which is what should have been carrying it.
 */
function EffortsTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Tile w={126} label={t("endurance.efforts")}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -1, color: C.chalk }}>{lane.efforts}</Text>
      </View>
      <View style={{ gap: 3, marginTop: "auto" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.chalk }}>
          {formatDuration(lane.minutes, durationUnits(t))}
        </Text>
      </View>
    </Tile>
  );
}

/**
 * DISTANCE — the lane's whole-history kilometres, over the eight weeks that
 * produced the most recent of them.
 *
 * The figure used to be THIS WEEK's km, which is what made the rail
 * incomparable: a total two cards to the left, a week here, a single week's
 * pace two cards to the right. It reads the lane's own distance now, the same
 * number the Efforts tile used to print as `KM`, in the tile that owns the
 * metric and draws its history.
 *
 * HELD, the FIGURE answers for one week and the FOOT names which. The label
 * stays "Distance": it is the metric, and a metric that changes under a thumb
 * is the fault this rewrite exists to fix. The foot is reserved but empty at
 * rest — the strip DRAWS its window as eight countable bars, so a caption
 * naming the count would be the axis set in prose, but the row has to be there
 * or filling it on hold would move the chart.
 */
function DistanceTile({ lane }: { lane: EnduranceLane }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const scrub = useChartScrub(lane.weeks.length, "band");
  const read = scrub.index >= 0 ? laneVolumeReading(lane, scrub.index) : null;
  return (
    <Tile
      w={178}
      label={t("w.home.end.mDistance")}
      a11y={t("w.home.end.volumeWeek")}
      bind={scrub.bind}
      foot={read ? weekLabel(t, read.weekStart) : ""}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -1, color: read?.best ? txt(C, C.lime) : C.chalk }}>
          {read ? read.value : lane.distanceKm}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{read ? read.unit : "km"}</Text>
      </View>
      <View ref={scrub.plotRef} style={{ marginTop: "auto" }}>
        <HistoryStrip bars={volumeBars(lane.weeks)} color={C.blue} held={scrub.index} />
      </View>
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
  // The line runs edge to edge, so its points carry no inset — the first is at
  // 0 and the last at the full width.
  const scrub = useChartScrub(pts.length, "point");
  const read = scrub.index >= 0 ? lanePaceReading(lane, scrub.index) : null;
  const hit = scrub.index >= 0 ? xy[scrub.index] : null;
  return (
    <Tile
      w={176}
      label={t("w.home.end.mPace")}
      a11y={t("w.home.end.paceLatest")}
      bind={scrub.bind}
      // The foot is the CHART's slot: its window at rest, the held week when a
      // finger is down. The delta rides beside it because a delta is a fact
      // about the window, not about the lane's all-time figure above.
      foot={read ? weekLabel(t, read.weekStart) : t("w.home.end.window8")}
      footRight={delta ? (
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10, color: txt(C, delta.faster ? C.lime : C.red) }}>
          {paceDeltaArrow(delta, lane.discipline)} {formatPaceDelta(delta, lane.discipline)}
        </Text>
      ) : undefined}
    >
      {/* The lane's ALL-TIME pace at rest — the last figure to join the one
          window. It used to print the newest trend point, which made this the
          third distinct scope in a rail of five cards. Held, it answers for the
          scrubbed week and the foot says which. */}
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -1, color: read?.best ? txt(C, C.lime) : C.chalk }}>
        {read ? `${read.value} ${read.unit}` : formatDisciplinePace(lane.paceAllTime ?? lane.paceTrend[lane.paceTrend.length - 1]!, lane.discipline)}
      </Text>
      <View ref={scrub.plotRef} style={{ marginTop: "auto" }}>
        <Svg width={TREND_W} height={TREND_H}>
          <Defs>
            <LinearGradient id={`lane-${lane.discipline}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.blue} stopOpacity="0.22" />
              <Stop offset="1" stopColor={C.blue} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Polygon points={`0,${TREND_H} ${line} ${TREND_W},${TREND_H}`} fill={`url(#lane-${lane.discipline})`} />
          <Polyline points={line} fill="none" stroke={C.blue} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          {!!hit && <Line x1={hit[0]} x2={hit[0]} y1={0} y2={TREND_H} stroke={C.ash} strokeWidth={1} strokeOpacity={0.55} />}
          <Circle cx={end[0]} cy={end[1]} r={2.4} fill={C.blue} stroke={C.ink2} strokeWidth={1.4} />
          {!!hit && <Circle cx={hit[0]} cy={hit[1]} r={2.8} fill={C.chalk} stroke={C.ink2} strokeWidth={1.4} />}
        </Svg>
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
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: 10, color: C.ash }}>{label}</Text>
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
    <Tile w={152} label={t("w.home.end.mZones")} a11y={t("w.home.end.zonesAll")}>
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
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk, marginTop: 3 }}>{e.name}</Text>
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

/**
 * THE ORDER, owned by the SCREEN — state, the cycle, and whether there is
 * anything to order.
 *
 * Today's Endurance headline carries the chip, so the state has to live above
 * the lanes. `many` is the gate: one lane cannot be reordered, and a control
 * offering to sort a list of one is a control that does nothing. It counts
 * through core's `activeDisciplines` rather than building the lanes again —
 * the lanes below already do that, and this only needs to know how many there
 * will be. Mirrors web.
 */
export function useLaneOrder(sessions: LoggedSession[]): {
  order: LaneOrder;
  cycle: () => void;
  many: boolean;
} {
  const [order, setOrder] = useState<LaneOrder>("trained");
  const many = useMemo(() => activeDisciplines(sessions).length > 1, [sessions]);
  const cycle = useCallback(() => setOrder((o) => nextLaneOrder(o)), []);
  return { order, cycle, many };
}
