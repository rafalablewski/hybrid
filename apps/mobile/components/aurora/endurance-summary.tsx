import { useMemo } from "react";
import { View, Text } from "react-native";
import {
  ENDURANCE_METRICS, TODAY_RANGE_STORE_KEY, enduranceDeltaPct, enduranceDirection, enduranceMetricKey,
  enduranceValue, enduranceWindow, groupDistanceDisplay, kmValue, sliceName,
  type BodyweightInput, type EnduranceMetric, type EnduranceSlice, type LoggedSession,
  type VerdictDirection,
} from "@hybrid/core";
import { CARD_PAD } from "./kit";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, cardShadow, FIXED_FONT_SCALE } from "../../lib/ui";
import { RangeFilter, RangeHead, useActivityRange, useRangeLabels } from "./range-filter";

/**
 * THE ENDURANCE CARD — "This week" for the Endurance section, and everything
 * its date filter turns it into. The TWIN of
 * components/aurora/endurance-summary.tsx on web.
 *
 * Endurance used to be a run of per-discipline rails with nothing above them
 * stating the whole. You could read that running was 39 km and swimming 600 m
 * and never be told what the two came to, how many times you went out, or
 * whether any of it was more than usual. The lanes answer "how is my running
 * going"; nothing answered "how is my endurance going".
 *
 * WHY THIS IS NOT THE STRIP THAT WAS RETIRED. The Endurance block once opened
 * with a cross-sport totals strip, and it was removed because two totals cards
 * on one screen counting different populations under near-identical labels —
 * "5 sessions, 3.2 h" over "3 efforts, 0.9 h" — is a misreading waiting to
 * happen. What has changed is the heading above it: this card sits under a
 * cluster headline reading ENDURANCE, so its figures are scoped by the section
 * they open, which the old strip's never were. And the figures themselves are a
 * SLICE of the verdict card's, not a second opinion — core's `enduranceWindow`
 * reads the exact `activitySummary` that card renders and keeps the endurance
 * and sport groups (see endurance-window.ts).
 *
 * The card NEVER disappears while the section exists. A block that comes and
 * goes is worse than one that is sometimes quiet, so an empty period keeps its
 * place and says so.
 *
 * NO DRAWER. Every column on the verdict card opens onto the sessions behind
 * it; these do not. The breakdown this card owes is per-DISCIPLINE, and that is
 * standing in the lanes directly underneath — a second route to the same rails
 * would be a detour, and the "what it was made of" list here is the index to
 * them.
 */

/** ONE PERIOD FOR THE SCREEN. This card's filter and the Progress card's are
 *  the same filter shown twice: both read core's TODAY_RANGE_STORE_KEY, so
 *  scrubbing either one moves both. The alternative — a key per block — let
 *  "Last 30 days" mean two windows at once, with the disagreeing card a scroll
 *  away and nothing on screen admitting it. */

