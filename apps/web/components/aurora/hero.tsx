"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  HERO,
  HERO_INK,
  HERO_INLINE_TITLE,
  HERO_META_TYPE,
  HERO_TAKEOVER_INK,
  heroBackdrop,
  heroGeometry,
  heroLight,
  heroMetaLine,
  heroNavAction,
  heroNavMaterial,
  heroTitleType,
  type HeroBackdrop as HeroBackdropKind,
  type HeroMode,
  type HeroRank,
} from "@hybrid/core";
import { AuroraIcon } from "./icons";

/**
 * THE HERO SYSTEM — web.
 *
 * The exact twin of apps/mobile/components/aurora/hero.tsx. Both clients import
 * their geometry, collapse detents, type ramp, metadata language and backdrop
 * rules from `packages/core/src/hero.ts`, so a threshold can only be changed
 * for both at once. Spec: reference/hero-system.md.
 *
 * The collapse is the shipped `useHeroCollapse` idiom: the hero is
 * `position: sticky` with a negative top equal to the track, the page carries
 * it up 1:1 with scroll until only the bar remains, then it pins. ONE number
 * (`--hero-p`, 0→1) is published on the root and every layer interpolates off
 * it in CSS calc() — no height animation, no React re-renders per frame.
 */

const C = (v: string) => `var(--color-${v})`;
/** The published collapse track, as a CSS value. */
const P = "var(--hero-p, 0)";

/* ── the collapse track ──────────────────────────────────────────────────── */

/** Publishes `--hero-p` (0→1 across the hero's track) onto `rootRef`,
 *  rAF-throttled off window scroll; a release mid-track settles to the nearer
 *  pole (instantly under Reduce Motion — the tracking itself is direct
 *  manipulation and is never suppressed). Returns whether the hero has
 *  collapsed far enough to surface a docked CTA. */
export function useHeroCollapse(rootRef: React.RefObject<HTMLElement | null>, heroRef: React.RefObject<HTMLElement | null>, delta: number): boolean {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    if (!root || !hero || delta <= 0) return;
    let frame = 0;
    let last = -1;
    let snapT: ReturnType<typeof setTimeout> | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const publish = () => {
      frame = 0;
      const p = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / delta));
      const rounded = Math.round(p * 1000) / 1000;
      if (rounded === last) return;
      last = rounded;
      root.style.setProperty("--hero-p", String(rounded));
      setDocked(rounded > HERO.detent.dock); // React bails out when unchanged
    };
    const snap = () => {
      const risen = -hero.getBoundingClientRect().top;
      if (risen <= 6 || risen >= delta) return;
      window.scrollTo({ top: window.scrollY + ((risen > delta * HERO.detent.snap ? delta : 0) - risen), behavior: reduced ? "auto" : "smooth" });
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
      root.style.removeProperty("--hero-p");
    };
  }, [rootRef, heroRef, delta]);
  return docked;
}

/** A clamped 0→1 ramp between two of core's detents, in pure CSS. The web twin
 *  of the mobile `track()` helper — same constants, same shape. */
const ramp = (from: number, to: number) => `clamp(0, calc((${P} - ${from}) * ${(1 / Math.max(0.001, to - from)).toFixed(4)}), 1)`;

/* ── HeroNav — the one navigation control ────────────────────────────────── */

export function HeroNav({
  onClick,
  fromLabel,
  mode = "page",
  material = "glass",
  onDark = true,
  style,
}: {
  onClick: () => void;
  /** Names the ORIGIN, not the action. */
  fromLabel?: string;
  mode?: HeroMode;
  material?: "clear" | "glass";
  onDark?: boolean;
  style?: CSSProperties;
}) {
  const { role, glyph } = heroNavAction(mode);
  const glass = material === "glass";
  const fg = onDark ? "#fff" : C("chalk");
  return (
    <button
      className="pressable"
      onClick={onClick}
      aria-label={fromLabel ? `← ${fromLabel}` : role === "dismiss" ? "Close" : "Back"}
      style={{
        // 40pt circle in a 44pt hit target — Apple's minimum, and the identical
        // geometry the mobile twin renders.
        width: HERO.nav.hit,
        height: HERO.nav.hit,
        marginLeft: -(HERO.nav.hit - HERO.nav.size) / 2,
        display: "grid",
        placeItems: "center",
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        ...style,
      }}
    >
      <span
        style={{
          width: HERO.nav.size,
          height: HERO.nav.size,
          borderRadius: HERO.radius.nav,
          display: "grid",
          placeItems: "center",
          color: fg,
          background: glass ? `rgba(${onDark ? "255,255,255" : "0,0,0"},${HERO.alpha.navFill})` : "transparent",
          border: glass ? `${HERO.nav.stroke}px solid rgba(${onDark ? "255,255,255" : "0,0,0"},${HERO.alpha.navStroke})` : "none",
          backdropFilter: glass ? "blur(14px) saturate(1.4)" : undefined,
          WebkitBackdropFilter: glass ? "blur(14px) saturate(1.4)" : undefined,
          transition: `background ${HERO.motion.duration}s ease, border-color ${HERO.motion.duration}s ease`,
        }}
      >
        <AuroraIcon name={glyph} size={HERO.nav.glyph} color="currentColor" />
      </span>
    </button>
  );
}

