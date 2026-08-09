"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  fmtWeight, prsBetween, splitFigure, strengthPrProof,
  type ActivityRange, type BodyweightInput, type LoggedSession, type PrHit, type WeightUnit,
} from "@hybrid/core";
import { fs, accentText } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

/**
 * RECORDS — the Progress cluster's own block (web). The TWIN of
 * components/aurora/period-records.tsx on mobile.
 *
 * These used to sit on the Performance tab's "Your week" card, computed over a
 * ROLLING seven days while the Today card counted a real calendar week — two
 * cards one tab apart, both labelled as the week, reporting different numbers.
 * A PR belongs to the period it happened in, so it belongs to whatever window
 * the Progress filter is showing, which is why the range arrives as a prop
 * rather than being resolved here.
 *
 * It then spent a while as a mono kicker in the verdict card's foot. Progress
 * now reads as three named things — This week, Records, Exercises — so the
 * block takes the same Explore-standard head its neighbours wear: display-face
 * title left, the window as mono meta right (a "Records" with no window would
 * read as all-time), with the count joining it once the cells become a rail.
 * Silent when the period holds none: an empty celebration is not a celebration.
 */

const C = (v: string) => `var(--color-${v})`;

/** Records shown before the rail offers "Show all" — a year can hold forty,
 *  and an endless drag is not a celebration. */
const PRS_RAIL_CAP = 8;
/** The width of the edge dissolve, in px. Mirrored on mobile. */
const PRS_FADE = 24;

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em",
  textTransform: "uppercase", whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

/**
 * ONE RECORD, set as a FIGURE — not the list row this used to be.
 *
 * The block used to be four hairlines around two 12px rows: a section rule, a
 * rule under the header and one above every record, fencing content inside a
 * card that already has a border. Whitespace separates two items perfectly
 * well, so the rules went and the budget was spent on the two things a record
 * actually needs — SCALE (the load at fs.display, the largest figure in the
 * cluster, because a personal best is the only thing on Today worth
 * celebrating) and PROOF (the load it beat, which is what makes 90 kg an
 * achievement rather than a fact).
 *
 * The proof's three shapes come from core's strengthPrProof, so this and the
 * session summary can't drift, and it arrives SPLIT — "from 82.5" reads in ash
 * and only the gain takes the accent, which a single joined string could not
 * express. The value is bare because the unit is on the figure above it.
 *
 * Pressable when the hit knows its session: the cluster's whole promise is that
 * a figure opens what's behind it, and a record is no exception.
 */
