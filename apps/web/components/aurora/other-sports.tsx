"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  otherSportLanes, sportWeekBars, OTHER_SPORT_CAP, ago,
  parentageHours, progressParentage,
  type LoggedSession, type OtherSportLane,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import HistoryStrip from "./history-strip";

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
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em",
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
  // WAVE-3 PARENTAGE: the head quotes the sports' share of the time the
  // ENDURANCE summary card above it prints — the slice these tiles break down
  // per sport. Same activitySummary, same week range (core
  // progress-parentage.ts). The denominator used to be the whole week's hours,
  // which was right while this block sat under the This-week card; inside a
  // section headed by a card reading "3.2 h", a lifting-inclusive "5.2 h"
  // reads as that card's total and contradicts it.
  const parentage = useMemo(() => progressParentage(sessions), [sessions]);
  // No sport logged → no block. A lane exists because something is in it, which
  // is why no tile needs an empty state of its own.
  if (lanes.length === 0) return null;

  const shown = expanded ? lanes : lanes.slice(0, OTHER_SPORT_CAP);
  const rest = lanes.length - OTHER_SPORT_CAP;

  return (
    <div style={{ marginTop: 24 }}>
      {/* Explore-standard head: display-face title left, ONE mono fact right —
          the wave-3 parentage quote ("1.5 of 3.2 h this week"), naming this
          block's slice of the endurance card's TIME figure above it. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("w.home.other.title")}</span>
        <span style={kicker}>
          {t("w.home.group.metaOf").replace("{a}", String(parentageHours(parentage.sportMinutes))).replace("{b}", String(parentageHours(parentage.enduranceMinutes)))}
        </span>
      </div>

      <div
        style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "none",
          margin: "0 calc(-1 * var(--page-pad-x, 12px))", padding: "2px var(--page-pad-x, 12px) 6px",
        }}
      >
        {shown.map((lane) => <SportTile key={lane.sport} lane={lane} t={t} onOpen={onOpen} />)}
        {/* The rail's END CONTROL — and it is an EXPANDER, not a door: it grows
            the rail in place rather than opening a screen, which is why it
            keeps ＋/− instead of taking the shared RailTail's arrow. An arrow
            here would promise a destination that doesn't exist.
            CHROMELESS like the tail, though (see rail-tail.tsx): it used to be
            a DASHED box copied from the exercises rail's ＋ tile, and that tile
            is gone — a dashed box reads as an empty slot, and chartreuse is the
            reserved "go" colour, not the colour of a standing control. Glyph
            and label on the ink, ash like every other end-of-rail affordance;
            the ring is what separates a door from an expander. Mirrors mobile. */}
        {rest > 0 && (
          <button className="pressable"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            style={{
              flex: "0 0 110px", scrollSnapAlign: "start", minHeight: 132, cursor: "pointer",
              display: "grid", placeItems: "center", alignContent: "center", gap: 8,
              background: "none", border: "none",
              fontFamily: "var(--font-mono)", fontSize: fs.micro, textAlign: "center", lineHeight: 1.5,
            }}
          >
            <span style={{ fontSize: 18, color: C("ash") }} aria-hidden>{expanded ? "−" : "＋"}</span>
            <span style={{ fontWeight: 600, color: C("ash") }}>
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
    <button className="pressable"
      onClick={onOpen ? () => onOpen(lane.sport) : undefined}
      aria-label={lane.sport}
      disabled={!interactive}
      style={{
        flex: "0 0 150px", scrollSnapAlign: "start", minHeight: 132,
        display: "flex", flexDirection: "column", gap: 8, textAlign: "left",
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: "12px 12px 12px",
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

      {/* Eight weeks of frequency in the cluster's shared HistoryStrip. Violet
          is the app's non-endurance channel — teal already means cardio on the
          lanes directly above this block. */}
      <span style={{ display: "block", width: "100%", marginTop: "auto" }}>
        <HistoryStrip bars={bars} color={C("violet")} />
      </span>

      <span style={{ display: "flex", justifyContent: "space-between", gap: 6, ...num, fontSize: 10, color: C("ash") }}>
        <span>{hours} h</span>
        <span>{ago(lane.lastAt)}</span>
      </span>
    </button>
  );
}
