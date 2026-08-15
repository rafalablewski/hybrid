import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  fs, fmtWeight,
  FITNESS_LEVELS, LEVEL_KEY, ENDURANCE_DISCIPLINE_KEY, enduranceFigure,
  type LevelEvidence,
  type LoggedSession, type WeightUnit, type FitnessLevelEstimate,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, tracking, leading } from "../../lib/ui";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useFitnessLevel, type FitnessLevelRead } from "../../lib/use-fitness-level";
import { ACard, CardFoot } from "./kit";
import { withAlpha } from "./field";

/**
 * YOUR LEVEL — the Performance card. The mobile twin of
 * apps/web/components/aurora/level-card.tsx; both read the same estimate and
 * render the same four beats, so neither client can say a different word.
 *
 * THE READING ORDER IS THE DESIGN. Four beats, each skippable, none load-bearing
 * for the one before it:
 *
 *   1. THE GLANCE — the level as one word. No unit, no context needed, no
 *      reading involved. Most visits end here and that is the card working.
 *   2. THE PLACEMENT — five segments, one per tier, filled as far as the athlete
 *      has climbed and part-filled for the tier they are in.
 *   3. THE REASON — one plain sentence, in the units they loaded on the bar.
 *      Never opens on a ratio: "your 180 kg deadlift" is a thing they remember
 *      doing, "2.20 × bodyweight" is arithmetic homework.
 *   4. THE AUDIT — the ratios in fine mono, and the door to the full working.
 *
 * WHY SEGMENTS AND NOT A SCALE. An earlier cut drew a hairline axis with a
 * travelling tick. Nothing in HYBRID has ever drawn an axis — the app says "how
 * far along" with a filled track, a lit spine, flex segments or a chip. These
 * are the readiness deficit bar's geometry painted with the provenance ladder's
 * rule: full lime for the tier you are in, lime held back for the ones passed.
 */
export default function LevelCard({ sessions, read }: {
  sessions: LoggedSession[];
  /** Pass a resolution in when the parent already has one, so a screen holding
   *  both this card and the Volume block computes the estimate exactly once. */
  read?: FitnessLevelRead;
}) {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const prefs = useLoggerPrefs();
  const units: WeightUnit = prefs.units;
  const own = useFitnessLevel(sessions);
  const { estimate, level, reach } = read ?? own;
  const [workOpen, setWorkOpen] = useState(false);

  // One formatter for every endurance figure on the card, so the sentence and
  // the fine line below it can never quote the same effort in two units.
  // DECLARED BEFORE the sentence below: a useMemo factory runs DURING render,
  // so a `const` helper defined under it is still in its dead zone when the
  // memo reads it — and an endurance-topped athlete crashed the whole screen.
  const figure = (e: { discipline?: LevelEvidence["discipline"]; ratio: number }) => {
    const f = enduranceFigure(e);
    return `${f.value} ${t(f.unitKey)}`;
  };

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
          // "your 10.0 km swim", "your 40 min ride" — the discipline is named,
          // because six of them can reach this sentence now and "10.0 km" alone
          // no longer says which one.
          .replace("{dist}", `${top.lift} ${t(ENDURANCE_DISCIPLINE_KEY[top.discipline ?? "running"])}`)
          .replace("{pace}", figure(top));
    // Kilos for a lift; for an endurance reach, the discipline's OWN unit — a
    // swim is quoted per 100 m and a ride in W/kg, and rendering either as a
    // per-km clock would be a different claim, not a rounding difference.
    const fmt = (v: number) =>
      reach.kind === "strength" ? fmtWeight(v, units) : enduranceFigure({ discipline: top.discipline, ratio: v }).value;
    const next = reach.next
      ? t(reach.kind === "strength" ? "w.analyze.vol.levelNextLift" : "w.analyze.vol.levelNextRun")
          .replace("{tier}", t(LEVEL_KEY[reach.next]))
          .replace("{target}", fmt(reach.target))
          .replace("{gap}", fmt(reach.gap))
      : t("w.analyze.vol.levelTop").replace("{gap}", fmt(reach.gap));
    return `${why} ${next}`;
  }, [estimate, level, reach, t, units]);

  const index = level ? FITNESS_LEVELS.indexOf(level) : -1;
  const progress = reach?.progress ?? 0;

  return (
    <ACard solid style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>
        {t("w.analyze.vol.levelCardTitle")}
      </Text>

      {/* BEAT 1 — the answer, before any reading has been decided on. */}
      <Text
        style={{
          fontFamily: F.black,
          fontSize: level ? 38 : 24,
          lineHeight: leading(level ? 38 : 24, "snug"),
          color: level ? C.chalk : C.ash,
          marginTop: 6,
        }}
      >
        {level ? t(LEVEL_KEY[level]) : t("w.analyze.vol.levelNotMeasured")}
      </Text>

      {/* BEAT 2 — where in the range, without a word being read. Five segments
          ALWAYS: an unmeasured athlete gets five unlit ones rather than a hidden
          row, because "we could not read this" and "you are at the bottom" must
          not look the same. */}
      <View style={{ flexDirection: "row", gap: 2, height: 8, marginTop: 16 }}>
        {FITNESS_LEVELS.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              borderRadius: 2,
              overflow: "hidden",
              backgroundColor: i < index ? C.lime : C.ink,
              opacity: i < index ? 0.4 : 1,
            }}
          >
            {/* A floor of 4%, so an athlete two percent into a tier still sees
                that they are in it. Zero width reads as "not started". */}
            {i === index && (
              <View style={{ height: "100%", width: `${Math.max(4, progress * 100)}%`, backgroundColor: C.lime, borderRadius: 2 }} />
            )}
          </View>
        ))}
      </View>
      {level && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash, marginTop: 8 }}>
          {t("w.analyze.vol.levelTier").replace("{n}", String(index + 1))}
        </Text>
      )}

      {/* BEAT 3 — the reason, in kilos and minutes rather than ratios. */}
      <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body, "relaxed"), color: C.ash, marginTop: 18 }}>
        {say ?? t("w.analyze.vol.levelEmptyCard")}
      </Text>

      {/* BEAT 4 — the ratios that actually drive the engine, held back for the
          second read, in the `× bodyweight` notation the Volume screen ships. */}
      {level && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, opacity: 0.75, marginTop: 12 }}>
          {estimate.evidence
            .slice(0, 2)
            .map((e) => (e.kind === "strength"
              ? `${e.ratio.toFixed(2)} ${t("w.analyze.vol.ofBodyweight")}`
              : figure(e)))
            .join(" – ")}
        </Text>
      )}

      {/* The card grows by one line HERE and only here — the estimate reading
          differently from what the athlete told us. Theirs still wins inside the
          volume model; this reports the disagreement rather than resolving it. */}
      <Disagreement estimate={estimate} />

      {/* THE FOOT. This used to be a full-width row labelled with a FIGURE —
          "55% confidence" — whose lime arrow pushed the entire Volume screen.
          Two things were wrong with it. A label has to name what happens, and a
          percentage names nothing; and a whole screen is an oversized answer to
          "why this level?", when the answer is the evidence the engine already
          holds. The figure reports above the rule; the working unfolds here. */}
      <CardFoot
        status={level ? `${Math.round(estimate.confidence * 100)}% ${t("w.analyze.vol.confidence")}` : undefined}
        expander={{ label: t("w.analyze.vol.theWorking"), open: workOpen, onToggle: () => setWorkOpen((v) => !v) }}
      >
        <Working estimate={estimate} reach={reach} figure={figure} units={units} />
      </CardFoot>
    </ACard>
  );
}

