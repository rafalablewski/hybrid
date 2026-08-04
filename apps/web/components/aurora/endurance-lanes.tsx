"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  enduranceLanes, orderLanes, nextLaneOrder, zonePercents,
  paceDelta, formatPaceDelta, paceDeltaArrow, paceTrendPoints, volumeBars, formatDisciplinePace,
  DISCIPLINE_META, LANE_CAP, ago,
  type CardioDiscipline, type EnduranceLane, type LaneOrder, type LoggedSession,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import HistoryStrip from "./history-strip";

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
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em",
  textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

/** One rail tile — the cluster's shared skeleton (name row → figure → chart →
 *  footer). Fixed width, shared minimum height so a rail's cards sit on one
 *  baseline however differently they're filled. `right` rides the name row
 *  (a delta, a qualifier) — the same slot the exercises tiles use. */
function Tile({ w, label, right, children }: { w: number; label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        flex: `0 0 ${w}px`, scrollSnapAlign: "start", minHeight: 118,
        display: "flex", flexDirection: "column", gap: 6,
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: "12px 12px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={kicker}>{label}</span>
        {right}
      </div>
      {children}
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
    <Tile w={126} label={t("endurance.efforts")}>
      <div style={{ ...num, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk") }}>
        {lane.efforts}
      </div>
      <div style={{ display: "grid", gap: 3, marginTop: "auto" }}>
        {row("KM", String(lane.distanceKm))}
        {row("H", String(Math.round(lane.minutes / 6) / 10))}
      </div>
    </Tile>
  );
}

function VolumeTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  // The tile skeleton (wave 2): label row → this week's km as the FIGURE →
  // the shared HistoryStrip as the chart → the window as the footer. The old
  // 46px one-off bar block is retired for the cluster's one chart language.
  return (
    <Tile w={178} label={t("w.home.exw.volume")}>
      <div style={{ ...num, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1, color: C("chalk") }}>
        {lane.thisWeek.km}
        <span style={{ fontSize: 10, fontWeight: 400, color: C("ash"), marginLeft: 4 }}>km</span>
      </div>
      <div style={{ marginTop: "auto" }}>
        <HistoryStrip bars={volumeBars(lane.weeks)} color={C("blue")} />
      </div>
      <span style={{ ...num, fontSize: fs.micro, color: C("ash") }}>{t("w.home.end.window8")}</span>
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
      label={t("session.paceTrend")}
      right={delta ? (
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
      <span style={{ ...num, fontSize: fs.micro, color: C("ash") }}>{t("w.home.end.window8")}</span>
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
    <Tile w={152} label={t("w.home.end.zones")}>
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
      <span style={{ ...kicker, fontSize: 10 }}>{t(ORDER_KEY[order])}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }} aria-hidden>⌄</span>
    </button>
  );
}

function Lane({ lane, onOpen, canOpen }: { lane: EnduranceLane; onOpen?: (d: CardioDiscipline) => void; canOpen: boolean }) {
  const { t } = useLang();
  return (
    <div style={{ marginTop: 16 }}>
      {/* Explore-standard head: display-face title left, mono meta right, no
          marker dot in front of it. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note, color: C("chalk"), display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden>{DISCIPLINE_META[lane.discipline].emoji}</span>
          {t(lane.labelKey)}
        </span>
        {/* Identity on the left, the EXIT on the right — and nothing else. The
            header used to carry "8 efforts" as well, which is `lane.efforts`
            read twice 40dp apart: the summary tile directly below is the same
            field under the same mono face. A header names the lane; the rail
            owns the figures. Mirrors mobile. */}
        {onOpen && canOpen && (
          <button className="pressable"
            onClick={() => onOpen(lane.discipline)}
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)" }}
          >
            {t("w.explore.seeAll")} ›
          </button>
        )}
      </div>
      {/* Full-bleed rail — negative margins the width of the shell gutter pull
          the scroll clip to the true screen edge, with matching inner padding
          so resting tiles stay on the content column. */}
      <div
        style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "none",
          margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "2px var(--page-pad-x, 16px) 6px",
        }}
      >
        <SummaryTile lane={lane} t={t} />
        <VolumeTile lane={lane} t={t} />
        {lane.paceTrend.length > 1 && <TrendTile lane={lane} t={t} />}
        {zonePercents(lane.zones).any && <ZoneTile lane={lane} t={t} />}
        {lane.last && <LastTile lane={lane} t={t} />}
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

      {/* The block's exit, in the DOOR-ROW anatomy (the This-week card's
          idiom): full-width blocks end in a door, rails end in a trailing
          ghost tile — the cluster's one "see more" rule. The old bare "+N"
          outline button is retired. */}
      {rest > 0 && (
        <button className="pressable"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          style={{
            display: "flex", width: "calc(100% - 4px)", margin: "12px 2px 0", alignItems: "center",
            gap: 12, cursor: "pointer", textAlign: "left", color: C("chalk"),
            background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px",
          }}
        >
          <span style={{
            width: 32, height: 32, borderRadius: 12, background: C("ink"),
            border: `1px solid ${C("line")}`, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 13, color: C("ash"), flex: "0 0 32px",
          }} aria-hidden>{expanded ? "−" : "＋"}</span>
          <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg }}>
            {expanded ? t("w.home.end.fewer") : t("w.home.end.allSports")}
          </span>
          <span style={{ ...num, fontSize: fs.micro, color: "var(--lime-text)" }}>{expanded ? "−" : "+"}{rest}</span>
        </button>
      )}
    </div>
  );
}
