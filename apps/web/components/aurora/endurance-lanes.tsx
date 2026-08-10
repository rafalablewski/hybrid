"use client";

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  activeDisciplines, enduranceLanes, orderLanes, nextLaneOrder, zonePercents,
  paceDelta, formatPaceDelta, paceDeltaArrow, paceTrendPoints, volumeBars, formatDisciplinePace,
  laneVolumeReading, lanePaceReading,
  DISCIPLINE_META, LANE_CAP, ago, durationUnits, formatDuration,
  type CardioDiscipline, type EnduranceLane, type LaneOrder, type LoggedSession,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { useChartScrub, SCRUB_STYLE_IN_RAIL, type ScrubBind } from "./chart-scrub";
import HistoryStrip from "./history-strip";
import RailTail from "./rail-tail";

/**
 * SPORT LANES — the Endurance block on Today (web), directly under the "This
 * week" card, the TWIN of components/aurora/endurance-lanes.tsx on mobile.
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
 * cap, the zone rounding, the "faster is up" rule — so mobile can't drift. The
 * charts are hand-rolled SVG rather than recharts: these are 40px sparklines,
 * and Today should not pull a chart library into its first paint.
 *
 * The block used to OPEN with a cross-sport totals card (efforts / km / h for
 * the week). It is gone: the "This week" card higher up Today already states
 * the week, and two totals cards on one screen counting different populations
 * under near-identical labels — "5 sessions, 3.2 h" over "3 efforts, 0.9 h" —
 * is a misreading waiting to happen. The week's distance moved into that card
 * as its own column; per-sport figures stay in the lanes, where the lane names
 * the scope.
 */

const C = (v: string) => `var(--color-${v})`;

const ORDER_KEY: Record<LaneOrder, string> = {
  trained: "w.home.end.orderTrained",
  recent: "w.home.end.orderRecent",
  longest: "w.home.end.orderLongest",
};

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em",
  textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
/** The tile's one big number. Shared by the resting figure and the held one, so
 *  a held week can't quietly render at a different size than the week it
 *  replaced. */
const figure: CSSProperties = { ...num, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1 };
const figureUnit: CSSProperties = { fontSize: 10, fontWeight: 400, color: C("ash"), marginLeft: 4 };

