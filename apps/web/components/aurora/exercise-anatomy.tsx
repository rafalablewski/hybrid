"use client";

import { exerciseAnatomy, fs, type MuscleActivation } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import AuroraExerciseAnimation from "./exercise-animation";

const C = (v: string) => `var(--color-${v})`;
const monoRow = (size: number, color: string) => ({
  fontFamily: "var(--font-mono)" as const,
  fontSize: size,
  letterSpacing: 0.6,
  color,
});

/* ── the muscle-activation bars ── */

function MuscleBar({ m, t }: { m: MuscleActivation; t: (k: string) => string }) {
  const primary = m.tier === "primary";
  const barColor = primary ? C("lime") : C("ash");
  const levelKey = `w.analyze.exp.anatomy.level.${m.level}`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", rowGap: 4, columnGap: 10, marginTop: 12 }}>
      <span style={{ fontSize: fs.body, fontWeight: primary ? 700 : 500, color: primary ? C("chalk") : C("ash"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
        <span style={monoRow(9, primary ? "var(--lime-text)" : C("ash"))}>{t(levelKey)}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, fontWeight: 700, color: C("chalk") }}>{m.pct}%</span>
      </span>
      <span style={{ gridColumn: "1 / -1", height: 4, borderRadius: 3, background: C("line"), overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", borderRadius: 3, width: `${m.pct}%`, background: barColor, opacity: primary ? 1 : 0.6 }} />
      </span>
    </div>
  );
}

function Group({ label, rows, t }: { label: string; rows: MuscleActivation[]; t: (k: string) => string }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      {rows.map((m) => <MuscleBar key={m.muscle} m={m} t={t} />)}
    </div>
  );
}

/**
 * The exercise-page ANATOMY section (web): a looping schematic animation of the
 * movement, the muscles it works with a share-of-effort %, the stabilizers that
 * brace it, and the step-by-step form cues. Data + geometry come from
 * @hybrid/core (exercise-anatomy) so this renders identically on mobile. Returns
 * null for a name the exercise DB doesn't know (custom lifts, cardio sports).
 */
export default function AuroraExerciseAnatomy({ name }: { name: string }) {
  const { t } = useLang();
  const a = exerciseAnatomy(name);
  if (!a) return null;

  return (
    <section style={{ margin: "22px 2px 0", paddingTop: 18, borderTop: `1px solid ${C("line")}` }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <h2 style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.3, margin: 0, color: C("chalk") }}>{t("w.analyze.exp.anatomy.title")}</h2>
        <span style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1, textTransform: "uppercase" }}>{a.mechanics === "isolation" ? t("w.analyze.exp.anatomy.isolation") : t("w.analyze.exp.anatomy.compound")}</span>
      </div>

      {/* the movement demo (swappable: procedural skeleton today, professional
          sketch later — see exercise-animation.tsx) */}
      <div style={{ marginTop: 14, borderRadius: 20, border: `1px solid ${C("line")}`, background: C("ink2"), padding: "10px 14px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "62%", maxWidth: 240 }}>
          <AuroraExerciseAnimation name={name} />
        </div>
      </div>
      <p style={{ margin: "12px 2px 0", fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{a.emphasis}</p>

      {/* muscles worked */}
      <div style={{ marginTop: 20 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.4, textTransform: "uppercase", color: "var(--lime-text)" }}>{t("w.analyze.exp.anatomy.muscles")}</div>
        <Group label={t("w.analyze.exp.anatomy.primary")} rows={a.primary} t={t} />
        <Group label={t("w.analyze.exp.anatomy.secondary")} rows={a.secondary} t={t} />
      </div>

      {/* stabilizers */}
      <div style={{ marginTop: 20 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{t("w.analyze.exp.anatomy.stabilizers")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {a.stabilizers.map((sName) => (
            <span key={sName} style={{ ...monoRow(10.5, C("ash")), padding: "5px 11px", borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2") }}>{sName}</span>
          ))}
        </div>
      </div>

      {/* how it's done */}
      <div style={{ marginTop: 22 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{t("w.analyze.exp.anatomy.howto")}</div>
        <ol style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
          {a.cues.map((cue, i) => (
            <li key={cue} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, alignItems: "start", marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: "var(--lime-text)", lineHeight: 1.5 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: fs.body, lineHeight: 1.5, color: C("chalk") }}>{cue}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
