"use client";

import { useMemo } from "react";
import {
  fs, space, fmtWeight, formatPace,
  FITNESS_LEVELS, LEVEL_KEY,
  type LoggedSession, type WeightUnit,
} from "@hybrid/core";
import { accentText } from "@/lib/ui";
import { useFitnessLevel, type FitnessLevelRead } from "@/lib/use-fitness-level";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";

/**
 * YOUR LEVEL — the Performance card.
 *
 * THE READING ORDER IS THE DESIGN. Four beats, each skippable, none load-bearing
 * for the one before it:
 *
 *   1. THE GLANCE — the level as one word at 40px. No unit, no context needed,
 *      no reading involved. Most visits end here and that is the card working.
 *   2. THE PLACEMENT — five segments, one per tier, filled as far as the athlete
 *      has climbed and part-filled for the tier they are in. The shape carries
 *      both facts at once: which tier, and how far into it.
 *   3. THE REASON — one plain sentence, in the units they loaded on the bar.
 *      Never opens on a ratio: "your 180 kg deadlift" is a thing they remember
 *      doing, "2.20 × bodyweight" is arithmetic homework.
 *   4. THE AUDIT — the ratios in fine mono, and the door to the full working.
 *
 * WHY THE SEGMENTS AND NOT A SCALE. An earlier cut drew a hairline axis with a
 * travelling tick and Untrained/Elite end labels. Nothing else in HYBRID has
 * ever drawn an axis — the app says "how far along" with a filled track, a lit
 * spine, flex segments or a chip, and reaching past all four for chart
 * vocabulary was the tell. These segments are the readiness deficit bar's
 * geometry painted with the provenance ladder's own rule: full lime for the
 * tier you are in, lime at 40% for the ones you have passed.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW. The spread across lifts (an athlete whose
 * bench is a tier behind the rest of them) is real news and belongs at the top
 * of the working, not on the first thing they meet. The card summarises; the
 * Volume screen explains.
 *
 * Mirrors apps/mobile/components/aurora/level-card.tsx.
 */
const C = (v: string) => `var(--color-${v})`;

const CARD = {
  background: C("ink2"),
  border: `1px solid ${C("line")}`,
  borderRadius: 28,
  boxShadow: "var(--shadow-card)",
  padding: 20,
} as const;

const mono = (size: number) => ({ fontFamily: "var(--font-mono)", fontSize: size } as const);

/**
 * THE TIER SEGMENTS. Five, always — an unmeasured athlete gets five unlit ones
 * rather than a hidden row, because "we could not read this" and "you are at
 * the bottom" must not look the same.
 */
function Tiers({ index, progress }: { index: number; progress: number }) {
  return (
    <div style={{ display: "flex", gap: 2, height: 8, marginTop: 18 }} aria-hidden>
      {FITNESS_LEVELS.map((_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            borderRadius: 2,
            overflow: "hidden",
            // Passed tiers carry the ladder's held-back lime; the one in play is
            // an empty track that fills to how far through it the athlete is.
            background: i < index ? C("lime") : C("ink"),
            opacity: i < index ? 0.4 : 1,
          }}
        >
          {i === index && (
            // A floor of 4%, so an athlete two percent into a tier still sees
            // that they are in it. Zero width reads as "not started", which is
            // a different and wrong claim.
            <span style={{ display: "block", height: "100%", width: `${Math.max(4, progress * 100)}%`, background: C("lime"), borderRadius: 2 }} />
          )}
        </span>
      ))}
    </div>
  );
}