function PrCell({ pr, units, t, onOpen }: {
  pr: PrHit;
  units: WeightUnit;
  t: (k: string) => string;
  onOpen?: () => void;
}) {
  const [value, unit] = splitFigure(fmtWeight(pr.topLoad, units));
  const proof = strengthPrProof(pr, units);
  const body = (
    <>
      <span style={{ display: "block", ...kicker, color: C("ash"), overflow: "hidden", textOverflow: "ellipsis" }}>{pr.lift}</span>
      <span style={{
        display: "block", ...num, fontSize: fs.display, fontWeight: 800,
        letterSpacing: "-.03em", lineHeight: 1, marginTop: 7, color: accentText("lime"),
      }}>
        {value}
        <i style={{ fontStyle: "normal", fontSize: ".46em", fontWeight: 600, letterSpacing: ".04em", marginLeft: 3 }}>{unit}</i>
      </span>
      <span style={{
        display: "block", marginTop: 6, fontSize: fs.micro, color: C("ash"),
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {proof.kind === "climb" ? (
          <>
            {t("w.home.act.prFrom").replace("{v}", proof.from ?? "")}{" "}
            <em style={{ fontStyle: "normal", color: accentText("lime") }}>{proof.delta}</em>
          </>
        ) : t(proof.kind === "first" ? "w.home.act.prFirst" : "w.home.act.prReps")}
      </span>
    </>
  );

  if (!onOpen) return <div style={{ minWidth: 0 }}>{body}</div>;
  return (
    <button
      className="pressable"
      onClick={onOpen}
      aria-label={`${pr.lift} – ${fmtWeight(pr.topLoad, units)} – ${t("w.home.act.prOpen")}`}
      style={{
        display: "block", width: "100%", minWidth: 0, textAlign: "left",
        background: "none", border: "none", padding: 0, margin: 0,
        color: "inherit", cursor: "pointer",
      }}
    >
      {body}
    </button>
  );
}

export default function PeriodRecords({
  sessions,
  range,
  /** The window's name, as the head above it prints it — one source, so the
   *  card and this block can never disagree about which period is in force. */
  windowName,
  units,
  bw,
  onSession,
}: {
  sessions: LoggedSession[];
  range: ActivityRange;
  windowName: string;
  units: WeightUnit;
  bw?: BodyweightInput;
  onSession?: (id: string) => void;
}) {
  const { t } = useLang();
  const rail = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ l: 0, r: 0 });
  const [allPrs, setAllPrs] = useState(false);

  const prs = useMemo(() => prsBetween(sessions, range.from, range.through + 1, bw), [sessions, range, bw]);
  const shownPrs = allPrs ? prs : prs.slice(0, PRS_RAIL_CAP);

  // A new period is a new set of records — an expanded rail must not carry over.
  useEffect(() => { setAllPrs(false); }, [range.id]);

  // THE EDGE DISSOLVE, written from the scroll offset: an edge fades only while
  // records are hidden behind it, and an edge with nothing past it stays crisp.
  // A fade on both sides at all times would be decoration; this is a status.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const paint = () => {
      const max = el.scrollWidth - el.clientWidth;
      setFade({ l: el.scrollLeft > 4 ? PRS_FADE : 0, r: max - el.scrollLeft > 4 ? PRS_FADE : 0 });
    };
    paint();
    el.addEventListener("scroll", paint, { passive: true });
    window.addEventListener("resize", paint);
    return () => { el.removeEventListener("scroll", paint); window.removeEventListener("resize", paint); };
  }, [shownPrs.length]);

  if (prs.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      {/* Explore-standard head. The right slot carries the WINDOW — a block
          headed "Records" with no period would read as all-time — and, from
          three up, the count. A6: the count is a fact only when the reader
          cannot do the counting; with one or two records both cells sit side by
          side on one row, so a "2" beside them restates what is already in
          view. From three up they are a RAIL — you cannot count what you have
          to scroll — so the total earns its place, and past PRS_RAIL_CAP the
          trailing "Show all {n}" cell carries it too. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("w.home.act.recordsTitle")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...kicker, fontSize: fs.micro, letterSpacing: ".08em", color: C("ash") }}>{windowName}</span>
          {prs.length > 2 && (
            <span style={{ ...num, fontSize: fs.micro, color: accentText("lime") }}>{prs.length}</span>
          )}
        </span>
      </div>

      {prs.length < 3 ? (
        /* ONE OR TWO — the figures sit still. No rail, no fade, nothing to
           drag: a rail that cannot move is worse than no rail. A single record
           takes the full width rather than leaving half a row empty. */
        <div style={{
          display: "grid", gridTemplateColumns: prs.length === 1 ? "1fr" : "1fr 1fr",
          gap: 14,
        }}>
          {prs.map((pr) => (
            <PrCell key={pr.lift} pr={pr} units={units} t={t}
              onOpen={onSession && pr.sessionId ? () => onSession(pr.sessionId!) : undefined} />
          ))}
        </div>
      ) : (
        /* THREE AND UP — the same cells become a rail.
         *
         * This block sits DIRECTLY ON THE SCREEN, so the rail is full-bleed:
         * the negative margins are the width of the screen gutter and the
         * padding matches, exactly as the exercise-widget rail does it. Cards
         * slide under the physical screen edge instead of clipping at the
         * content column with the gutter showing beside a cut cell.
         *
         * A cell is HALF THE CONTENT COLUMN — the same width the two-up grid
         * gives it — so going from two records to three doesn't resize
         * anything: the third simply appears past the right edge. That peek is
         * the whole affordance, which is why there are no arrows, no dot row
         * and no "swipe" label. Flex percentages resolve against the content
         * box, which the matching padding makes exactly the column.
         *
         * Snap is PROXIMITY, not mandatory: a flick lands cleanly, a small drag
         * is left where it was put. */
        <div
          ref={rail}
          className="pr-rail"
          tabIndex={0}
          role="group"
          aria-label={`${t("w.home.act.recordsTitle")} – ${windowName} – ${prs.length}`}
          style={{
            display: "flex", gap: 14, overflowX: "auto",
            scrollSnapType: "x proximity",
            margin: "0 calc(-1 * var(--page-pad-x, 12px))",
            padding: "0 var(--page-pad-x, 12px) 2px",
            "--pr-fade-l": `${fade.l}px`, "--pr-fade-r": `${fade.r}px`,
          } as CSSProperties}
        >
          {shownPrs.map((pr) => (
            <div key={pr.lift} style={{ flex: "0 0 calc((100% - 14px) / 2)", minWidth: 0, scrollSnapAlign: "start" }}>
              <PrCell pr={pr} units={units} t={t}
                onOpen={onSession && pr.sessionId ? () => onSession(pr.sessionId!) : undefined} />
            </div>
          ))}
          {!allPrs && prs.length > PRS_RAIL_CAP && (
            <button
              className="pressable"
              onClick={() => setAllPrs(true)}
              style={{
                flex: "0 0 calc((100% - 14px) / 2)", scrollSnapAlign: "start", textAlign: "left",
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: fs.micro,
                color: C("ash"), whiteSpace: "normal",
              }}
            >
              {t("w.home.act.showAll").replace("{n}", String(prs.length))}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
