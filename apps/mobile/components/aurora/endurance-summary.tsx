import { useMemo } from "react";
import { View, Text } from "react-native";
import {
  TODAY_RANGE_STORE_KEY, durationUnits, enduranceDirection, enduranceLead, enduranceWindow,
  formatDuration, sliceName,
  type BodyweightInput, type LoggedSession, type VerdictDirection, deltaRole } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, deltaPaint } from "../../lib/theme";
import { leading, tracking, fs, F, cardShadow, FIXED_FONT_SCALE } from "../../lib/ui";
import { useActivityRange, useRangeLabels } from "./range-filter";
import { APanel } from "./kit";

/**
 * THE ENDURANCE LEAD — the section's opener, as a SENTENCE. The TWIN of
 * components/aurora/endurance-summary.tsx on web.
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

export default function AuroraEnduranceSummary({
  sessions,
  bw,
}: {
  sessions: LoggedSession[];
  bw?: BodyweightInput;
}) {
  const { t } = useLang();
  const { palette: C } = useTheme();
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

  /** Direction as a text colour — the SEMANTIC channel (terracotta down,
   *  chartreuse up), never the brand accent: a quiet fortnight must not read as
   *  a highlight. Flat is ash, like the line it sits in: a move too small for
   *  the verdict card to claim is too small to colour here either. */
  const dirColor = (d: VerdictDirection) => deltaPaint(C, d);
  const tone = dirColor(enduranceDirection(w, "minutes"));

  const kicker = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase" as const };

  /* AN EMPTY PERIOD KEEPS ITS PLACE AND DROPS ITS CHROME.
   *
   * The block's never-disappear doctrine (above) is right, and this honours it
   * — but keeping its PLACE is not the same as keeping its CARD. A border, a
   * fill, a shadow and 14pt of padding drawn around "nothing happened" is the
   * bordered-box exit all over again: a card carries a THING, and an empty
   * period carries none, so the box reads as one more item that turned out to
   * be blank.
   *
   * The kicker pair goes with it. On the populated card "This week" beside
   * "Aug 10 – Aug 16" is the shared RangeHead idiom and stays; with no sentence
   * under it, the two are one fact printed twice above a third line that said
   * it a third time ("...in this period"). What is left is the line this always
   * was: the verdict left, the span right, no panel.
   */
  if (lead.sports === 0) {
    return (
      <View style={{ marginTop: 20, marginHorizontal: 2, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk }}>{sentence}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.ash }}>{span}</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 20 }}>
      <APanel pad={14} style={cardShadow()}>
        {/* The window, said once. There is no filter here, so this line is what
            stops "5.4 h" being a figure with no period attached. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.chalk }}>{title}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.ash }}>{span}</Text>
        </View>

        <Text style={{ marginTop: 8, fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg), color: C.chalk }}>
          {sentence}
        </Text>

        {/* Unconditional now: the empty window returned above, so anything
            reaching here has at least one sport and a duration to state. */}
        <Text style={{ marginTop: 4, fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
          {whyBefore}
          {whyAfter !== undefined && delta !== null && (
            <>
              <Text style={{ color: tone }}>
                {`${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`}
              </Text>
              {whyAfter}
            </>
          )}
        </Text>
      </APanel>
    </View>
  );
}
