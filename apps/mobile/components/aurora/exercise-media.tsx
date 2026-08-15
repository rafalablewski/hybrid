import { useEffect, useState } from "react";
import { View, Text, Image, Linking, AccessibilityInfo } from "react-native";
import { exerciseMedia, exerciseThumb, inferBlockKind, type ExerciseMediaAsset } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F, tracking, PressScale as Pressable } from "../../lib/ui";
import { AMarkTile } from "./kit";
import AuroraExerciseAnimation from "./exercise-animation";
import AuroraExerciseMark from "./exercise-mark";

/**
 * The exercise DEMO MEDIA surface (mobile) — one component for every place a
 * lift needs a picture. Twin of apps/web/components/aurora/exercise-media.tsx.
 *
 * It resolves the media from @hybrid/core (exerciseMedia) and renders whichever
 * of the drawn shapes came back (still / loop / clip / link). TODAY nothing is
 * drawn yet, so every lift lands on the PLACEHOLDER: the procedural stick-figure
 * demo, framed and tagged so it reads as a deliberate stand-in rather than a
 * missing asset. When the hand-drawn art is registered in core
 * (registerSketchMedia) or pointed at from the admin library, this switches over
 * with no change here.
 *
 * Variants: "hero" (the framed demo in the How-it's-done sheet) and "thumb" (the
 * contents of a row/card's tile: the drawn art once it exists, and until then
 * the lift's IMPLEMENT MARK — core: exercise-marks. It renders the glyph only;
 * the calling surface owns the tile's box, border and background).
 *
 * mp4 CLIPS don't play inline here — the app carries no native video player
 * (see capabilities: exercise-media-video-mobile) — so a clip shows its poster
 * and opens out to play, exactly like a hosted link.
 */
export default function AuroraExerciseMedia({
  name,
  active = true,
  variant = "hero",
  size = 22,
  tint,
}: {
  name: string;
  /** Loops only while the surface is visible (sheet open). */
  active?: boolean;
  variant?: "hero" | "thumb";
  /** Glyph size for the thumb variant (the tile's box is the caller's). */
  size?: number;
  /** Mark colour; defaults to the lift's modality accent. */
  tint?: string;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const m = exerciseMedia(name);
  if (variant === "thumb") return <Thumb name={name} size={size} tint={tint ?? modalityTint(name, C)} />;
  if (!m.asset && !m.fallback) return null; // a name the DB doesn't know

  const note = m.status === "pending" ? t("w.analyze.exp.media.pending") : m.status === "pattern" ? t("w.analyze.exp.media.pattern") : null;
  const credit = m.asset?.credit;
  const openHref = m.asset?.kind === "link" ? m.asset.href : m.asset?.kind === "clip" ? m.asset.src : null;
  const tag = { fontFamily: F.mono, fontSize: 10, letterSpacing: tracking.caps, textTransform: "uppercase" as const, color: C.ash };

  return (
    <View style={{ borderRadius: 28, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingVertical: 10, paddingHorizontal: 16 }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: "58%", maxWidth: 220, aspectRatio: 1 }}>
          {/* A clip/link with no poster has nothing to draw here — the
              procedural demo keeps the frame honest while the open-out action
              sits below it. */}
          {m.asset && (m.asset.kind === "still" || m.asset.kind === "loop" || m.asset.poster)
            ? <Asset asset={m.asset} alt={m.alt} active={active} />
            : <AuroraExerciseAnimation name={name} active={active} />}
        </View>
      </View>
      {(note || credit) && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
          <Text style={tag}>{note}</Text>
          {credit ? <Text style={tag}>{credit}</Text> : null}
        </View>
      )}
      {openHref && (
        <Pressable onPress={() => Linking.openURL(openHref).catch(() => {})} accessibilityRole="link" style={{ marginTop: 8, alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.analyze.exp.media.watch")} ↗</Text>
        </Pressable>
      )}
    </View>
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
    case "link":
      return asset.poster ? <Frame src={asset.poster} alt={alt} /> : null;
  }
}

function Frame({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/** A drawn loop — several frames cross-faded, or ONE self-animating file
 *  (animated WebP/GIF), which Image loops on its own. */
function Loop({ frames, cycleMs, poster, alt, active }: { frames: string[]; cycleMs: number; poster?: string; alt: string; active: boolean }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (frames.length <= 1 || !active) return;
    let id: ReturnType<typeof setInterval> | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      const per = Math.max(60, cycleMs / frames.length);
      id = setInterval(() => setI((n) => (n + 1) % frames.length), per);
    });
    return () => {
      if (id) clearInterval(id);
    };
  }, [frames.length, cycleMs, active]);

  if (frames.length === 1) return <Frame src={active ? frames[0]! : poster ?? frames[0]!} alt={alt} />;
  return (
    <View style={{ width: "100%", height: "100%" }}>
      {frames.map((src, n) => (
        <Image
          key={n}
          source={{ uri: src }}
          accessibilityLabel={n === 0 ? alt : undefined}
          accessibilityElementsHidden={n !== 0}
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, width: "100%", height: "100%", opacity: n === i ? 1 : 0 }}
        />
      ))}
    </View>
  );
}

/* ── the exercise AVATAR: the tile that carries the thumb ── */

/**
 * THE EXERCISE AVATAR — what a lift wears in a row, a card header or a picker
 * result: the kit's square `AMarkTile` with the lift's own mark already inside.
 * A lift is a THING — an implement, a drawing, a piece of the catalogue — not a
 * face, so it takes the square and a PERSON keeps the circle.
 *
 * The box is the kit's, not this file's and certainly not the call site's: five
 * surfaces drew their own before the tile existed. This is now the ONLY way a
 * lift is pictured in a row or a header — `variant="thumb"` is still offered for
 * a surface that genuinely owns its own frame, but nothing takes it today, so
 * treat a new caller of it as a question rather than a pattern.
 */
export function AuroraExerciseAvatar({
  name,
  size = 40,
  glyph,
  tint,
  icon,
  label,
}: {
  name: string;
  /** The tile's box. */
  size?: number;
  /** Mark size inside the box; defaults to 60% of it. */
  glyph?: number;
  /** Mark colour; defaults to the lift's modality accent. */
  tint?: string;
  /** A catalogue emoji, drawn in place of the implement mark when present. */
  icon?: string | null;
  /** a11y label — see `AMarkTile`; give one only where the row doesn't already say it. */
  label?: string;
}) {
  const { palette: C } = useTheme();
  return (
    <AMarkTile size={size} label={label}>
      {icon
        ? <Text style={{ fontSize: Math.round(size * 0.42) }}>{icon}</Text>
        : <Thumb name={name} size={glyph ?? Math.round(size * 0.6)} tint={tint ?? modalityTint(name, C)} />}
    </AMarkTile>
  );
}

/* ── the row tile: the drawing if we have it, the implement mark if we don't ── */

/** The modality accent a lift's mark is drawn in — the same three-way tint the
 *  rows already used for their initials (strength / cardio / conditioning). */
export function modalityTint(name: string, C: Palette): string {
  const kind = inferBlockKind(name);
  return txt(C, kind === "strength" ? C.lime : kind === "cardio" ? C.blue : C.violet);
}

function Thumb({ name, size, tint }: { name: string; size: number; tint: string }) {
  const src = exerciseThumb(name);
  if (src)
    return (
      <Image
        source={{ uri: src }}
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        style={{ width: "100%", height: "100%" }}
      />
    );
  return <AuroraExerciseMark name={name} size={size} color={tint} />;
}