/** The week a held point covers, in the tile's own label voice. */
const weekLabel = (t: (k: string) => string, iso: string) =>
  t("chart.weekOf").replace("{date}", iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

/** One rail tile — the cluster's shared skeleton (name row → figure → chart →
 *  footer), and the place the THREE-SLOT RULE is enforced rather than merely
 *  documented:
 *
 *    lane head → the scope of every FIGURE in the lane, said ONCE (see Lane)
 *    label     → the METRIC, one word
 *    foot      → the window of the CHART, with `footRight` for a delta
 *
 *  The middle slot used to carry metric AND figure-scope together, because
 *  there was nowhere else for the scope to go — so a rail printed "Volume –
 *  this week", "Pace – latest week" and "Zones – all time", three compounds per
 *  lane, three lanes deep. Worse, those three scopes were REAL: the tiles were
 *  measuring four different windows, and a rail is a comparison instrument. The
 *  labels were the section apologising in advance for cards that could not be
 *  read across. Giving the lane one window retires the apology and the compound
 *  with it.
 *
 *  `foot` is OPTIONAL and stays empty when the chart already shows its window:
 *  a bar strip draws one countable bar per week, so "8 weeks" under eight bars
 *  is the axis restated in prose. Only a chart with nothing to count (the
 *  pace line) needs the window said out loud.
 *
 *  Fixed width, shared minimum height so a rail's cards sit on one baseline
 *  however differently they're filled. Mirrors mobile.
 *
 *  `bind` makes the WHOLE TILE the target of its own held chart. The strip
 *  inside is 24px tall — a fair chart and an unfair touch target — so the press
 *  lands anywhere on the card while the fraction is still measured against the
 *  drawing (the hook's `plotRef`). Holding swaps the FIGURE for that week's
 *  value and names the week in the FOOT — never in the label, which is the
 *  metric and must not change under a thumb. A tile whose foot is empty at rest
 *  still RESERVES it (`foot=""`), so filling it shifts nothing. */
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
   *  appears on touch would move the chart under the cursor. */
  foot?: string;
  footRight?: ReactNode;
  bind?: ScrubBind;
  children: ReactNode;
}) {
  return (
    <div
      {...(bind ?? {})}
      // One live region for the whole tile, not one per slot: holding changes
      // the FIGURE and the FOOT together ("12.4 km" / "Week of 27 Jul"), and a
      // reader that announces the number without the week has announced half an
      // answer.
      aria-live={bind ? "polite" : undefined}
      style={{
        ...(bind ? SCRUB_STYLE_IN_RAIL : null),
        flex: `0 0 ${w}px`, scrollSnapAlign: "start", minHeight: 118,
        display: "flex", flexDirection: "column", gap: 6,
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: "12px 12px 12px",
      }}
    >
      <span aria-label={a11y} style={{ ...kicker, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {children}
      {(foot !== undefined || footRight) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
          <span style={{ ...num, fontSize: fs.micro, color: C("ash") }}>{foot ?? ""}</span>
          {footRight}
        </div>
      )}
    </div>
  );
}

/** EFFORTS — the count, and the time it took.
 *
 *  It used to be the "all time" tile, carrying three metrics under a label that
 *  named none of them, which is the only reason it needed the `KM` / `TIME` row
 *  keys: with the label spent on the scope, nothing else could say what the two
 *  numbers were. The label is the metric now and the scope is on the lane head,
 *  so the keys have nothing left to do — `2h 27min` is self-evidently a
 *  duration and nothing else in the app is spelled that way.
 *
 *  DISTANCE MOVED OUT, to DistanceTile. Under one window this tile's km and
 *  that tile's figure are the same number, and the bars belong to the one that
 *  owns the metric. Losing it also settles the tile's grammar: it opened as
 *  figure-plus-unit and then switched to a right-flushed key-value table, two
 *  reading directions in the narrowest card on the screen. Size carries the
 *  hierarchy now, which is what should have been carrying it. Mirrors mobile. */
function EffortsTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  return (
    <Tile w={126} label={t("endurance.efforts")}>
      <div style={{ ...figure, color: C("chalk") }}>{lane.efforts}</div>
      <div style={{ display: "grid", gap: 3, marginTop: "auto" }}>
        <span style={{ ...num, fontSize: 13, color: C("chalk") }}>
          {formatDuration(lane.minutes, durationUnits(t))}
        </span>
      </div>
    </Tile>
  );
}

/** DISTANCE — the lane's whole-history kilometres, over the eight weeks that
 *  produced the most recent of them.
 *
 *  The figure used to be THIS WEEK's km, which is what made the rail
 *  incomparable: a total two cards to the left, a week here, a single week's
 *  pace two cards to the right. It reads the lane's own distance now, the same
 *  number the Efforts tile used to print as `KM`, in the tile that owns the
 *  metric and draws its history.
 *
 *  HELD, the FIGURE answers for one week and the FOOT names which. The label
 *  stays "Distance": it is the metric, and a metric that changes under a cursor
 *  is the fault this rewrite exists to fix. The foot is reserved but empty at
 *  rest — the strip DRAWS its window as eight countable bars, so a caption
 *  naming the count would be the axis set in prose, but the row has to be there
 *  or filling it on hold would move the chart. Mirrors mobile. */
function DistanceTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  const scrub = useChartScrub(lane.weeks.length, "band");
  const read = scrub.index >= 0 ? laneVolumeReading(lane, scrub.index) : null;
  return (
    <Tile
      w={178}
      label={t("w.home.end.mDistance")}
      a11y={t("w.home.end.volumeWeek")}
      bind={{ ...scrub.bind, "aria-label": t("w.home.end.volumeWeek") }}
      foot={read ? weekLabel(t, read.weekStart) : ""}
    >
      <div style={{ ...figure, color: read?.best ? "var(--lime-text)" : C("chalk") }}>
        {read ? read.value : lane.distanceKm}
        <span style={figureUnit}>{read ? read.unit : "km"}</span>
      </div>
      <div ref={scrub.plotRef} style={{ marginTop: "auto" }}>
        <HistoryStrip bars={volumeBars(lane.weeks)} color={C("blue")} held={scrub.index} />
      </div>
    </Tile>
  );
}

function TrendTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  const pts = paceTrendPoints(lane.paceTrend);
  const delta = paceDelta(lane.paceTrend);
  const id = `lane-trend-${lane.discipline}`;
  // The tile skeleton (wave 2): label row carries the delta, the current pace
  // is the FIGURE, and the line — the one honest exception to the bar strip
  // (pace is a level over time, not a quantity per week) — draws in the
  // strip's own 24px chart zone so even the exception aligns.
  // 0 → top of the box, so the fastest week sits highest on every discipline.
  const H = 24;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * 100, 3 + p * (H - 6)] as const);
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
      // The foot is the CHART's slot: its window at rest, the held week when a
      // pointer is down. The delta rides beside it because a delta is a fact
      // about the window, not about the lane's all-time figure above.
      foot={read ? weekLabel(t, read.weekStart) : t("w.home.end.window8")}
      bind={{ ...scrub.bind, "aria-label": t("w.home.end.paceLatest") }}
      footRight={delta ? (
        <span style={{ ...num, fontSize: 10, whiteSpace: "nowrap", color: delta.faster ? "var(--lime-text)" : "var(--red-text)" }}>
          {paceDeltaArrow(delta, lane.discipline)} {formatPaceDelta(delta, lane.discipline)}
        </span>
      ) : undefined}
    >
      {/* The lane's ALL-TIME pace at rest — the last figure to join the one
          window. It used to print the newest trend point, which made this the
          third distinct scope in a rail of five cards. Held, it answers for the
          scrubbed week and the foot says which. */}
      <div style={{ ...figure, color: read?.best ? "var(--lime-text)" : C("chalk"), whiteSpace: "nowrap" }}>
        {read ? `${read.value} ${read.unit}` : formatDisciplinePace(lane.paceAllTime ?? lane.paceTrend[lane.paceTrend.length - 1]!, lane.discipline)}
      </div>
      {/* Colours go through `style`, NOT presentation attributes: a var() in
          stroke="…" / stop-color="…" does not resolve (it computes to none /
          black), which is the same trap lib/ui.tsx flags for recharts. */}
      <div ref={scrub.plotRef} style={{ marginTop: "auto" }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: H, overflow: "visible" }} aria-hidden>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: C("blue"), stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: C("blue"), stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <polygon points={`0,${H} ${line} 100,${H}`} fill={`url(#${id})`} />
          <polyline
            points={line} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: C("blue") }}
          />
          {hit && (
            <line
              x1={hit[0]} x2={hit[0]} y1={0} y2={H} strokeWidth={1}
              vectorEffect="non-scaling-stroke" style={{ stroke: C("ash"), opacity: 0.55 }}
            />
          )}
          <circle
            cx={end[0]} cy={end[1]} r={2.4} strokeWidth={1.4} vectorEffect="non-scaling-stroke"
            style={{ fill: C("blue"), stroke: C("ink2") }}
          />
          {hit && (
            <circle
              cx={hit[0]} cy={hit[1]} r={2.8} strokeWidth={1.4} vectorEffect="non-scaling-stroke"
              style={{ fill: C("chalk"), stroke: C("ink2") }}
            />
          )}
        </svg>
      </div>
    </Tile>
  );
}

function ZoneTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  const z = zonePercents(lane.zones);
  // The legend runs DOWN, not across: three zone words side by side blow a
  // rail-width tile apart the moment "Steady" becomes "Stałe"/"Gleichmäßig".
  // Stacked, it survives any language and the percentages align in a column.
  const leg = (label: string, pct: number, c: string) => (
    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C("ash") }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 2, background: c, display: "block", flex: "0 0 auto" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ ...num, marginLeft: "auto", color: C("chalk"), fontWeight: 500 }}>{pct}%</span>
    </div>
  );
  return (
    <Tile w={152} label={t("w.home.end.mZones")} a11y={t("w.home.end.zonesAll")}>
      <div style={{ display: "flex", gap: 2, height: 8, marginTop: "auto" }} aria-hidden>
        {([[z.easy, C("lime")], [z.moderate, C("amber")], [z.hard, C("red")]] as [number, string][]).map(
          ([pct, c]) => pct > 0 && <span key={c} style={{ flex: pct, display: "block", background: c, borderRadius: 2 }} />,
        )}
      </div>
      <div style={{ display: "grid", gap: 3, marginTop: 2 }}>
        {leg(t("running.easy"), z.easy, C("lime"))}
        {leg(t("running.moderate"), z.moderate, C("amber"))}
        {leg(t("running.hard"), z.hard, C("red"))}
      </div>
    </Tile>
  );
}

function LastTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  const e = lane.last!;
  const row = (l: string, r: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...num, fontSize: fs.micro, color: C("ash") }}>
      <span>{l}</span><span>{r}</span>
    </div>
  );
  return (
    <Tile w={184} label={t("w.home.end.last")}>
      <span style={{ fontSize: fs.body, fontWeight: 500, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>
        {e.name}
      </span>
      <div style={{ display: "grid", gap: 3, marginTop: "auto" }}>
        {row(e.distanceKm > 0 ? `${e.distanceKm} km` : "–", e.secPerKm != null ? formatDisciplinePace(e.secPerKm, lane.discipline) : "–")}
        {row(ago(e.startedAt), `${e.minutes} min`)}
      </div>
    </Tile>
  );
}

/**
 * THE LANE-ORDER SELECTOR, in CONTROL form — a bordered chip in ash with a
 * chevron, not accent-coloured text. It cycles rather than opening a menu, so
 * the chip shows the order in force and the chevron says there are others.
 *
 * EXPORTED, because on Today it does not render here. The Endurance cluster's
 * headline row carries it (today.tsx, through GroupMark's `right` slot), which
 * is where the Explore SectionHead grammar puts a head-level control: beside
 * the title, on the same row, never on an orphan row of its own underneath. It
 * used to sit on such a row — right-aligned, floating between the section's
 * opener and its first lane, attached to neither. A control that orders the
 * whole section belongs at the section's altitude.
 *
 * The Endurance SCREEN still renders it internally: its own hero is the
 * headline there, and this block has no head to hang it on. Mirrors mobile.
 */
export function LaneOrderChip({ order, onClick, t }: { order: LaneOrder; onClick: () => void; t: (k: string) => string }) {
  return (
    <button className="pressable"
      onClick={onClick}
      aria-label={`${t("endurance.title")} – ${t(ORDER_KEY[order])}`}
      style={{
        display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
        background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999,
        padding: "4px 9px", color: C("ash"),
      }}
    >
      <span style={kicker}>{t(ORDER_KEY[order])}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano }} aria-hidden>⌄</span>
    </button>
  );
}

