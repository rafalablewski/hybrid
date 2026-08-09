"use client";

/**
 * THE SEAM — the page turning between two clusters (web). The TWIN of
 * components/aurora/section-seam.tsx on mobile.
 *
 * Today's clusters have always separated by whitespace alone: a GroupMark sits
 * 36px below whatever precedes it, which is more air than anything inside a
 * cluster gets, and that is enough while the clusters are short. PROGRESS and
 * ENDURANCE are not short — each is a headed card, a filter, breakdowns and
 * rails — and after a screen of scrolling through one, the extra air reads as a
 * gap in the list rather than as the end of a chapter. The next headline has to
 * carry the whole burden of saying "that was a different thing".
 *
 * So this is one rule, and it is deliberately NOT the divider the GroupMark
 * study retired. That one was a hairline ATTACHED to a label — the
 * label-plus-rule that reads as the default heading treatment every generated
 * layout reaches for. This one has no label. It belongs to neither section, it
 * carries nothing, and it is the only rule on the screen that runs FULL-BLEED:
 * the same negative margins the rails use, so it crosses the whole device and
 * reads as the sheet ending rather than as a box being drawn around something.
 *
 * IT FADES AT BOTH ENDS. A hairline that hits the screen edge square looks like
 * the top border of a container that failed to render. A gradient that dissolves
 * into the ground is a horizon: strongest where the eye is (the middle of the
 * column), gone by the time it reaches anywhere it could be mistaken for chrome.
 *
 * `<hr>` rather than a styled div: a thematic break is exactly what this is, so
 * the structure is free for a screen reader instead of being hidden from it.
 */
export default function SectionSeam({ mt = 32 }: { mt?: number }) {
  return (
    <hr
      style={{
        border: "none",
        height: 1,
        // Full-bleed: the negative margins are the width of the screen gutter,
        // exactly as the rails' are, so the line reaches the true screen edge.
        margin: `${mt}px calc(-1 * var(--page-pad-x, 12px)) 0`,
        background: `linear-gradient(90deg, transparent, var(--color-line) 22%, var(--color-line) 78%, transparent)`,
      }}
    />
  );
}
