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

/**
 * SPORT LANES — the Endurance block at the bottom of Today (web), the TWIN of
 * components/aurora/endurance-lanes.tsx on mobile.
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
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".1em",
  textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

/** One rail tile. Fixed width, shared minimum height so a rail's cards sit on
 *  one baseline however differently they're filled. */
function Tile({ w, label, children }: { w: number; label: string; children: ReactNode }) {
  return (
    <div
      style={{
        flex: `0 0 ${w}px`, scrollSnapAlign: "start", minHeight: 118,
        display: "flex", flexDirection: "column", gap: 6,
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: "11px 12px 12px",
      }}
    >
      <span style={kicker}>{label}</span>
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
  const bars = volumeBars(lane.weeks);
  return (
    <Tile w={178} label={t("w.home.exw.volume")}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 46, marginTop: "auto" }} aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            style={{
              flex: 1, display: "block", borderRadius: "3px 3px 0 0",
              height: Math.max(3, Math.round(h * 46)),
              background: i === bars.length - 1 ? C("blue") : `color-mix(in srgb, ${C("blue")} 34%, transparent)`,
            }}
          />
        ))}
      </div>
      <span style={{ ...num, fontSize: fs.micro, color: C("ash") }}>
        {lane.thisWeek.km} km {t("w.home.end.thisWeek").toLowerCase()}
      </span>
    </Tile>
  );
}

function TrendTile({ lane, t }: { lane: EnduranceLane; t: (k: string) => string }) {
  const pts = paceTrendPoints(lane.paceTrend);
  const delta = paceDelta(lane.paceTrend);
  const id = `lane-trend-${lane.discipline}`;
  // 0 → top of the box, so the fastest week sits highest on every discipline.
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * 100, 4 + p * 30] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const end = xy[xy.length - 1]!;
  return (
    <Tile w={176} label={t("session.paceTrend")}>
      {/* Colours go through `style`, NOT presentation attributes: a var() in
          stroke="…" / stop-color="…" does not resolve (it computes to none /
          black), which is the same trap lib/ui.tsx flags for recharts. */}
      <svg viewBox="0 0 100 38" preserveAspectRatio="none" style={{ width: "100%", height: 38, marginTop: "auto", overflow: "visible" }} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: C("blue"), stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: C("blue"), stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <polygon points={`0,38 ${line} 100,38`} fill={`url(#${id})`} />
        <polyline
          points={line} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: C("blue") }}
        />
        <circle
          cx={end[0]} cy={end[1]} r={2.4} strokeWidth={1.4} vectorEffect="non-scaling-stroke"
          style={{ fill: C("blue"), stroke: C("ink2") }}
        />
      </svg>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={{ ...num, fontSize: fs.bodyLg, fontWeight: 500, color: C("chalk"), whiteSpace: "nowrap" }}>
          {formatDisciplinePace(lane.paceTrend[lane.paceTrend.length - 1]!, lane.discipline)}
        </span>
        {delta && (
          <span style={{ ...num, fontSize: 9.5, whiteSpace: "nowrap", color: delta.faster ? "var(--lime-text)" : "var(--red-text)" }}>
            {paceDeltaArrow(delta, lane.discipline)} {formatPaceDelta(delta, lane.discipline)}
          </span>
        )}
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

function Lane({ lane, onOpen }: { lane: EnduranceLane; onOpen?: (d: CardioDiscipline) => void }) {
  const { t } = useLang();
  return (
    <div style={{ marginTop: 16 }}>
      {/* Explore-standard head: display-face title left, mono meta right, no
          marker dot in front of it. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note, color: C("chalk"), display: "flex", alignItems: "center", gap: 7 }}>
          <span aria-hidden>{DISCIPLINE_META[lane.discipline].emoji}</span>
          {t(lane.labelKey)}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ ...kicker, fontSize: 9.5 }}>{lane.efforts} {t("endurance.efforts")}</span>
          {onOpen && (
            <button
              onClick={() => onOpen(lane.discipline)}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)" }}
            >
              {t("w.explore.seeAll")} ›
            </button>
          )}
        </span>
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
}: {
  sessions: LoggedSession[];
  onOpen?: (discipline: CardioDiscipline) => void;
}) {
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

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("endurance.title")}</span>
        <button
          onClick={() => setOrder(nextLaneOrder(order))}
          aria-label={`${t("endurance.title")} – ${t(ORDER_KEY[order])}`}
          style={{
            background: "none", border: 0, padding: "4px 0", cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em",
            textTransform: "uppercase", color: "var(--lime-text)",
          }}
        >
          {t(ORDER_KEY[order])} ↓
        </button>
      </div>

      {shown.map((lane) => <Lane key={lane.discipline} lane={lane} onOpen={onOpen} />)}

      {rest > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "flex", width: "calc(100% - 4px)", margin: "12px 2px 0", alignItems: "center",
            justifyContent: "space-between", gap: 10, cursor: "pointer",
            background: "none", border: `1px solid ${C("line")}`, borderRadius: 14, padding: "10px 14px",
            fontFamily: "var(--font-display)", fontSize: fs.body, fontWeight: 500, color: C("ash"),
          }}
        >
          {expanded ? t("w.home.end.fewer") : t("w.home.end.allSports")}
          <span style={{ ...num, fontSize: fs.micro, color: "var(--lime-text)" }}>{expanded ? "−" : "+"}{rest}</span>
        </button>
      )}
    </div>
  );
}
