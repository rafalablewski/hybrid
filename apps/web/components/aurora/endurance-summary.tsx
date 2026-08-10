"use client";

import { useMemo, type CSSProperties } from "react";
import {
  TODAY_RANGE_STORE_KEY, durationUnits, enduranceDirection, enduranceLead, enduranceWindow,
  formatDuration, sliceName,
  type BodyweightInput, type LoggedSession, type VerdictDirection,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { useActivityRange, useRangeLabels } from "./range-filter";

/**
 * THE ENDURANCE LEAD — the section's opener, as a SENTENCE (web). The TWIN of
 * components/aurora/endurance-summary.tsx on mobile.
 *
 * Endurance used to be a run of per-discipline rails with nothing above them
 * stating the whole. The lanes answer "how is my running going"; nothing
 * answered "how is my endurance going".
 *
 * IT TOOK TWO CUTS TO FIND THE ANSWER, and both failures were the same
 * failure — SAYING SOMETHING THE SCREEN WAS ALREADY SAYING.
 *
 *   1. A CARD: three figures, a hairline, a "what it was made of" header, a
 *      share bar and a row per discipline. Every row was a discipline with a
 *      whole RAIL directly beneath it — eight weeks of volume, a pace trend,
 *      zones, its last effort — so the breakdown was a table of contents for a
 *      list already in view, and it pushed the thing it indexed off the screen.
 *   2. A STRIP of the same three figures. Better, but the figures were the
 *      redundancy. DISTANCE is the clearest case: only endurance and sport
 *      groups ever carry any, so this section's kilometres ARE the verdict
 *      card's KM column, to the decimal, one screen apart. EFFORTS sits beside
 *      that card's SESSIONS count and reads as a contradiction of it. Only TIME
 *      was new, and one honest figure does not need three columns and a rule.
 *
 * So the opener says the thing nothing else on Today can say — WHAT the
 * endurance was made of, how many sports and which carried them — in a
 * sentence, and hands the arithmetic back to the card above and the lanes
 * below. Under it, one mono line: the section's own time, against the one
 * comparison nothing else makes (its own baseline). Both come from core's
 * `enduranceLead`, so neither client can invent its own phrasing.
 *
 * The anatomy is the verdict card's, deliberately: a sentence, then its
 * working-out. That is how a summary reads on this screen.
 *
 * NO FILTER OF ITS OWN. It reads the SCREEN's period (core's
 * TODAY_RANGE_STORE_KEY, the same one the verdict card's control writes), so a
 * second five-segment control here would be the same control drawn twice, ten
 * lines apart, always agreeing. The block names the window instead — a total
 * with no period is not a total.
 *
 * IT NEVER DISAPPEARS while the section exists. A block that comes and goes is
 * worse than one that is sometimes quiet, so an empty period keeps its place
 * and says so.
 */

const C = (v: string) => `var(--color-${v})`;

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em",
  textTransform: "uppercase", whiteSpace: "nowrap",
};

/** Direction as a text colour — the SEMANTIC channel (terracotta down,
 *  chartreuse up), never the brand accent: a quiet fortnight must not read as a
 *  highlight. Flat is ash, like the line it sits in: a move too small for the
 *  verdict card to claim is too small to colour here either. */
const dirColor = (d: VerdictDirection) =>
  d === "down" ? "var(--red-text)" : d === "up" ? "var(--lime-text)" : C("ash");

export default function AuroraEnduranceSummary({
  sessions,
  bw,
}: {
  sessions: LoggedSession[];
  bw?: BodyweightInput;
}) {
  const { t } = useLang();
  // Read-only: the control that WRITES this period is the verdict card's, at
  // the top of the retrospective. Same key, so this follows it live.
  const { range } = useActivityRange(TODAY_RANGE_STORE_KEY);
  const { title, span } = useRangeLabels(range);

  const w = useMemo(() => enduranceWindow(sessions, range, bw), [sessions, range, bw]);
  const lead = useMemo(() => enduranceLead(w), [w]);

  const sentence = t(lead.key)
    .replace("{n}", String(lead.sports))
    .replace("{s}", lead.lead ? sliceName(lead.lead, t) : "");

  // The working-out, split so only the DELTA takes the tone — the duration and
  // "on your average" are context, and colouring the whole line would give a
  // 12% week the weight of a headline. `whyCold` carries no {d}, so the split
  // yields one part and the tone never appears.
  //
  // The time goes through the app's ONE duration formatter, so this line and
  // the verdict card's HOURS column print a span the same way. It used to be
  // decimal hours — "5.4 h" for 324 minutes, which is not a duration anybody
  // reads, and which the card above had already stopped printing.
  const [whyBefore, whyAfter] = t(lead.whyKey)
    .replace("{h}", formatDuration(w.totals.minutes, durationUnits(t)))
    .split("{d}");
  const delta = lead.deltaPct;
  const tone = dirColor(enduranceDirection(w, "minutes"));

  /* AN EMPTY PERIOD KEEPS ITS PLACE AND DROPS ITS CHROME.
   *
   * The block's never-disappear doctrine (above) is right, and this honours it
   * — but keeping its PLACE is not the same as keeping its CARD. A border, a
   * fill, a shadow and 14px of padding drawn around "nothing happened" is the
   * bordered-box exit all over again: a card carries a THING, and an empty
   * period carries none, so the box reads as one more item that turned out to
   * be blank.
   *
   * The kicker pair goes with it. On the populated card "This week" beside
   * "Aug 10 – Aug 16" is the shared RangeHead idiom and stays; with no sentence
   * under it, the two are one fact printed twice above a third line that said
   * it a third time ("...in this period"). What is left is the line this always
   * was: the verdict left, the span right, no panel. Mirrors mobile.
   */
  if (lead.sports === 0) {
    return (
      <div style={{
        marginTop: 20, margin: "20px 2px 0",
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
      }}>
        <p style={{ margin: 0, fontSize: fs.bodyLg, lineHeight: 1.4, color: C("chalk") }}>{sentence}</p>
        <span style={{ ...kicker, color: C("ash"), whiteSpace: "nowrap" }}>{span}</span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: 14,
      }}>
        {/* The window, said once. There is no filter here, so this line is what
            stops "5.4 h" being a figure with no period attached. */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <span style={{ ...kicker, color: C("chalk") }}>{title}</span>
          <span style={{ ...kicker, color: C("ash") }}>{span}</span>
        </div>

        <p style={{ margin: "8px 0 0", fontSize: fs.bodyLg, lineHeight: 1.4, color: C("chalk") }}>{sentence}</p>

        {/* Unconditional now: the empty window returned above, so anything
            reaching here has at least one sport and a duration to state. */}
        <p style={{
          margin: "4px 0 0", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
          fontSize: fs.micro, color: C("ash"),
        }}>
          {whyBefore}
          {whyAfter !== undefined && delta !== null && (
            <>
              <em style={{ fontStyle: "normal", color: tone }}>
                {`${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`}
              </em>
              {whyAfter}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
