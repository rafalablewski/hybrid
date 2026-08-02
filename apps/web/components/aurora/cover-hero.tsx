"use client";

import { useEffect, useState } from "react";
import { fs } from "@hybrid/core";
import { MetaLine } from "./meta";

/**
 * The COVER — the Explore PlanCover recipe at screen scale, full-bleed at the
 * very top of a detail page. It is `position: sticky` with a negative top equal
 * to the collapse range: the page carries it up 1:1 with scroll until only the
 * bar remains, then it pins — no height animation, and no React re-renders.
 * `useHeroCollapse` publishes ONE number (--hero-collapse, 0→1) and every layer
 * interpolates off it in CSS calc(), the use-scroll-collapse idiom.
 *
 * LIVES HERE, not in plans.tsx, because it is no longer the plan detail's
 * private furniture: the recipe detail rides the identical scaffold (see the
 * `recipe` variant). One implementation is the only way the two covers can be
 * guaranteed not to drift, which is the same reason core owns planCoverView and
 * recipeCoverView. Mobile parity: apps/mobile/components/plan-hero.tsx.
 */

const C = (v: string) => `var(--color-${v})`;

export const COVER_INK = "#0c0d0c"; // fixed-dark cover base, both themes (Explore parity)
export const COVER_H = 272;
export const COVER_BAR = 56;
export const COVER_DELTA = COVER_H - COVER_BAR;

/** ── the seam ──────────────────────────────────────────────────────────────
 *  The cover's bottom edge used to butt straight up against the page and read
 *  as a CUT: both sides are near-black, but the cover carries its own accent
 *  wash + title scrim while the page carries the lg-field wash, so the two
 *  never quite match and the join draws a line right above the first card.
 *  This band continues the cover ink DOWN into the page and dissolves it, so
 *  the two washes cross-fade instead of meeting at an edge. `OVER` is an opaque
 *  head that lives BEHIND the sticky cover, hiding the band's own top edge.
 *  Mobile parity: apps/mobile/components/plan-hero.tsx BLEED_*. */
const BLEED_OVER = 64;
const BLEED_FADE = 148;
/** Eased ink→nothing ramp (a linear alpha ramp bands and dies too early). Every
 *  stop shares the cover's RGB, so the interpolation never greys out. */
const BLEED_BG = (() => {
  const head = (BLEED_OVER / (BLEED_OVER + BLEED_FADE)) * 100;
  const at = (f: number) => (head + f * (100 - head)).toFixed(2);
  const ink = (a: number) => `color-mix(in srgb, ${COVER_INK} ${a}%, transparent)`;
  return `linear-gradient(180deg, ${COVER_INK} 0%, ${COVER_INK} ${head.toFixed(2)}%, ${ink(90)} ${at(0.22)}%, ${ink(62)} ${at(0.45)}%, ${ink(30)} ${at(0.68)}%, ${ink(0)} 100%)`;
})();

/** Publishes `--hero-collapse` (0→1 over the cover's collapse range) onto the
 *  detail root, rAF-throttled off window scroll; a release mid-range snaps to
 *  the nearer pole (instantly under Reduce Motion — the scroll-tracking itself
 *  stays, the shipped masthead-compression stance). Returns whether the cover
 *  has collapsed enough to surface the docked CTA. */
export function useHeroCollapse(
  rootRef: React.RefObject<HTMLDivElement | null>,
  heroRef: React.RefObject<HTMLDivElement | null>,
): boolean {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    if (!root || !hero) return;
    let frame = 0;
    let last = -1;
    let snapT: ReturnType<typeof setTimeout> | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const publish = () => {
      frame = 0;
      const p = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / COVER_DELTA));
      const rounded = Math.round(p * 1000) / 1000;
      if (rounded === last) return;
      last = rounded;
      root.style.setProperty("--hero-collapse", String(rounded));
      setDocked(rounded > 0.45); // React bails out when the boolean is unchanged
    };
    const snap = () => {
      const risen = -hero.getBoundingClientRect().top;
      if (risen <= 6 || risen >= COVER_DELTA) return;
      window.scrollTo({ top: window.scrollY + ((risen > COVER_DELTA / 2 ? COVER_DELTA : 0) - risen), behavior: reduced ? "auto" : "smooth" });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(publish);
      if (snapT) clearTimeout(snapT);
      snapT = setTimeout(snap, 140);
    };
    publish();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (snapT) clearTimeout(snapT);
      root.style.removeProperty("--hero-collapse");
    };
  }, [rootRef, heroRef]);
  return docked;
}

/** What the cover scaffold needs to draw — a structural subset of core's
 *  PlanCoverView, so the GOAL-level cover (goalCoverView) and the RECIPE cover
 *  (recipeCoverView) ride the exact same scaffold. */
