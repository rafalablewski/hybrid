"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  enduranceLanes, orderLanes, nextLaneOrder, zonePercents,
  paceDelta, formatPaceDelta, paceDeltaArrow, paceTrendPoints, volumeBars, formatDisciplinePace,
  DISCIPLINE_META, LANE_CAP, ago, durationUnits, formatDuration,
  type CardioDiscipline, type EnduranceLane, type LaneOrder, type LoggedSession,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
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

/** One rail tile — the cluster's shared skeleton (name row → figure → chart →
 *  footer), and the place the SCOPE RULE is enforced rather than merely
 *  documented:
 *
 *    label  → the metric AND the scope of the FIGURE this tile prints
 *    foot   → the window of the CHART, with `footRight` for a delta
 *
 *  Both slots are the Tile's own, so a caller cannot put the window in the
 *  label (as VolumeTile did — "Volume – 8 weeks" over a footer reading
 *  "8 weeks", twice in one 178px tile, while the figure between them was THIS
 *  WEEK'S km and said so nowhere). The old free `right` slot on the name row is
 *  gone with it; its only consumer was the pace delta, which is a fact about
 *  the chart's window and belongs beside it.
 *
 *  `foot` is OPTIONAL and stays empty when the chart already shows its window:
 *  a bar strip draws one countable bar per week, so "8 weeks" under eight bars
 *  is the axis restated in prose. Only a chart with nothing to count (the
 *  pace line) needs the window said out loud.
 *
 *  Fixed width, shared minimum height so a rail's cards sit on one baseline
 *  however differently they're filled. Mirrors mobile. */
function Tile({ w, label, foot, footRight, children }: {
  w: number; label: string; foot?: string; footRight?: ReactNode; children: ReactNode;
}) {
  return (
    <div
      style={{
        flex: `0 0 ${w}px`, scrollSnapAlign: "start", minHeight: 118,
        display: "flex", flexDirection: "column", gap: 6,
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: "12px 12px 12px",
      }}
    >
      <span style={{ ...kicker, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {children}
      {(foot || footRight) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
          <span style={{ ...num, fontSize: fs.micro, color: C("ash") }}>{foot ?? ""}</span>
          {footRight}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  const row = (k: string, v: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...num, fontSize: fs.micro }}>
      <span style={{ color: C("ash") }}>{k}</span>
      <span style={{ color: C("chalk"), fontWeight: 500 }}>{v}</span>
    </div>
  );
  return (
    <Tile w={126} label={t("w.home.end.scopeAll")}>
      {/* The figure carries "efforts" as its UNIT — the same shape the Other
          sports tile uses — because the label is now saying the scope. The
          header above the rail used to print this same count. */}
      <div style={{ ...num, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk") }}>
        {lane.efforts}
        <span style={{ fontSize: 10, fontWeight: 400, color: C("ash"), marginLeft: 4 }}>{t("endurance.efforts").toLowerCase()}</span>
      </div>
      <div style={{ display: "grid", gap: 3, marginTop: "auto" }}>
        {row("KM", String(lane.distanceKm))}
        {/* TIME, not "H": the figure is hours AND minutes now, so the row's
            label names the quantity rather than repeating the unit inside it. */}
        {row("TIME", formatDuration(lane.minutes, durationUnits(t)))}
      </div>
    </Tile>
  );
}

function VolumeTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  // The tile skeleton (wave 2): label row → this week's km as the FIGURE →
  // the shared HistoryStrip as the chart. The old 46px one-off bar block is
  // retired for the cluster's one chart language.
  //
  // NO "8 weeks" FOOTER. The strip DRAWS its window: eight discrete bars, one
  // per week, countable at a glance — so a caption naming the count is the
  // chart's own axis set in words. It goes where the window is NOT visible
  // (TrendTile, whose line has no per-week marks to count), and nowhere else.
  return (
    <Tile w={178} label={t("w.home.end.volumeWeek")}>
      <div style={{ ...num, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk") }}>
        {lane.thisWeek.km}
        <span style={{ fontSize: 10, fontWeight: 400, color: C("ash"), marginLeft: 4 }}>km</span>
      </div>
      <div style={{ marginTop: "auto" }}>
        <HistoryStrip bars={volumeBars(lane.weeks)} color={C("blue")} />
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
  return (
    <Tile
      w={176}
      label={t("w.home.end.paceLatest")}
      foot={t("w.home.end.window8")}
      footRight={delta ? (
        <span style={{ ...num, fontSize: 10, whiteSpace: "nowrap", color: delta.faster ? "var(--lime-text)" : "var(--red-text)" }}>
          {paceDeltaArrow(delta, lane.discipline)} {formatPaceDelta(delta, lane.discipline)}
        </span>
      ) : undefined}
    >
      <div style={{ ...num, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk"), whiteSpace: "nowrap" }}>
        {formatDisciplinePace(lane.paceTrend[lane.paceTrend.length - 1]!, lane.discipline)}
      </div>
      {/* Colours go through `style`, NOT presentation attributes: a var() in
          stroke="…" / stop-color="…" does not resolve (it computes to none /
          black), which is the same trap lib/ui.tsx flags for recharts. */}
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, marginTop: "auto", overflow: "visible" }} aria-hidden>
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
        <circle
          cx={end[0]} cy={end[1]} r={2.4} strokeWidth={1.4} vectorEffect="non-scaling-stroke"
          style={{ fill: C("blue"), stroke: C("ink2") }}
        />
      </svg>
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
    <Tile w={152} label={t("w.home.end.zonesAll")}>
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

/** The lane-order selector, in CONTROL form — a bordered chip in ash with a
 *  chevron, not accent-coloured text. It cycles rather than opening a menu, so
 *  the chip shows the order in force and the chevron says there are others.
 *  Mirrors mobile. */
function OrderChip({ order, onClick, t }: { order: LaneOrder; onClick: () => void; t: (k: string) => string }) {
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
          of it — and NOTHING on the right.

          The head used to carry "8 efforts" (which the summary tile below
          restates verbatim) and then, after that went, the lane's "See all ›".
          Both are gone: a header NAMES the lane, the rail owns the figures, and
          the rail's own tail card owns the exit. Three lanes down Today meant
          three lime links stacked on one screen, each pointing somewhere
          different, none of them where the thumb actually is when the cards run
          out. Mirrors mobile. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note, color: C("chalk"), display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden>{DISCIPLINE_META[lane.discipline].emoji}</span>
          {t(lane.labelKey)}
        </span>
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
        <SummaryTile lane={lane} t={t} />
        <VolumeTile lane={lane} t={t} />
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
}) {
  const { t } = useLang();
  const [order, setOrder] = useState<LaneOrder>("trained");
  const [expanded, setExpanded] = useState(false);

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
        {stacked.length > 1 && <OrderChip order={order} onClick={() => setOrder(nextLaneOrder(order))} t={t} />}
      </div>
      )}
      {/* Headless (the Endurance SCREEN, whose hero says the title) still needs
          the control, so it keeps its own row there and nowhere else. */}
      {!head && stacked.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 2px 8px" }}>
          <OrderChip order={order} onClick={() => setOrder(nextLaneOrder(order))} t={t} />
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
