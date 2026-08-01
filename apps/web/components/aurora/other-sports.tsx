"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  otherSportLanes, otherSportTotals, sportWeekBars, OTHER_SPORT_CAP, ago,
  type LoggedSession, type OtherSportLane,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

/**
 * OTHER SPORTS — the block directly under Endurance on Today (web), the TWIN of
 * components/aurora/other-sports.tsx on mobile.
 *
 * Tennis, squash, five-a-side: everything logged as `discipline: "sport"`, the
 * bucket ENDURANCE_DISCIPLINES deliberately excludes. It counted towards the
 * week's sessions and hours and then had nowhere to appear. Now it does.
 *
 * ONE TILE PER SPORT, NOT ONE RAIL PER SPORT. These sports are TIMED — the
 * catalog gives tennis and squash `metrics: TIME`, so there is no distance, no
 * pace and no zones to spread across five cards. Endurance spends its width on
 * the DEPTH of each discipline; this block spends the same width on the NUMBER
 * of sports, which is the shape the data actually has. Inventing a pace for a
 * squash match to fill a rail would be fabricating a metric the sport doesn't
 * have.
 *
 * Same full-bleed rail idiom as the exercise widget and the endurance lanes:
 * negative margins the width of the shell gutter, matching inner padding, so
 * tiles slide under the true screen edge and resting tiles still line up with
 * the content column.
 *
 * Every figure comes from @hybrid/core other-sports.ts — the grouping, the
 * ordering, the 8-week buckets — so mobile can't drift.
 */

const C = (v: string) => `var(--color-${v})`;

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".1em",
  textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

export default function AuroraOtherSports({
  sessions,
  onOpen,
}: {
  sessions: LoggedSession[];
  onOpen?: (sport: string) => void;
}) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);

  const lanes = useMemo(() => otherSportLanes(sessions), [sessions]);
  // No sport logged → no block. A lane exists because something is in it, which
  // is why no tile needs an empty state of its own.
  if (lanes.length === 0) return null;

  const totals = otherSportTotals(lanes);
  const shown = expanded ? lanes : lanes.slice(0, OTHER_SPORT_CAP);
  const rest = lanes.length - OTHER_SPORT_CAP;

  return (
    <div style={{ marginTop: 26 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          meta reports the block so the athlete doesn't add up tiles. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("w.home.other.title")}</span>
        <span style={kicker}>{totals.sports} {t("w.home.other.sports")}</span>
      </div>

      <div
        style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "none",
          margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "2px var(--page-pad-x, 16px) 6px",
        }}
      >
        {shown.map((lane) => <SportTile key={lane.sport} lane={lane} t={t} onOpen={onOpen} />)}
        {/* The rail's exit — a trailing ghost tile (the exercises rail's ＋ card
            idiom): rails end in a ghost tile, full-width blocks end in a door
            row — the cluster's one "see more" rule. The old full-width "+N"
            outline button below the rail is retired; its count lives here. */}
        {rest > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            style={{
              flex: "0 0 110px", scrollSnapAlign: "start", minHeight: 132, cursor: "pointer",
              display: "grid", placeItems: "center", alignContent: "center", gap: 8,
              background: "none", border: `1px dashed color-mix(in srgb, ${C("ash")} 40%, transparent)`, borderRadius: 16,
              fontFamily: "var(--font-mono)", fontSize: fs.micro, textAlign: "center", lineHeight: 1.5,
            }}
          >
            <span style={{ fontSize: 18, color: C("ash") }} aria-hidden>{expanded ? "−" : "＋"}</span>
            <span style={{ fontWeight: 600, color: "var(--lime-text)" }}>
              {expanded ? t("w.home.other.fewer") : t("w.home.other.all")} {expanded ? `−${rest}` : `+${rest}`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/** One sport. Efforts as the headline, hours beneath, an 8-week frequency
 *  strip, and when it was last played — the four things a timed sport can
 *  honestly say about itself. */
function SportTile({ lane, t, onOpen }: { lane: OtherSportLane; t: (k: string) => string; onOpen?: (sport: string) => void }) {
  const bars = sportWeekBars(lane.weeks);
  const hours = Math.round(lane.minutes / 6) / 10;
  const interactive = !!onOpen;

  return (
    <button
      onClick={onOpen ? () => onOpen(lane.sport) : undefined}
      aria-label={lane.sport}
      disabled={!interactive}
      style={{
        flex: "0 0 150px", scrollSnapAlign: "start", minHeight: 132,
        display: "flex", flexDirection: "column", gap: 7, textAlign: "left",
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: "11px 12px 12px",
        cursor: interactive ? "pointer" : "default", color: C("chalk"),
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span aria-hidden style={{ fontSize: 13 }}>{lane.icon}</span>
        <span style={{
          flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{lane.sport}</span>
      </span>

      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ ...num, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1 }}>{lane.efforts}</span>
        <span style={kicker}>{t("w.home.other.efforts")}</span>
      </span>

      {/* Eight weeks of frequency. Violet is the app's non-endurance channel —
          teal already means cardio on the lanes directly above this block. */}
      <span style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 26, marginTop: "auto" }} aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            style={{
              flex: 1, display: "block", borderRadius: 2,
              height: Math.max(3, Math.round(h * 26)),
              background: i === bars.length - 1 ? C("violet") : `color-mix(in srgb, ${C("violet")} 34%, transparent)`,
            }}
          />
        ))}
      </span>

      <span style={{ display: "flex", justifyContent: "space-between", gap: 6, ...num, fontSize: 9.5, color: C("ash") }}>
        <span>{hours} h</span>
        <span>{ago(lane.lastAt)}</span>
      </span>
    </button>
  );
}