export interface CoverSpec {
  accent: string;
  glyph: string;
  chip: string;
  /** top-right mono label — "8 WEEKS" on a plan, "22 MIN" on a recipe. */
  duration: string;
  title: string;
  metaParts: (string | null)[];
  /** rule-topped hem columns; [] skips the hem entirely. */
  stats: { value: string; unit: string | null; label: string }[];
  blurb: string;
  /** Same material, different object. "plan" (default) is the POSTER — wash
   *  from the top-RIGHT corner, modest ghost glyph, mono meta under the title,
   *  blurb below on the ink. "goal" is the EMBLEM — the discipline's mark
   *  blown up as the cover art (bigger, brighter, deeper parallax), the wash
   *  mirrored to the top-LEFT so the two levels never read as the same
   *  cover, and the blurb ON the cover face instead of the meta line.
   *  "library" is the SHELF — the Plans root. Emblem-sized glyph like the goal,
   *  but the wash comes from the right like the plan AND runs at a softer mix:
   *  its accent is the theme's own primary (no discipline owns "Plans"), and
   *  the container must not out-shout the nineteen goal accents it holds.
   *  "recipe" is the PLATE — the dish emoji at emblem scale and FULL COLOUR
   *  (a ghosted 7%-white emoji is a grey smudge, not a dish), which is why it
   *  is also the one variant that fades to NOTHING rather than to a residue:
   *  a monochrome mark can drift into the pinned bar as texture, a colour
   *  emoji only smears behind the bar title. Meta line + blurb-below like the
   *  plan, because a recipe has both and a poster is the right object. */
  variant?: "plan" | "goal" | "library" | "recipe";
}

/** The cover's display title at whichever heading level its screen needs. */
function CoverTitle({ as: Tag, style, children }: { as: "h1" | "h2"; style: React.CSSProperties; children: React.ReactNode }) {
  return <Tag style={style}>{children}</Tag>;
}

/** The full-bleed collapsing cover + the stats HEM (rule-topped editorial
 *  columns directly on the ink) + the one-line blurb.
 *  `back` is optional: the Plans root is a top-level screen with nowhere to go
 *  back to, so it renders the bar with the label alone. */
