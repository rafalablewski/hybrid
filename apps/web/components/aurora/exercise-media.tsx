"use client";

import { useEffect, useState } from "react";
import { exerciseMedia, exerciseThumb, fs, inferBlockKind, type ExerciseMediaAsset } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import AuroraExerciseAnimation from "./exercise-animation";
import AuroraExerciseMark from "./exercise-mark";

const C = (v: string) => `var(--color-${v})`;
const monoTag = {
  fontFamily: "var(--font-mono)" as const,
  fontSize: fs.nano,
  letterSpacing: 1.1,
  textTransform: "uppercase" as const,
  color: C("ash"),
};

/**
 * The exercise DEMO MEDIA surface (web) — one component for every place a lift
 * needs a picture.
 *
 * It resolves the media from @hybrid/core (exerciseMedia) and renders whichever
 * of the four drawn shapes came back (still / loop / clip / link). TODAY nothing
 * is drawn yet, so every lift lands on the PLACEHOLDER: the procedural
 * stick-figure demo, framed and tagged so it reads as a deliberate stand-in
 * rather than a missing asset. When the hand-drawn art is registered in core
 * (registerSketchMedia) or pointed at from the admin library, this switches over
 * with no change here.
 *
 * Two variants:
 *  - "hero" — the framed demo on the exercise page's How-it's-done sheet.
 *  - "thumb" — the contents of a row/card's tile: the drawn art once it exists,
 *    and until then the lift's IMPLEMENT MARK (core: exercise-marks) — a barbell,
 *    a pair of bells, a cable handle. It renders the glyph only; the calling
 *    surface owns the tile's box, border and background.
 *
 * Parity: apps/mobile/components/aurora/exercise-media.tsx.
 */
export default function AuroraExerciseMedia({
  name,
  active = true,
  variant = "hero",
  size = 22,
  tint,
}: {
  name: string;
  /** Loops only while the surface is visible (sheet open, row on screen). */
  active?: boolean;
  variant?: "hero" | "thumb";
  /** Glyph size for the thumb variant (the tile's box is the caller's). */
  size?: number;
  /** Mark colour; defaults to the lift's modality accent. */
  tint?: string;
}) {
  const { t } = useLang();
  const m = exerciseMedia(name);
  if (variant === "thumb") return <Thumb name={name} size={size} tint={tint ?? modalityTint(name)} />;
  if (!m.asset && !m.fallback) return null; // a name the DB doesn't know

  const note = m.status === "pending" ? t("w.analyze.exp.media.pending") : m.status === "pattern" ? t("w.analyze.exp.media.pattern") : null;
  const credit = m.asset?.credit;

  return (
    <div style={{ marginTop: 4, borderRadius: 28, border: `1px solid ${C("line")}`, background: C("ink2"), padding: "10px 16px" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: "58%", maxWidth: 220 }}>
          {/* A link with no poster has nothing to draw — the procedural demo
              keeps the frame honest while the open-out action sits below it. */}
          {m.asset && (m.asset.kind !== "link" || m.asset.poster)
            ? <Asset asset={m.asset} alt={m.alt} active={active} />
            : <AuroraExerciseAnimation name={name} active={active} />}
        </div>
      </div>
      {(note || credit) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
          <span style={monoTag}>{note}</span>
          {credit && <span style={monoTag}>{credit}</span>}
        </div>
      )}
      {m.asset?.kind === "link" && (
        <a
          href={m.asset.href}
          target="_blank"
          rel="noreferrer"
          className="pressable"
          style={{ display: "block", marginTop: 8, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", textDecoration: "none" }}
        >
          {t("w.analyze.exp.media.watch")} ↗
        </a>
      )}
    </div>
  );
}

/* ── the drawn shapes ── */

function Asset({ asset, alt, active }: { asset: ExerciseMediaAsset; alt: string; active: boolean }) {
  switch (asset.kind) {
    case "still":
      return <Frame src={asset.src} alt={alt} />;
    case "loop":
      return <Loop frames={asset.frames} cycleMs={asset.cycleMs} poster={asset.poster} alt={alt} active={active} />;
    case "clip":
      return (
        <video
          src={asset.src}
          poster={asset.poster}
          muted
          loop
          playsInline
          autoPlay={active}
          aria-label={alt}
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block" }}
        />
      );
    case "link":
      return asset.poster ? <Frame src={asset.poster} alt={alt} /> : null;
  }
}

function Frame({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block" }} />;
}

/** A drawn loop — several frames cross-faded, or ONE self-animating file
 *  (animated WebP/GIF), which the browser loops on its own. */
function Loop({ frames, cycleMs, poster, alt, active }: { frames: string[]; cycleMs: number; poster?: string; alt: string; active: boolean }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (frames.length <= 1 || !active) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const per = Math.max(60, cycleMs / frames.length);
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), per);
    return () => clearInterval(id);
  }, [frames.length, cycleMs, active]);

  if (frames.length === 1) return <Frame src={active ? frames[0]! : poster ?? frames[0]!} alt={alt} />;
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
      {frames.map((src, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src={src}
          alt={n === 0 ? alt : ""}
          aria-hidden={n !== 0}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: n === i ? 1 : 0, transition: "opacity .12s linear" }}
        />
      ))}
    </div>
  );
}

/* ── the row tile: the drawing if we have it, the implement mark if we don't ── */

/** The modality accent a lift's mark is drawn in — the same three-way tint the
 *  rows already used for their initials (strength / cardio / conditioning). */
function modalityTint(name: string): string {
  const kind = inferBlockKind(name);
  return kind === "strength" ? "var(--lime-text)" : kind === "cardio" ? "var(--blue-text)" : "var(--violet-text)";
}

function Thumb({ name, size, tint }: { name: string; size: number; tint: string }) {
  const src = exerciseThumb(name);
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />;
  return <AuroraExerciseMark name={name} size={size} color={tint} />;
}
