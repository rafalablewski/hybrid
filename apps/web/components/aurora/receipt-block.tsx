"use client";

import { doneReceiptHero, fs, type DoneReceipt, type DoneReceiptStat, type WeightUnit } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;

// ── AURORA Done receipt block ───────────────────────────────────────────────
// The finished day, as both week rails render it: the ✓, the headline, the
// finishing clock, ONE figure at display size and the rest standing down.
//
// THE GUTTER IS THE POINT. The card used to run three left edges at once — its
// hairlines at 0, the ✓ and headline at the card's padding, and every line
// under them at padding + 31 (the width of a ✓ glyph plus its gap), aligning to
// a mark the eye couldn't see because the glyph above was half that wide. That
// reads as ragged, not indented. So the ✓ now sits in a GUTTER COLUMN of its
// own and every line of the receipt — headline included — starts at the same
// edge. The only other edges left in the card are hairlines, which is a
// hierarchy. (A real column, not an absolutely-positioned glyph: the mobile
// twin has to lay out identically, and Yoga and CSS have disagreed about
// whether a parent's padding applies to an absolute child.)
//
// ONE NUMBER EARNS THE SIZE. Three figures at one size is three focal points,
// which is none; core doneReceiptHero picks the one the day was about (the same
// priority sessionHeadline uses for the History rows, so the two can't headline
// different facts) and hands back the remainder for a single quiet line.
//
// Mirrors the mobile twin (aurora/receipt-block.tsx) exactly.

/** The gutter the ✓ sits in — the receipt's one text edge. Exported because
 *  the rails' seam aligns its label to it too. */
export const RECEIPT_GUTTER = 31;

/** The headline's line box. Shared by the ✓ so the two sit on one baseline
 *  from separate columns. */
const HEAD_LINE = 24;

/** A supporting label, for the figures whose unit can't name them. Uppercase
 *  mono — the house grammar for a label, and the only casing that is correct in
 *  every language (lowercasing "Höhenmeter" would not be German). */
function Suffix({ children }: { children: string }) {
  return (
    <span style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginLeft: 6 }}>
      {children}
    </span>
  );
}

export default function ReceiptBlock({
  receipt,
  units,
  title,
  stamp,
}: {
  receipt: DoneReceipt | null;
  units: WeightUnit;
  /** already-localized headline ("All done for today" / "Logged"). */
  title: string;
  /** already-localized corner stamp ("Yesterday", "6-day streak"), or "". */
  stamp?: string | null;
}) {
  const { t } = useLang();
  const empty: { hero: DoneReceiptStat | null; rest: DoneReceiptStat[] } = { hero: null, rest: [] };
  const { hero, rest } = receipt ? doneReceiptHero(receipt, units) : empty;
  const finished = receipt?.finishedClock
    ? t("w.home.rail.finishedAt").replace("{t}", receipt.finishedClock)
    : "";

  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {/* the gutter — the ✓ and nothing else */}
      <div
        aria-hidden
        style={{ width: RECEIPT_GUTTER, flexShrink: 0, color: "var(--lime-text)", fontSize: 19, fontWeight: 800, lineHeight: `${HEAD_LINE}px` }}
      >
        ✓
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, lineHeight: `${HEAD_LINE}px`, letterSpacing: "-.02em", minWidth: 0 }}>
            {title}
          </div>
          {!!stamp && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), whiteSpace: "nowrap", flexShrink: 0 }}>
              {stamp}
            </span>
          )}
        </div>

        {!!finished && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>
            {finished}
          </div>
        )}

        {hero && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 44, letterSpacing: "-.045em", lineHeight: 0.9, fontVariantNumeric: "tabular-nums" }}>
              {hero.figure}
            </span>
            {!!hero.unit && <span style={{ fontSize: 16, fontWeight: 600, color: C("ash") }}>{hero.unit}</span>}
            {/* a hero whose unit can't name it (a bare count, a climb) keeps its label */}
            {hero.needsLabel && (
              <span style={{ fontFamily: "var(--font-mono)" }}>
                <Suffix>{t(hero.labelKey)}</Suffix>
              </span>
            )}
          </div>
        )}

        {/* The supporting figures, on one line. No separator glyph — the gap
            does it (house rule: never a middot). A value that can't stand on
            its own takes its label back, so "320 m" beside "9.4 km" still reads
            as the climb it is. */}
        {rest.length > 0 && (
          <div
            style={{
              display: "flex", flexWrap: "wrap", columnGap: 18, rowGap: 6, marginTop: 12,
              fontFamily: "var(--font-mono)", fontSize: 12.5, color: C("ash"), fontVariantNumeric: "tabular-nums",
            }}
          >
            {rest.map((s) => (
              <span key={s.labelKey}>
                {s.value}
                {s.needsLabel && <Suffix>{t(s.labelKey)}</Suffix>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