export function CoverHero({ cover, back, backLabel, heroRef }: { cover: CoverSpec; back?: () => void; backLabel?: string; heroRef: React.RefObject<HTMLDivElement | null> }) {
  const accent = cover.accent;
  const library = cover.variant === "library";
  const plate = cover.variant === "recipe";
  // Every non-plan level blows the glyph up as cover art; only the goal mirrors
  // the light source to the left.
  const emblem = cover.variant === "goal" || library || plate;
  const mirrored = cover.variant === "goal";
  // The goal puts its blurb ON the cover face; plan and recipe put it under the
  // hem and keep the mono meta line on the face.
  const blurbOnFace = cover.variant === "goal";
  const p = "var(--hero-collapse, 0)";
  const rule = `color-mix(in srgb, ${C("chalk")} 18%, transparent)`;
  return (
    <>
      <div ref={heroRef} style={{ position: "sticky", top: -COVER_DELTA, zIndex: 30, height: COVER_H, margin: "calc(-1 * var(--page-pad-top, 16px)) calc(-1 * var(--page-pad-x, 16px)) 0", overflow: "hidden", background: COVER_INK, color: "#fff" }}>
        {/* duotone wash bleeding from the top corner (Explore recipe) —
            mirrored to the LEFT on the goal emblem so the light source itself
            tells you which level you're on, and run at a SOFTER mix on the
            library so the root never out-shouts the goal accents on its
            shelves */}
        <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(${mirrored ? "158deg" : "202deg"}, color-mix(in srgb, ${accent} ${library ? 34 : 52}%, ${COVER_INK}) 0%, color-mix(in srgb, ${accent} ${library ? 10 : 15}%, ${COVER_INK}) 46%, ${COVER_INK} 100%)` }} />
        <span aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 92% at ${mirrored ? "14% 8%" : "86% 8%"}, color-mix(in srgb, ${accent} ${library ? 26 : 42}%, transparent), transparent 55%)` }} />
        {/* bottom scrim for title legibility — retired as the title leaves.
            The last sliver runs out to FULLY opaque cover ink (below the title,
            so the poster's wash is untouched) so the bleed band underneath
            starts from exactly the same colour. */}
        <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, ${COVER_INK} 0%, color-mix(in srgb, ${COVER_INK} 50%, transparent) 3%, transparent 52%)`, opacity: `calc(1 - ${p})` }} />
        {/* the cover art; parallax drift against the frame. On the goal emblem
            it IS the subject: bigger, brighter, deeper. On a recipe it is the
            DISH — full colour, and fully gone by the time the bar arrives. */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: plate ? -10 : emblem ? -18 : -36,
            right: plate ? -20 : emblem ? -34 : -16,
            fontSize: emblem ? 218 : 152,
            lineHeight: 1,
            color: plate ? undefined : `rgba(255,255,255,${emblem ? ".09" : ".07"})`,
            filter: plate ? "drop-shadow(0 18px 40px rgba(0,0,0,.5))" : undefined,
            pointerEvents: "none",
            opacity: plate ? `max(0, calc(1 - ${p} * 1.3))` : `calc(1 - ${p} * .6)`,
            transform: `translateY(calc(${p} * ${Math.round(COVER_DELTA * (emblem ? 0.66 : 0.55))}px))`,
          }}
        >
          {cover.glyph}
        </span>

        {/* bar chrome — counter-translates so it never moves on screen */}
        <div style={{ position: "absolute", top: 8, left: 16, right: 20, height: 42, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 3, transform: `translateY(calc(${p} * ${COVER_DELTA}px))` }}>
          {back ? (
            <button className="pressable" onClick={back} aria-label={`← ${backLabel}`} style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,.12)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "none", color: "#fff", cursor: "pointer", fontSize: 17 }}>←</button>
          ) : (
            <span />
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "rgba(255,255,255,.88)" }}>{cover.duration}</span>
        </div>

        {/* compact bar title — fades in a beat after the big one leaves */}
        <div aria-hidden style={{ position: "absolute", top: 8, left: back ? 64 : 20, right: 64, height: 42, display: "grid", placeItems: "center", justifyItems: back ? "center" : "start", zIndex: 2, pointerEvents: "none", opacity: `clamp(0, calc((${p} - .62) * 2.7), 1)`, transform: `translateY(calc(${p} * ${COVER_DELTA}px))` }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 16, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{cover.title}</span>
        </div>

        {/* the cover proper — chip, title, meta; slides up with the frame */}
        <div style={{ position: "absolute", left: 20, right: 20, bottom: 18, opacity: `clamp(0, calc(1 - ${p} * 2), 1)` }}>
          <span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#0d0e0d", background: `color-mix(in srgb, #fff 82%, ${accent})`, padding: "5px 12px", borderRadius: 999 }}>{cover.chip}</span>
          {/* the library cover IS the page's h1 — the root has no other heading
              above it; the goal, plan and recipe covers stay h2 under their own screen */}
          <CoverTitle as={library ? "h1" : "h2"} style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "clamp(28px, 6vw, 36px)", lineHeight: 1.04, letterSpacing: "-.03em", margin: "12px 0 0", maxWidth: "16ch", textWrap: "balance", textShadow: "0 2px 18px rgba(0,0,0,.35)" }}>{cover.title}</CoverTitle>
          {blurbOnFace ? (
            <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.4, color: "rgba(255,255,255,.85)", maxWidth: "44ch", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cover.blurb}</p>
          ) : (
            <MetaLine parts={cover.metaParts} style={{ display: "flex", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,.82)", letterSpacing: ".08em" }} />
          )}
        </div>

        {/* hairline — the collapsed bar's bottom edge */}
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: "rgba(255,255,255,.16)", opacity: p }} />
      </div>

      {/* the cover ink bleeding into the page — in normal flow (so it scrolls
          up under the sticky cover) but zero-height and z-index:-1, so it costs
          no layout and paints BEHIND the hem it fades past. `--cover-bleed` is
          0 on the light theme: there a dark poster meeting warm paper is a real
          boundary, not an artifact, and a dark veil would only muddy the hem. */}
      <div aria-hidden style={{ position: "relative", height: 0, zIndex: -1, pointerEvents: "none" }}>
        <span style={{ position: "absolute", top: -BLEED_OVER, left: "calc(-1 * var(--page-pad-x, 16px))", right: "calc(-1 * var(--page-pad-x, 16px))", height: BLEED_OVER + BLEED_FADE, background: BLEED_BG, opacity: `calc(var(--cover-bleed, 1) * (1 - ${p}))` }} />
      </div>

      {cover.stats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cover.stats.length}, 1fr)`, gap: cover.stats.length > 3 ? 12 : 16, margin: "16px 0 16px" }}>
          {cover.stats.map((s) => (
            <div key={s.label} style={{ borderTop: `2px solid ${rule}`, paddingTop: 10 }}>
              <div style={{ fontWeight: 800, fontSize: cover.stats.length > 3 ? 23 : 28, letterSpacing: "-.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {s.value}{s.unit && <span style={{ fontSize: cover.stats.length > 3 ? 13 : 15, color: C("ash"), fontWeight: 700 }}>{s.unit}</span>}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: cover.stats.length > 3 ? ".08em" : ".12em", textTransform: "uppercase", color: C("ash"), marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {!blurbOnFace && !!cover.blurb && <p style={{ fontSize: fs.bodyLg, lineHeight: 1.55, color: C("ash"), margin: cover.stats.length ? "0 0 4px" : "16px 0 4px", maxWidth: "62ch" }}>{cover.blurb}</p>}
    </>
  );
}
