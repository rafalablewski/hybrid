"use client";

import { useMemo, type CSSProperties } from "react";
import {
  ENDURANCE_METRICS, enduranceDeltaPct, enduranceDirection, enduranceMetricKey,
  enduranceValue, enduranceWindow, groupDistanceDisplay, kmValue, sliceName,
  type BodyweightInput, type EnduranceMetric, type EnduranceSlice, type LoggedSession,
  type VerdictDirection,
} from "@hybrid/core";
import { fs, CARD_PAD } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { RangeFilter, RangeHead, useActivityRange, useRangeLabels } from "./range-filter";

/**
 * THE ENDURANCE CARD — "This week" for the Endurance section, and everything
 * its date filter turns it into (web). The TWIN of
 * components/aurora/endurance-summary.tsx on mobile.
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
 * they open, which the old strip's never were. And the figures themselves are
 * a SLICE of the verdict card's, not a second opinion — core's
 * `enduranceWindow` reads the exact `activitySummary` that card renders and
 * keeps the endurance and sport groups (see endurance-window.ts).
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

const C = (v: string) => `var(--color-${v})`;

/** The filter's choice, per block. Progress keeps `hybrid.today.range`: a
 *  period belongs to the card it sits above, and scrubbing this section's
 *  window must not silently rewrite one the athlete can't see. */
const STORE_KEY = "hybrid.today.endRange";

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em",
  textTransform: "uppercase", whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

/** Direction as a text colour — the SEMANTIC channel (terracotta down,
 *  chartreuse up), never the brand accent: a quiet fortnight must not read as a
 *  highlight. Flat is chalk, not ash: these three figures are the card's
 *  subject, not muted context. */
const dirColor = (d: VerdictDirection) =>
  d === "down" ? "var(--red-text)" : d === "up" ? "var(--lime-text)" : C("chalk");

export default function AuroraEnduranceSummary({
  sessions,
  bw,
}: {
  sessions: LoggedSession[];
  bw?: BodyweightInput;
}) {
  const { t } = useLang();
  const { range, pick } = useActivityRange(STORE_KEY);
  const { title, span } = useRangeLabels(range);

  const w = useMemo(() => enduranceWindow(sessions, range, bw), [sessions, range, bw]);

  const fmtMinutes = (m: number) =>
    m < 60 ? `${Math.round(m)} ${t("w.home.act.uMin")}` : `${Math.round(m / 6) / 10} ${t("w.home.act.uH")}`;

  /** A metric in the card's own display units. */
  const fmt = (m: EnduranceMetric, value: number) =>
    m === "efforts" ? String(Math.round(value))
      : m === "distance" ? `${kmValue(value)} km`
        : fmtMinutes(value);

  const anyDistance = w.totals.distanceKm > 0;

  return (
    <div style={{ marginTop: 24 }}>
      <RangeHead title={title} meta={span} />
      <RangeFilter range={range} sessions={sessions} onPick={pick} />

      <div style={{
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28,
        boxShadow: "var(--shadow-card)", padding: CARD_PAD,
      }}>
        {/* THE THREE FIGURES — how many times you went out, how far, how long.
            Each carries its OWN move against its OWN baseline underneath, in
            its own tone: a period where distance rose while time fell reads as
            exactly that, rather than being flattened into one headline. The
            comparison is the same one the verdict card makes (the mean of the
            preceding windows of the same length), so "up on your average" means
            one thing on this screen. */}
        <div style={{ display: "flex" }}>
          {ENDURANCE_METRICS.map((m, i) => {
            const delta = enduranceDeltaPct(w, m);
            const dir = enduranceDirection(w, m);
            const col = dirColor(dir);
            return (
              <div
                key={m}
                style={{
                  flex: 1, minWidth: 0,
                  paddingLeft: i === 0 ? 0 : 12,
                  borderLeft: i === 0 ? undefined : `1px solid ${C("line")}`,
                }}
              >
                <span style={{ display: "block", ...kicker, color: C("ash") }}>{t(enduranceMetricKey(m))}</span>
                <span style={{
                  display: "block", ...num, fontSize: 21, fontWeight: 500, letterSpacing: "-.02em",
                  marginTop: 3, color: C("chalk"), whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {fmt(m, enduranceValue(w.totals, m))}
                </span>
                {/* No baseline to move from is a different fact from "it did
                    not move", so it renders as nothing rather than as 0%. */}
                <span style={{ display: "block", ...num, fontSize: 10, marginTop: 5, color: delta === null ? C("ash") : col, whiteSpace: "nowrap" }}>
                  {delta === null ? "—" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`}
                </span>
              </div>
            );
          })}
        </div>

        {w.slices.length === 0 ? (
          <p style={{ margin: "14px 0 0", paddingTop: 12, borderTop: `1px solid ${C("line")}`, fontSize: fs.caption, color: C("ash") }}>
            {t("w.home.endw.empty")}
          </p>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <span style={{ display: "block", ...kicker, color: C("ash") }}>{t("w.home.endw.mix")}</span>

            {/* The share bar — every discipline's slice of the period's TIME,
                in one line. Time, not distance, because it is the one measure
                every endurance discipline and every timed sport carries: a bar
                drawn on km would silently drop squash entirely. */}
            <div style={{ display: "flex", gap: 2, height: 6, marginTop: 10, borderRadius: 999, overflow: "hidden" }} aria-hidden>
              {w.slices.map((s, i) => (
                <span key={s.id} style={{
                  flexGrow: Math.max(s.share, 0.02), flexBasis: 0, borderRadius: 999,
                  background: i === 0 ? C("chalk") : i === 1 ? C("ash") : C("line"),
                }} />
              ))}
            </div>

            <div style={{ marginTop: 6 }}>
              {w.slices.map((s) => (
                <SliceRow key={s.id} slice={s} anyDistance={anyDistance} fmtMinutes={fmtMinutes} t={t} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <span style={{ fontSize: 13, width: 18, textAlign: "center" }} aria-hidden>{slice.icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: fs.caption, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sliceName(slice, t)}
      </span>
      {anyDistance && (
        <span style={{ ...num, fontSize: 10, color: C("ash"), minWidth: 54, textAlign: "right" }}>
          {slice.distanceKm > 0 ? `${groupDistanceDisplay(slice.distanceKm, slice.unit)} ${slice.unit}` : ""}
        </span>
      )}
      <span style={{ ...num, fontSize: 10, color: C("ash"), letterSpacing: ".08em", minWidth: 32, textAlign: "right" }}>
        {Math.round(slice.share * 100)}%
      </span>
      <span style={{ ...num, fontSize: fs.caption, color: C("chalk"), minWidth: 56, textAlign: "right" }}>
        {fmtMinutes(slice.minutes)}
      </span>
    </div>
  );
}
