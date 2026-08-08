"use client";

import { useEffect, useRef, useState } from "react";
import { exerciseAnatomy, fs, sheetPadBottom, type ExerciseAnatomy, type MuscleActivation } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import AuroraExerciseMedia from "./exercise-media";
import AuroraBodyMap from "./body-map";

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
    <div style={{ marginTop: 16 }}>
      <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      {rows.map((m) => <MuscleBar key={m.muscle} m={m} t={t} />)}
    </div>
  );
}

/* ── the sheet body: the movement demo + muscles + stabilizers + cues ── */

function AnatomyBody({ a, name, active, t }: { a: ExerciseAnatomy; name: string; active: boolean; t: (k: string) => string }) {
  return (
    <>
      {/* the movement demo — whatever exerciseMedia resolves: the hand-drawn
          sketch once it exists, the procedural skeleton as today's placeholder
          (see exercise-media.tsx). Loops only while the sheet is open. */}
      <AuroraExerciseMedia name={name} active={active} />
      <p style={{ margin: "12px 2px 0", fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{a.emphasis}</p>

      {/* muscles worked */}
      <div style={{ marginTop: 20 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.4, textTransform: "uppercase", color: "var(--lime-text)" }}>{t("w.analyze.exp.anatomy.muscles")}</div>
        {/* the front/back body-map — the visual, then the ranked bars below */}
        <AuroraBodyMap name={name} t={t} />
        <Group label={t("w.analyze.exp.anatomy.primary")} rows={a.primary} t={t} />
        <Group label={t("w.analyze.exp.anatomy.secondary")} rows={a.secondary} t={t} />
      </div>

      {/* stabilizers */}
      <div style={{ marginTop: 20 }}>
        <div style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1.2, textTransform: "uppercase" }}>{t("w.analyze.exp.anatomy.stabilizers")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {a.stabilizers.map((sName) => (
            <span key={sName} style={{ ...monoRow(10.5, C("ash")), padding: "5px 12px", borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2") }}>{sName}</span>
          ))}
        </div>
      </div>

      {/* how it's done */}
      <div style={{ marginTop: 24 }}>
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
    </>
  );
}

/* ── the bottom sheet (scrim + slide-up panel) ── */

function BottomSheet({ open, onClose, title, meta, children }: { open: boolean; onClose: () => void; title: string; meta: string; children: React.ReactNode }) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setRender(false), 320);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!render) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [render, onClose]);

  if (!render) return null;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: `rgba(0,0,0,${shown ? 0.6 : 0})`, transition: "background .3s ease", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, maxHeight: "86vh", overflowY: "auto", background: C("card"), borderTop: `1px solid ${C("line")}`, borderRadius: "28px 28px 0 0", boxShadow: "0 -20px 50px -20px rgba(0,0,0,.6)", padding: `10px 20px max(${sheetPadBottom()}px, env(safe-area-inset-bottom, 0px))`, transform: shown ? "translateY(0)" : "translateY(101%)", transition: "transform .38s cubic-bezier(.32,.72,0,1)", fontFamily: "var(--font-display)", color: C("chalk") }}
      >
        <div aria-hidden style={{ width: 38, height: 4, borderRadius: 3, background: C("line"), margin: "2px auto 16px" }} />
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <h2 style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.3, margin: 0, color: C("chalk") }}>{title}</h2>
            <span style={{ ...monoRow(9.5, C("ash")), letterSpacing: 1, textTransform: "uppercase" }}>{meta}</span>
          </div>
          <button className="pressable" ref={closeRef} onClick={onClose} style={{ ...monoRow(11, C("ash")), background: "none", border: "none", cursor: "pointer", padding: "2px 2px 2px 12px", flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * The exercise-page "How it's done" surface (web): a compact PILL under the
 * exercise name that opens a BOTTOM SHEET with the movement animation, the
 * muscles it works (with a share-of-effort %), the stabilizers and the form
 * cues. Keeping it in a sheet leaves the page as a clean stats view for the many
 * athletes who already know the lift; the animation only loops while the sheet
 * is open. Data comes from @hybrid/core (exercise-anatomy) so this stays at
 * parity with mobile. Returns null for a name the DB doesn't know (custom lifts,
 * cardio sports).
 */
export default function AuroraExerciseAnatomy({ name }: { name: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const a = exerciseAnatomy(name);
  if (!a) return null;
  const meta = a.mechanics === "isolation" ? t("w.analyze.exp.anatomy.isolation") : t("w.analyze.exp.anatomy.compound");

  return (
    <>
      <button className="pressable"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{
          marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
          fontFamily: "var(--font-mono)", fontSize: fs.caption, letterSpacing: 0.4, color: "var(--lime-text)",
          border: `1px solid color-mix(in srgb, ${C("lime")} 42%, ${C("line")})`,
          background: `color-mix(in srgb, ${C("lime")} 8%, ${C("ink2")})`,
          borderRadius: 999, padding: "8px 16px",
        }}
      >
        <span aria-hidden style={{ display: "inline-flex", width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" /></svg>
        </span>
        {t("w.analyze.exp.anatomy.title")}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("w.analyze.exp.anatomy.title")} meta={meta}>
        <AnatomyBody a={a} name={name} active={open} t={t} />
      </BottomSheet>
    </>
  );
}