/* ── the metadata language — three slots, one type style ─────────────────── */

const metaStyle = (color: string): CSSProperties => ({
  fontFamily: "var(--font-mono)",
  fontSize: HERO_META_TYPE.size,
  lineHeight: `${HERO_META_TYPE.lineHeight}px`,
  letterSpacing: `${HERO_META_TYPE.tracking}em`,
  textTransform: "uppercase",
  color,
});

export function HeroEyebrow({ label, tone, accent, mark }: { label: string; tone: "tint" | "solid"; accent: string; mark?: string }) {
  const text = mark ? `${mark} ${label}` : label;
  if (tone === "solid") {
    return (
      <span style={{ ...metaStyle("#0d0e0d"), display: "inline-block", fontWeight: 700, background: `color-mix(in srgb, #fff 82%, ${accent})`, padding: "5px 12px", borderRadius: HERO.radius.chip }}>{text}</span>
    );
  }
  return <span style={{ ...metaStyle(accent), display: "inline-block" }}>{text}</span>;
}

export function HeroMetadata({ parts, onDark = true }: { parts: (string | null | undefined | false)[]; onDark?: boolean }) {
  const line = heroMetaLine(parts);
  if (!line) return null;
  return <div style={{ ...metaStyle(onDark ? `rgba(255,255,255,${HERO.alpha.dim})` : C("ash")), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>;
}

export function HeroAccessory({ label, onClick, active, onDark = true }: { label: string; onClick?: () => void; active?: boolean; onDark?: boolean }) {
  const fg = active ? "var(--lime-text)" : onDark ? `rgba(255,255,255,${HERO.alpha.dim})` : C("ash");
  if (!onClick) return <span style={{ ...metaStyle(fg), fontWeight: 600 }}>{label}</span>;
  return (
    <button className="pressable" onClick={onClick} aria-pressed={!!active} style={{ ...metaStyle(fg), fontWeight: 600, background: "none", border: "none", cursor: "pointer", minHeight: HERO.nav.hit, padding: "0 4px" }}>
      {label}
    </button>
  );
}

export function HeroTitle({ title, rank, as: Tag = "h1", onDark = true, style }: { title: string; rank: HeroRank; as?: "h1" | "h2"; onDark?: boolean; style?: CSSProperties }) {
  const type = heroTitleType(title, rank);
  return (
    <Tag
      style={{
        fontFamily: "var(--font-heading)",
        fontWeight: 900,
        fontSize: type.size,
        lineHeight: `${type.lineHeight}px`,
        letterSpacing: `${type.tracking}em`,
        color: onDark ? "#fff" : C("chalk"),
        margin: 0,
        maxWidth: "16ch",
        textWrap: "balance",
        display: "-webkit-box",
        WebkitLineClamp: type.maxLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        ...style,
      }}
    >
      {title}
    </Tag>
  );
}

/* ── HeroBackground ──────────────────────────────────────────────────────── */

export function HeroBackground({ backdrop, accent, glyph, emblem, colourArt }: { backdrop: HeroBackdropKind; accent: string; glyph?: string; emblem?: boolean; colourArt?: boolean }) {
  if (backdrop === "field") return null; // the page's own lg-field is the ground
  const story = backdrop === "story";
  const mirrored = heroLight(emblem ? "container" : "item") === "left";
  const ink = story ? HERO_TAKEOVER_INK : HERO_INK;
  const artOut = colourArt ? `max(0, calc(1 - ${P} / ${HERO.colourArtOut}))` : `calc(1 - ${P} * ${(1 - HERO.artFloor.ghost).toFixed(2)})`;
  return (
    <>
      {story ? (
        <>
          <span aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(90% 60% at 88% 4%, color-mix(in srgb, ${accent} 16%, transparent), transparent 60%)` }} />
          <span aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(80% 60% at 8% 88%, color-mix(in srgb, ${accent} 10%, transparent), transparent 60%)` }} />
        </>
      ) : (
        <>
          <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(${mirrored ? "158deg" : "202deg"}, color-mix(in srgb, ${accent} 52%, ${ink}) 0%, color-mix(in srgb, ${accent} 15%, ${ink}) 46%, ${ink} 100%)` }} />
          <span aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 92% at ${mirrored ? "14% 8%" : "86% 8%"}, color-mix(in srgb, ${accent} 42%, transparent), transparent 55%)` }} />
        </>
      )}
      {!!glyph && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: emblem ? -18 : -36,
            right: emblem ? -34 : -16,
            fontSize: emblem ? 218 : 152,
            lineHeight: 1,
            color: colourArt ? undefined : `rgba(255,255,255,${emblem ? ".09" : ".07"})`,
            filter: colourArt ? "drop-shadow(0 18px 40px rgba(0,0,0,.5))" : undefined,
            pointerEvents: "none",
            opacity: artOut,
            transform: `translateY(calc(${P} * ${Math.round(100 * (emblem ? HERO.parallax.emblem : HERO.parallax.art))}%))`,
          }}
        >
          {glyph}
        </span>
      )}
      {/* legibility scrim — retired as the title leaves; its last sliver runs
          out to fully opaque hero ink so the seam below starts from the same
          colour. */}
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, ${ink} 0%, color-mix(in srgb, ${ink} 50%, transparent) 3%, transparent 52%)`, opacity: `calc(1 - ${P})` }} />
    </>
  );
}

/* ── the seam ────────────────────────────────────────────────────────────── */

const BLEED_OVER = 64;
const BLEED_FADE = 148;
const BLEED_BG = (() => {
  const head = (BLEED_OVER / (BLEED_OVER + BLEED_FADE)) * 100;
  const at = (f: number) => (head + f * (100 - head)).toFixed(2);
  const ink = (a: number) => `color-mix(in srgb, ${HERO_INK} ${a}%, transparent)`;
  return `linear-gradient(180deg, ${HERO_INK} 0%, ${HERO_INK} ${head.toFixed(2)}%, ${ink(90)} ${at(0.22)}%, ${ink(62)} ${at(0.45)}%, ${ink(30)} ${at(0.68)}%, ${ink(0)} 100%)`;
})();

/* ── HeroScreen — the assembled default ──────────────────────────────────── */

export interface HeroSpec {
  rank: HeroRank;
  mode?: HeroMode;
  title: string;
  eyebrow?: string;
  eyebrowMark?: string;
  meta?: (string | null | undefined | false)[];
  accent?: string;
  glyph?: string;
  emblem?: boolean;
  colourArt?: boolean;
}

/**
 * The container every web screen composes. Web has no safe-area inset to
 * reserve (the browser chrome owns it), so the hero's geometry is computed at
 * safeTop 0 — every other number, including where the rail sits and when the
 * title leaves, is the same one mobile uses.
 */
export function HeroScreen({
  hero,
  back,
  backLabel,
  accessory,
  rail,
  dock,
  titleAs = "h1",
  children,
}: {
  hero: HeroSpec;
  /** `false` renders no button — a root screen with nothing to pop. The rail
   *  still keeps an empty leading slot, so the title's y never shifts between a
   *  root and a pushed screen. Mobile parity: the same prop shape. */
  back?: (() => void) | false;
  backLabel?: string;
  accessory?: ReactNode;
  rail?: ReactNode;
  dock?: ReactNode;
  titleAs?: "h1" | "h2";
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const mode = hero.mode ?? "page";
  const accent = hero.accent ?? C("lime");
  const geom = heroGeometry(hero.rank, 0, mode);
  const backdrop = heroBackdrop(hero.rank, mode, !!hero.glyph);
  const onDark = backdrop !== "field";
  const docked = useHeroCollapse(rootRef, heroRef, geom.delta);
  const { titleOut, inlineIn, hairlineIn, dock: dockAt } = HERO.detent;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div
        ref={heroRef}
        style={{
          position: "sticky",
          top: -geom.delta,
          zIndex: 30,
          height: geom.height,
          margin: "calc(-1 * var(--page-pad-top, 16px)) calc(-1 * var(--page-pad-x, 16px)) 0",
          overflow: "hidden",
          background: onDark ? (mode === "takeover" ? HERO_TAKEOVER_INK : HERO_INK) : "transparent",
          color: onDark ? "#fff" : C("chalk"),
        }}
      >
        {/* THE BAR'S MATERIAL — see the mobile twin. A dark ground is already
            opaque; the `field` ground is transparent, and without this the page
            would scroll BEHIND the inline title once the hero is barred. */}
        {!onDark && (
          <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: geom.barHeight, background: "color-mix(in srgb, var(--color-ink) 72%, transparent)", backdropFilter: "blur(18px) saturate(1.4)", WebkitBackdropFilter: "blur(18px) saturate(1.4)", opacity: ramp(hairlineIn, 1) }} />
        )}

        <HeroBackground backdrop={backdrop} accent={accent} glyph={hero.glyph} emblem={hero.emblem} colourArt={hero.colourArt} />

        {/* THE RAIL — counter-translates the frame so the nav button never
            moves on screen, at the identical y in every rank. */}
        <div
          style={{
            position: "absolute",
            top: geom.railTop,
            left: HERO.gutter.edge,
            right: HERO.gutter.edge,
            height: HERO.rail.height,
            display: "flex",
            alignItems: "center",
            zIndex: 3,
            transform: `translateY(calc(${P} * ${geom.delta}px))`,
          }}
        >
          {back ? <HeroNav onClick={back} fromLabel={backLabel} mode={mode} material={heroNavMaterial(backdrop, false)} onDark={onDark} /> : <span style={{ width: HERO.nav.hit }} />}
          {/* the collapsed bar's inline title — arrives only after the display
              title has fully left */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: HERO.nav.hit + 8,
              right: HERO.nav.hit + 8,
              height: HERO.rail.height,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              opacity: ramp(inlineIn, 1),
            }}
          >
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: HERO_INLINE_TITLE.size, letterSpacing: `${HERO_INLINE_TITLE.tracking}em`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{hero.title}</span>
          </div>
          <span style={{ flex: 1 }} />
          {accessory}
        </div>

        {/* the display block — BOTTOM-ANCHORED, so a two-line title grows
            upward and nothing below the hero moves when a name gets longer */}
        {hero.rank !== "bar" && (
          <div style={{ position: "absolute", left: HERO.gutter.hero, right: HERO.gutter.hero, bottom: HERO.rail.bottom + 10, opacity: `calc(1 - ${ramp(0, titleOut)})` }}>
            {!!hero.eyebrow && (
              <div style={{ marginBottom: 10 }}>
                <HeroEyebrow label={hero.eyebrow} tone={backdrop === "art" ? "solid" : "tint"} accent={accent} mark={hero.eyebrowMark} />
              </div>
            )}
            <HeroTitle title={hero.title} rank={hero.rank} as={titleAs} onDark={onDark} style={{ textShadow: onDark ? "0 2px 18px rgba(0,0,0,.35)" : undefined }} />
            {!!hero.meta?.length && (
              <div style={{ marginTop: 8 }}>
                <HeroMetadata parts={hero.meta} onDark={onDark} />
              </div>
            )}
          </div>
        )}

        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: onDark ? `rgba(255,255,255,${HERO.alpha.hairline})` : C("line"), opacity: ramp(hairlineIn, 1) }} />
      </div>

      {/* the hero ink bleeding into the page — zero-height and behind the
          content, so it costs no layout */}
      {onDark && (
        <div aria-hidden style={{ position: "relative", height: 0, zIndex: -1, pointerEvents: "none" }}>
          <span style={{ position: "absolute", top: -BLEED_OVER, left: "calc(-1 * var(--page-pad-x, 16px))", right: "calc(-1 * var(--page-pad-x, 16px))", height: BLEED_OVER + BLEED_FADE, background: BLEED_BG, opacity: `calc(var(--cover-bleed, 1) * (1 - ${P}))` }} />
        </div>
      )}

      {rail && (
        <div style={{ position: "sticky", top: geom.barHeight, zIndex: 20, margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "0 var(--page-pad-x, 16px)", background: "color-mix(in srgb, var(--color-ink) 88%, transparent)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderBottom: `1px solid ${C("line")}` }}>{rail}</div>
      )}

      {children}

      {dock && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, padding: "0 var(--page-pad-x, 16px) 16px", pointerEvents: docked ? "auto" : "none", opacity: ramp(dockAt, 1), transform: `translateY(calc((1 - ${ramp(dockAt, 1)}) * ${HERO.motion.rise}px))` }}>{dock}</div>
      )}
    </div>
  );
}