function Lane({ lane, onOpen, canOpen }: { lane: EnduranceLane; onOpen?: (d: CardioDiscipline) => void; canOpen: boolean }) {
  const { t } = useLang();
  return (
    <div style={{ marginTop: 16 }}>
      {/* Explore-standard head: display-face title left, no marker dot in front
          of it, and ONE mono fact hard right — the lane's WINDOW.

          It used to carry "8 efforts" (which the tile below restated verbatim)
          and then a "See all ›" that competed with the rail's own tail. Neither
          objection applies to a SCOPE: it is not a figure any tile prints, and
          it is not a second exit. It is the one fact that makes the five
          figures underneath commensurable — and printing it here is what buys
          every tile below a one-word label. The rail used to spend three
          compound labels per lane saying it card by card, and still ended up
          with four different windows in five cards. Mirrors mobile. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note, color: C("chalk"), display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden>{DISCIPLINE_META[lane.discipline].emoji}</span>
          {t(lane.labelKey)}
        </span>
        <span style={{ ...kicker, whiteSpace: "nowrap" }}>{t("w.home.end.scopeAll")}</span>
      </div>
      {/* Full-bleed rail — negative margins the width of the shell gutter pull
          the scroll clip to the true screen edge, with matching inner padding
          so resting tiles stay on the content column. */}
      <div
        style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "none",
          margin: "0 calc(-1 * var(--page-pad-x, 12px))", padding: "2px var(--page-pad-x, 12px) 6px",
        }}
      >
        <EffortsTile lane={lane} t={t} />
        <DistanceTile lane={lane} t={t} />
        {lane.paceTrend.length > 1 && <TrendTile lane={lane} t={t} />}
        {zonePercents(lane.zones).any && <ZoneTile lane={lane} t={t} />}
        {lane.last && <LastTile lane={lane} t={t} />}
        {/* THE EXIT — last thing in the rail, so it's found by the same swipe
            that exhausts the tiles. Chromeless (see rail-tail.tsx): a lane's
            tiles each carry a metric, the exit carries none, so it must not
            draw as a sixth tile that turned out to be blank. `minHeight`
            matches Tile only so the rail keeps one height. */}
        {onOpen && canOpen && (
          <RailTail
            onOpen={() => onOpen(lane.discipline)}
            a11y={`${t("w.explore.seeAll")} – ${t(lane.labelKey)}`}
            w={112} minHeight={118}
          />
        )}
      </div>
    </div>
  );
}

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
    <div style={{ marginTop: 24 }}>
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
          chartreuse stays reserved for "go". Mirrors mobile. */}
      {head && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("endurance.title")}</span>
        {stacked.length > 1 && <LaneOrderChip order={order} onClick={cycle} t={t} />}
      </div>
      )}
      {/* Headless (the Endurance SCREEN, whose hero says the title) still needs
          the control, so it keeps its own row there and nowhere else. */}
      {/* Headless AND uncontrolled — the Endurance SCREEN — keeps its own row,
          because there its hero is the headline and this block has no head to
          hang the chip on. On Today the chip is hoisted to the cluster's
          headline (today.tsx), so `order` arrives controlled and nothing
          renders here. */}
      {!head && !controlled && stacked.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 2px 8px" }}>
          <LaneOrderChip order={order} onClick={cycle} t={t} />
        </div>
      )}

      {shown.map((lane) => <Lane key={lane.discipline} lane={lane} onOpen={onOpen} canOpen={canOpen ? canOpen(lane.discipline) : true} />)}

      {/* The block's END CONTROL — an EXPANDER, so it wears the expander
          grammar, not the door's (see week-verdict's DoorRow): chromeless
          like every end-of-thing affordance, but a BARE ＋/− with no ring,
          because the ring is what promises a screen and this only grows the
          block in place. The count drops chartreuse for ash with the fill —
          the accent is the "go" colour, and this control never goes
          anywhere. Mirrors mobile. */}
      {rest > 0 && (
        <button className="pressable"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          style={{
            display: "flex", width: "calc(100% - 4px)", margin: "14px 2px 0", alignItems: "center",
            gap: 12, cursor: "pointer", textAlign: "left", color: C("chalk"),
            background: "none", border: "none", padding: "4px 0",
          }}
        >
          <span style={{
            width: 32, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18, color: C("ash"), flex: "0 0 32px",
          }} aria-hidden>{expanded ? "−" : "＋"}</span>
          <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg }}>
            {expanded ? t("w.home.end.fewer") : t("w.home.end.allSports")}
          </span>
          <span style={{ ...num, fontSize: fs.micro, color: C("ash") }}>{expanded ? "−" : "+"}{rest}</span>
        </button>
      )}
    </div>
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
 * will be. Mirrors mobile.
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