export default function AuroraEnduranceSummary({
  sessions,
  bw,
}: {
  sessions: LoggedSession[];
  bw?: BodyweightInput;
}) {
  const { t } = useLang();
  const { palette: C, scheme } = useTheme();
  const { range, pick } = useActivityRange(TODAY_RANGE_STORE_KEY);
  const { title, span } = useRangeLabels(range);

  const w = useMemo(() => enduranceWindow(sessions, range, bw), [sessions, range, bw]);

  const fmtMinutes = (m: number) =>
    m < 60 ? `${Math.round(m)} ${t("w.home.act.uMin")}` : `${Math.round(m / 6) / 10} ${t("w.home.act.uH")}`;

  /** A metric in the card's own display units. */
  const fmt = (m: EnduranceMetric, value: number) =>
    m === "efforts" ? String(Math.round(value))
      : m === "distance" ? `${kmValue(value)} km`
        : fmtMinutes(value);

  /** Direction as a text colour — the SEMANTIC channel (terracotta down,
   *  chartreuse up), never the brand accent: a quiet fortnight must not read as
   *  a highlight. Flat is chalk, not ash: these three figures are the card's
   *  subject, not muted context. */
  const dirColor = (d: VerdictDirection) =>
    d === "down" ? txt(C, C.red) : d === "up" ? txt(C, C.lime) : C.chalk;

  const anyDistance = w.totals.distanceKm > 0;
  const kicker = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase" as const };

  return (
    <View style={{ marginTop: 24 }}>
      <RangeHead title={title} meta={span} />
      <RangeFilter range={range} sessions={sessions} onPick={pick} />

      <View style={{
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28,
        padding: CARD_PAD, ...cardShadow(scheme),
      }}>
        {/* THE THREE FIGURES — how many times you went out, how far, how long.
            Each carries its OWN move against its OWN baseline underneath, in
            its own tone: a period where distance rose while time fell reads as
            exactly that, rather than being flattened into one headline. The
            comparison is the same one the verdict card makes (the mean of the
            preceding windows of the same length), so "up on your average" means
            one thing on this screen. */}
        <View style={{ flexDirection: "row" }}>
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
                <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 21, letterSpacing: -0.4, marginTop: 3, color: C.chalk }}>
                  {fmt(m, enduranceValue(w.totals, m))}
                </Text>
                {/* No baseline to move from is a different fact from "it did
                    not move", so it renders as nothing rather than as 0%. */}
                <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 10, marginTop: 5, color: delta === null ? C.ash : col }}>
                  {delta === null ? "—" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`}
                </Text>
              </View>
            );
          })}
        </View>

        {w.slices.length === 0 ? (
          <Text style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>
            {t("w.home.endw.empty")}
          </Text>
        ) : (
          <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
            <Text numberOfLines={1} style={{ ...kicker, color: C.ash }}>{t("w.home.endw.mix")}</Text>

            {/* The share bar — every discipline's slice of the period's TIME,
                in one line. Time, not distance, because it is the one measure
                every endurance discipline and every timed sport carries: a bar
                drawn on km would silently drop squash entirely. */}
            <View style={{ flexDirection: "row", gap: 2, height: 6, marginTop: 10 }}>
              {w.slices.map((s, i) => (
                <View key={s.id} style={{
                  flexGrow: Math.max(s.share, 0.02), flexBasis: 0, borderRadius: 999,
                  backgroundColor: i === 0 ? C.chalk : i === 1 ? C.ash : C.line,
                }} />
              ))}
            </View>

            <View style={{ marginTop: 6 }}>
              {w.slices.map((s) => (
                <SliceRow key={s.id} slice={s} anyDistance={anyDistance} fmtMinutes={fmtMinutes} t={t} />
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/** One discipline's line. The value column is TIME, so it agrees with the share
 *  beside it; distance rides alongside in the slice's OWN unit — 600 m of
 *  swimming never has to read as "0.6 km" — and the column only exists when
 *  something in the period had any. */
function SliceRow({ slice, anyDistance, fmtMinutes, t }: {
  slice: EnduranceSlice;
  anyDistance: boolean;
  fmtMinutes: (m: number) => string;
  t: (k: string) => string;
}) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
      <Text style={{ fontSize: 13, width: 18, textAlign: "center" }}>{slice.icon}</Text>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>
        {sliceName(slice, t)}
      </Text>
      {anyDistance && (
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, minWidth: 54, textAlign: "right" }}>
          {slice.distanceKm > 0 ? `${groupDistanceDisplay(slice.distanceKm, slice.unit)} ${slice.unit}` : ""}
        </Text>
      )}
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, color: C.ash, minWidth: 32, textAlign: "right" }}>
        {Math.round(slice.share * 100)}%
      </Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, minWidth: 56, textAlign: "right" }}>
        {fmtMinutes(slice.minutes)}
      </Text>
    </View>
  );
}
