import { useMemo } from "react";
import { View, Text } from "react-native";
import {
  ENDURANCE_METRICS, TODAY_RANGE_STORE_KEY, enduranceDeltaPct, enduranceDirection,
  enduranceMetricKey, enduranceValue, enduranceWindow, kmValue,
  type BodyweightInput, type EnduranceMetric, type LoggedSession, type VerdictDirection,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, cardShadow, FIXED_FONT_SCALE } from "../../lib/ui";
import { useActivityRange, useRangeLabels } from "./range-filter";

/**
 * THE ENDURANCE STRIP — how the section's period went, in one glance. The TWIN
 * of components/aurora/endurance-summary.tsx on web.
 *
 * Endurance used to be a run of per-discipline rails with nothing above them
 * stating the whole. You could read that running was 39 km and swimming 600 m
 * and never be told what the two came to, how many times you went out, or
 * whether any of it was more than usual. The lanes answer "how is my running
 * going"; nothing answered "how is my endurance going".
 *
 * A STRIP, NOT A CARD, and the difference is the point. The first cut was a
 * full card: the same three figures, then a hairline, a "what it was made of"
 * header, a share bar and a row per discipline — about 300dp of section opening
 * before the first lane. Every one of those rows was a discipline that has a
 * WHOLE RAIL of its own immediately below, carrying eight weeks of volume, a
 * pace trend, zones and its last effort. So the breakdown was a table of
 * contents for a list already in view, and it pushed the thing it indexed off
 * the screen. What a section opener owes is the total the lanes decompose, and
 * nothing else.
 *
 * So: three figures, each with its own move under it, on one compact strip —
 * tile radius rather than card radius, tile padding rather than card padding,
 * because it is a header for what follows rather than an object in its own
 * right.
 *
 * NO FILTER OF ITS OWN. It reads the SCREEN's period (core's
 * TODAY_RANGE_STORE_KEY, the same one the verdict card's control writes), so a
 * second five-segment control here would be the same control drawn twice, ten
 * lines apart, always agreeing. The strip names the window instead — a total
 * with no period is not a total.
 *
 * IT NEVER DISAPPEARS while the section exists. A block that comes and goes is
 * worse than one that is sometimes quiet, so an empty period keeps its place
 * and says so.
 *
 * WHY THIS IS NOT THE STRIP THAT WAS RETIRED. The Endurance block once opened
 * with a cross-sport totals strip, and it was removed because two totals cards
 * on one screen counting different populations under near-identical labels —
 * "5 sessions, 3.2 h" over "3 efforts, 0.9 h" — is a misreading waiting to
 * happen. What has changed is the heading above it: this sits under a cluster
 * headline reading ENDURANCE, so its figures are scoped by the section they
 * open, which the old strip's never were. And the figures themselves are a
 * SLICE of the verdict card's, not a second opinion — core's `enduranceWindow`
 * reads the exact `activitySummary` that card renders and keeps the endurance
 * and sport groups (see endurance-window.ts).
 */

export default function AuroraEnduranceSummary({
  sessions,
  bw,
}: {
  sessions: LoggedSession[];
  bw?: BodyweightInput;
}) {
  const { t } = useLang();
  const { palette: C, scheme } = useTheme();
  // Read-only: the control that WRITES this period is the verdict card's, at
  // the top of the retrospective. Same key, so the strip follows it live.
  const { range } = useActivityRange(TODAY_RANGE_STORE_KEY);
  const { title, span } = useRangeLabels(range);

  const w = useMemo(() => enduranceWindow(sessions, range, bw), [sessions, range, bw]);

  const fmtMinutes = (m: number) =>
    m < 60 ? `${Math.round(m)} ${t("w.home.act.uMin")}` : `${Math.round(m / 6) / 10} ${t("w.home.act.uH")}`;

  /** A metric in the strip's own display units. */
  const fmt = (m: EnduranceMetric, value: number) =>
    m === "efforts" ? String(Math.round(value))
      : m === "distance" ? `${kmValue(value)} km`
        : fmtMinutes(value);

  /** Direction as a text colour — the SEMANTIC channel (terracotta down,
   *  chartreuse up), never the brand accent: a quiet fortnight must not read as
   *  a highlight. Flat is chalk, not ash: these three figures are the strip's
   *  whole subject, not muted context. */
  const dirColor = (d: VerdictDirection) =>
    d === "down" ? txt(C, C.red) : d === "up" ? txt(C, C.lime) : C.chalk;

  const kicker = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase" as const };
  const quiet = w.totals.efforts === 0;

  return (
    <View style={{ marginTop: 20 }}>
      <View style={{
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16,
        padding: 14, ...cardShadow(scheme),
      }}>
        {/* The window, said once. The strip has no filter of its own, so this
            line is what stops "58 km" being a figure with no period attached. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.chalk }}>{title}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.ash }}>{span}</Text>
        </View>

        {quiet ? (
          <Text style={{ marginTop: 9, fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>
            {t("w.home.endw.empty")}
          </Text>
        ) : (
          /* THE THREE FIGURES — how many times you went out, how far, how long.
             Each carries its OWN move against its OWN baseline underneath, in
             its own tone: a period where distance rose while time fell reads as
             exactly that, rather than being flattened into one headline. The
             comparison is the same one the verdict card makes (the mean of the
             preceding windows of the same length), so "up on your average"
             means one thing on this screen. */
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            {ENDURANCE_METRICS.map((m, i) => {
              const delta = enduranceDeltaPct(w, m);
              const col = dirColor(enduranceDirection(w, m));
              return (
                <View
                  key={m}
                  style={{
                    flex: 1,
                    paddingLeft: i === 0 ? 0 : 12,
                    borderLeftWidth: i === 0 ? 0 : 1,
                    borderLeftColor: C.line,
                  }}
                >
                  <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.ash }}>
                    {t(enduranceMetricKey(m))}
                  </Text>
                  <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: -0.4, marginTop: 3, color: C.chalk }}>
                    {fmt(m, enduranceValue(w.totals, m))}
                  </Text>
                  {/* No baseline to move from is a different fact from "it did
                      not move", so it renders as a dash rather than as 0%. */}
                  <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 10, marginTop: 4, color: delta === null ? C.ash : col }}>
                    {delta === null ? "—" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