export default function LevelCard({ sessions, onOpenWorking, read }: {
  sessions: LoggedSession[];
  /** The door to the full working — the Volume screen's provenance block. */
  onOpenWorking?: () => void;
  /** Pass a resolution in when the parent already has one, so a screen holding
   *  both this card and the Volume block computes the estimate exactly once. */
  read?: FitnessLevelRead;
}) {
  const { t } = useLang();
  const prefs = useLoggerPrefs();
  const units: WeightUnit = prefs.units;
  const own = useFitnessLevel(sessions);
  const { estimate, level, reach } = read ?? own;

  // THE SENTENCE, ASSEMBLED. Two clauses from values the engine already holds —
  // never one string, so it stays true in every state and survives translation
  // without a rewrite.
  const say = useMemo(() => {
    const top = estimate.evidence[0];
    if (!level || !top || !reach) return null;
    const why = top.kind === "strength"
      ? t("w.analyze.vol.levelWhyStrength")
          .replace("{load}", fmtWeight(top.e1rm ?? 0, units))
          .replace("{lift}", top.lift)
      : t("w.analyze.vol.levelWhyRun")
          .replace("{dist}", top.lift)
          .replace("{pace}", `${formatPace(top.ratio)} ${t("w.analyze.vol.levelPace")}`);

    // The figures are shown in the unit the athlete trains in, and the gap is
    // derived from the SAME rounded values as the target, so "225 kg, 45 kg
    // above your best" is arithmetic they can check rather than three
    // independently-rounded numbers that happen not to add up.
    const fmt = (v: number) => (reach.kind === "strength" ? fmtWeight(v, units) : `${formatPace(v)}`);
    const next = reach.next
      ? t(reach.kind === "strength" ? "w.analyze.vol.levelNextLift" : "w.analyze.vol.levelNextRun")
          .replace("{tier}", t(LEVEL_KEY[reach.next]))
          .replace("{target}", fmt(reach.target))
          .replace("{gap}", fmt(reach.gap))
      // Nothing above elite, so the reach becomes the margin. Same shape of
      // sentence, different clause.
      : t("w.analyze.vol.levelTop").replace("{gap}", fmt(reach.gap));
    return `${why} ${next}`;
  }, [estimate, level, reach, t, units]);

  const index = level ? FITNESS_LEVELS.indexOf(level) : -1;

  return (
    <div style={CARD}>
      <div style={{ ...mono(fs.micro), textTransform: "uppercase", letterSpacing: ".13em", color: C("ash") }}>
        {t("w.analyze.vol.levelCardTitle")}
      </div>

      {/* BEAT 1 — the answer, before any reading has been decided on. The type
          scale is set by the LONGEST level word rather than the current one, so
          crossing a threshold never reflows the card underneath the athlete. */}
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: level ? 40 : 26,
          letterSpacing: "-.042em",
          lineHeight: 1.05,
          color: level ? C("chalk") : C("ash"),
          marginTop: 7,
        }}
      >
        {level ? t(LEVEL_KEY[level]) : t("w.analyze.vol.levelNotMeasured")}
      </div>

      {/* BEAT 2 — where in the range, without a word being read. */}
      <Tiers index={index} progress={reach?.progress ?? 0} />
      {level && (
        <div style={{ ...mono(fs.micro), letterSpacing: ".09em", textTransform: "uppercase", color: C("ash"), marginTop: 9 }}>
          {t("w.analyze.vol.levelTier").replace("{n}", String(index + 1))}
        </div>
      )}

      {/* BEAT 3 — the reason, in kilos and minutes rather than ratios. */}
      <p style={{ margin: "20px 0 0", fontSize: fs.bodyLg, lineHeight: 1.5, color: C("ash") }}>
        {say ?? t("w.analyze.vol.levelEmptyCard")}
      </p>

      {/* BEAT 4 — the ratios that actually drive the engine, held back for the
          second read. Uses the `× bodyweight` notation the Volume screen has
          shipped all along, so the two surfaces speak one language. */}
      {level && (
        <div style={{ ...mono(fs.nano), letterSpacing: ".05em", color: C("ash"), opacity: 0.75, marginTop: 13 }}>
          {estimate.evidence
            .slice(0, 2)
            .map((e) => (e.kind === "strength"
              ? `${e.ratio.toFixed(2)} ${t("w.analyze.vol.ofBodyweight")}`
              : `${formatPace(e.ratio)} ${t("w.analyze.vol.levelPace")}`))
            .join(" – ")}
        </div>
      )}

      {/* The card grows by one line HERE and only here — the estimate reading
          differently from what the athlete told us. Theirs still wins inside the
          volume model; this reports the disagreement rather than resolving it. */}
      {level && estimate.strengthLevel && (
        <Disagreement estimate={estimate} />
      )}

      {onOpenWorking && (
        <button
          className="pressable"
          type="button"
          onClick={onOpenWorking}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm,
            width: "100%", marginTop: 16, paddingTop: 13, border: 0, borderTop: `1px solid ${C("line")}`,
            background: "transparent", textAlign: "left", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: fs.caption, color: C("ash") }}>
            {level
              ? `${Math.round(estimate.confidence * 100)}% ${t("w.analyze.vol.confidence")}`
              : t("w.analyze.vol.showWork")}
          </span>
          <span aria-hidden style={{ ...mono(fs.body), color: accentText("lime") }}>→</span>
        </button>
      )}
    </div>
  );
}

/** The one conditional line. Split out so the card body reads as four beats. */
function Disagreement({ estimate }: { estimate: FitnessLevelRead["estimate"] }) {
  const { t } = useLang();
  const prefs = useLoggerPrefs();
  const stated = prefs.volumeProfile.experience;
  // Only a STATED answer can disagree — with nothing typed there is no conflict,
  // just an estimate filling a gap.
  if (!stated || !estimate.strengthLevel) return null;
  const derived = estimate.strengthLevel;
  const same = (derived === "untrained" || derived === "novice") ? stated === "beginner"
    : derived === "intermediate" ? stated === "intermediate"
    : stated === "advanced";
  if (same) return null;
  return (
    <p style={{ margin: "14px 0 0", paddingTop: 12, borderTop: `1px solid ${C("line")}`, fontSize: fs.caption, lineHeight: 1.5, color: accentText("amber") }}>
      {t("w.analyze.vol.levelDisagrees")}
    </p>
  );
}
