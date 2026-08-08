import { useEffect, useState } from "react";
import { View, Text, Image, Linking, AccessibilityInfo } from "react-native";
import { exerciseMedia, exerciseThumb, type ExerciseMediaAsset } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F, PressScale as Pressable } from "../../lib/ui";
import AuroraExerciseAnimation from "./exercise-animation";

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
 * Variants: "hero" (the framed demo in the How-it's-done sheet) and "thumb" (a
 * small square for rows — renders NOTHING until real art exists, so rows keep
 * their initials tile instead of 200 identical stick figures).
 *
 * mp4 CLIPS don't play inline here — the app carries no native video player
 * (see capabilities: exercise-media-video-mobile) — so a clip shows its poster
 * and opens out to play, exactly like a hosted link.
 */
export default function AuroraExerciseMedia({
  name,
  active = true,
  variant = "hero",
  size = 40,
}: {
  name: string;
  /** Loops only while the surface is visible (sheet open). */
  active?: boolean;
  variant?: "hero" | "thumb";
  /** Square edge for the thumb variant. */
  size?: number;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const m = exerciseMedia(name);
  if (variant === "thumb") return <Thumb name={name} size={size} C={C} />;
  if (!m.asset && !m.fallback) return null; // a name the DB doesn't know

  const note = m.status === "pending" ? t("w.analyze.exp.media.pending") : m.status === "pattern" ? t("w.analyze.exp.media.pattern") : null;
  const credit = m.asset?.credit;
  const openHref = m.asset?.kind === "link" ? m.asset.href : m.asset?.kind === "clip" ? m.asset.src : null;
  const tag = { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase" as const, color: C.ash };

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

/* ── the row thumbnail (nothing until the art exists) ── */

function Thumb({ name, size, C }: { name: string; size: number; C: Palette }) {
  const src = exerciseThumb(name);
  if (!src) return null;
  return (
    <Image
      source={{ uri: src }}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      style={{ width: size, height: size, borderRadius: 12, backgroundColor: C.ink2 }}
    />
  );
}
