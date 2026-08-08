"use client";

import type { CSSProperties } from "react";
import { ArrowGlyph } from "./cta-label";
import { useLang } from "@/lib/i18n";

/**
 * RAIL TAIL — the ONE "see all" affordance, and the TWIN of
 * components/aurora/rail-tail.tsx on mobile.
 *
 * The rule: a rail's exit lives at the END OF THE RAIL, not in its header.
 *
 * Every rail used to carry a lime "See all ›" up in its section head. Three of
 * them stacked down Today (Swimming / Cycling / Running) put three identical
 * accent-coloured links on one screen, each pointing somewhere different, none
 * of them where the eye actually is — the reader is at the RIGHT edge of the
 * cards, having just swiped to the end, and the only way to act on "there is
 * more" was to travel back up and left to a link they'd scrolled past. It also
 * spends the head's right slot, which per the Explore SectionHead standard is
 * for the section's meta, and spends chartreuse — the "go" colour — on a link
 * repeated once per lane.
 *
 * A tail puts the door where the corridor ends. It is the last thing in the
 * scroller, so it is DISCOVERED by the same gesture that exhausts the rail: you
 * swipe, you run out of content, and the next thing under your thumb is the way
 * in. It also self-documents the rail's length — reaching the tail is how you
 * know you've seen everything — which the header link could never do.
 *
 * IT IS NOT A CARD (Aug 2026). It first shipped wearing the card form — ink2
 * fill, hairline, the rail's own radius — on the theory that it should "belong
 * to the row". That was wrong twice over. A rail's cards each carry a THING (a
 * coach, a recipe, a business, a metric); the exit carries no thing, so a
 * filled bordered box at the end reads as one more item that turned out to be
 * empty, and the athlete counts it — "six verified businesses" when there are
 * five. And every rail sized its own tail to its own card, so the same door was
 * drawn at five different widths, radii and shadows: the component existed to
 * make the exit consistent while its props made it inconsistent.
 *
 * So the tail is now CHROMELESS on every rail: no fill, no border, no shadow —
 * the ringed arrow plate and a mono-uppercase label in ash, centred on the ink.
 * The slot still matches the host rail's card width (`w`), because that is a
 * SCROLL concern, not a decorative one: under a mandatory snap grid an
 * odd-width final child puts the content end off the grid and the last snap
 * leaves the tail half-cut. Width is where a rail may differ; the drawing is
 * not.
 */

const C = (v: string) => `var(--color-${v})`;

export default function RailTail({
  onOpen,
  label,
  a11y,
  w = 132,
  minHeight,
  snapAlign = "start",
  premium = false,
}: {
  onOpen: () => void;
  /** Defaults to the shared "See all". Pass a destination-specific label where
   *  the rail's position doesn't already say the scope. */
  label?: string;
  /** Spoken label — add the rail's subject where "See all" alone is ambiguous
   *  out of context (a screen reader has no "end of THIS rail" cue). */
  a11y?: string;
  /** Match the rail's card width — a number of px, or the card's own flex
   *  basis verbatim (`"min(52%, 196px)"`) where the rail sizes by viewport.
   *  On a rail that snaps by a fixed interval, matching is not cosmetic: an
   *  odd-width final child puts the content end off the snap grid, so the last
   *  snap lands short and leaves the tail half-cut. */
  w?: number | string;
  /** Floor for rails whose cards size themselves (the tail has no content to
   *  give it height). Rails with fixed-height cards can leave it off — the
   *  flex row stretches the tail to the row's height. */
  minHeight?: number;
  /** MUST match the snap alignment of the rail's own cards. Under
   *  `scroll-snap-type: x mandatory` a start-aligned tail in a centre-aligned
   *  rail is its own snap target: swiping to the end yanks the tail flush to
   *  the scrollport start and drags the whole rail with it. */
  snapAlign?: "start" | "center";
  /** ✦ — the destination is behind Full. Carries the premium accent, not lime. */
  premium?: boolean;
}) {
  const { t } = useLang();
  const text = label ?? t("w.explore.seeAll");
  const color = premium ? "var(--premium-accent-text)" : C("ash");
  const style: CSSProperties = {
    flex: `0 0 ${typeof w === "number" ? `${w}px` : w}`, scrollSnapAlign: snapAlign, minHeight,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
    background: "none", border: "none", padding: 12,
    cursor: "pointer", color, textAlign: "center",
  };
  return (
    <button className="pressable" onClick={onOpen} aria-label={a11y ?? text} style={style}>
      <span
        aria-hidden
        style={{ width: 44, height: 44, borderRadius: 999, border: `1px solid ${premium ? "var(--premium-accent-text)" : C("line")}`, display: "grid", placeItems: "center", flex: "0 0 44px" }}
      >
        <ArrowGlyph size={15} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", lineHeight: 1.35 }}>
        {premium ? `✦ ${text}` : text}
      </span>
    </button>
  );
}