/**
 * THE WORKING — what the door used to lead to, in the card that raised the
 * question. Three beats and nothing more: every effort the estimate read, the
 * threshold that would move the athlete a tier, and why the confidence is what
 * it is. The Volume screen keeps its own provenance block for its OWN numbers;
 * the two stopped being the same door. Mirrors web.
 */
function Working({ estimate, reach, figure, units }: {
  estimate: FitnessLevelEstimate;
  reach: FitnessLevelRead["reach"];
  figure: (e: { discipline?: LevelEvidence["discipline"]; ratio: number }) => string;
  units: WeightUnit;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (estimate.evidence.length === 0) {
    return (
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginBottom: 4 }}>
        {t("w.analyze.vol.levelEmptyCard")}
      </Text>
    );
  }
  const top = estimate.evidence[0];
  const fmt = (v: number) =>
    reach?.kind === "strength" ? fmtWeight(v, units) : enduranceFigure({ discipline: top?.discipline, ratio: v }).value;
  return (
    <View style={{ paddingBottom: 4 }}>
      {/* EVERY EFFORT THE ESTIMATE READ — the spread across lifts is real news,
          and this is where it belongs: not on the first thing an athlete meets,
          but in the working they opened on purpose. */}
      {estimate.evidence.map((e, i) => (
        <View
          key={`${e.kind}-${e.lift}-${i}`}
          style={{
            flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12,
            paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: withAlpha(C.line, 0.6),
          }}
        >
          <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, flexShrink: 1 }}>
            {e.kind === "strength" ? e.lift : `${e.lift} ${t(ENDURANCE_DISCIPLINE_KEY[e.discipline ?? "running"])}`}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
            {e.kind === "strength" ? `${e.ratio.toFixed(2)} ${t("w.analyze.vol.ofBodyweight")}` : figure(e)}
          </Text>
        </View>
      ))}

      {/* THE THRESHOLD — the same numbers the sentence above quotes, so the two
          can never round apart. */}
      {reach?.next ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, lineHeight: leading(fs.nano, "relaxed"), marginTop: 12 }}>
          {t(reach.kind === "strength" ? "w.analyze.vol.levelNextLift" : "w.analyze.vol.levelNextRun")
            .replace("{tier}", t(LEVEL_KEY[reach.next]))
            .replace("{target}", fmt(reach.target))
            .replace("{gap}", fmt(reach.gap))}
        </Text>
      ) : null}

      {/* WHY THE CONFIDENCE IS WHAT IT IS. The figure prints above the rule as
          a status; this is the only place it is explained, which is the whole
          reason the status is not itself a button. */}
      {top?.confirmed === false ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption, "relaxed"), color: C.ash, marginTop: 10 }}>
          {t("w.analyze.vol.levelUnconfirmed")}
        </Text>
      ) : null}
    </View>
  );
}

/** The one conditional line. Split out so the card body reads as four beats. */
function Disagreement({ estimate }: { estimate: FitnessLevelEstimate }) {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const prefs = useLoggerPrefs();
  const stated = prefs.volumeProfile.experience;
  const derived = estimate.strengthLevel;
  // Only a STATED answer can disagree — with nothing typed there is no conflict,
  // just an estimate filling a gap.
  if (!stated || !derived) return null;
  const same = (derived === "untrained" || derived === "novice") ? stated === "beginner"
    : derived === "intermediate" ? stated === "intermediate"
    : stated === "advanced";
  if (same) return null;
  return (
    <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption, "relaxed"), color: txt(C, C.amber), marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
      {t("w.analyze.vol.levelDisagrees")}
    </Text>
  );
}
