"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  fs, space, volumeStatus, resolveLandmarks,
  railGeometry, railScale, volumeSummary, sortByUrgency, setsLabel, deltaLabel,
  type LoggedSession, type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup,
} from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const ZONE_KEY: Record<VolumeZone, string> = { under: "w.analyze.vol.zoneUnder", productive: "w.analyze.vol.zoneProductive", peak: "w.analyze.vol.zonePeak", overreaching: "w.analyze.vol.zoneOver" };
const C = (v: string) => `var(--color-${v})`;
const mix = (token: string, amount: number) => `color-mix(in srgb, ${C(token)} ${amount}%, transparent)`;
const pct = (v: number) => `${v * 100}%`;

const ZONE_TOKEN: Record<VolumeZone, string> = { overreaching: "red", under: "amber", peak: "blue", productive: "lime" };

const card: CSSProperties = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 };
const mono = (size: number): CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: size });
const eyebrow: CSSProperties = { ...mono(fs.nano), textTransform: "uppercase", letterSpacing: ".14em", color: C("ash") };
const sectionTitle: CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk"), margin: 0 };

/**
 * AURORA Volume (web) — weekly working sets against the athlete's own
 * MEV/MAV/MRV. Mirrors apps/mobile/components/aurora/volume.tsx exactly: one
 * hero (how many muscles are in range + the week drawn as a seven-column
 * shape), then the week's prescription, then the per-muscle rails, then — only
 * on request — the landmark numbers and the glossary. The rail geometry is
 * normalised in @hybrid/core (`railX`), so every muscle's band lands at the
 * same x and the rows stack into one readable picture.
 */
export default function AuroraVolume({ sessions }: { sessions: LoggedSession[] }) {
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const prefs = useLoggerPrefs();
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const rows = useMemo(
    () => volumeStatus(sessions, { includeWarmups: prefs.countWarmupsInVolume, fractional: prefs.fractionalVolume, landmarks: lm }),
    [sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume, lm],
  );
  const summary = useMemo(() => volumeSummary(rows), [rows]);
  const ranked = useMemo(() => sortByUrgency(rows), [rows]);

  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<MuscleGroup | null>(null);
  const [picked, setPicked] = useState<MuscleGroup | null>(null);
  const [gloss, setGloss] = useState(false);
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;

  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m] } };
    if (raw.trim() === "") delete next[m]![k];
    else next[m]![k] = Math.max(0, Math.round(Number(raw) || 0));
    if (!Object.keys(next[m]!).length) delete next[m];
    setLoggerPref("landmarkOverrides", next);
  };

  const pickedRow = picked ? rows.find((r) => r.muscle === picked) : undefined;
  const verdict = (() => {
    if (summary.verdict === "none") return t("w.analyze.vol.verdictNone");
    if (summary.verdict === "balanced") return t("w.analyze.vol.verdictBalanced");
    const parts: string[] = [];
    if (summary.over.length) parts.push(`${summary.over.length}${t("w.analyze.vol.verdictOverTail")}`);
    if (summary.under.length) parts.push(`${summary.under.length}${t("w.analyze.vol.verdictUnderTail")}`);
    return `${parts.join(t("w.analyze.vol.verdictJoin"))}.`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxWidth: "100%", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: fs.display, margin: 0, letterSpacing: "-0.02em" }}>{t("w.analyze.vol.title")}</h1>
          <p style={{ fontSize: fs.bodyLg, color: C("ash"), marginTop: 6, marginBottom: 0 }}>{t("w.analyze.vol.subtitle")}</p>
        </div>
        <button
          onClick={() => { setEditing((v) => !v); setOpen(null); }}
          style={{ ...mono(fs.caption), whiteSpace: "nowrap", padding: "8px 14px", borderRadius: 999, cursor: "pointer", color: editing ? C("lime") : C("ash"), background: editing ? mix("lime", 12) : "transparent", border: `1px solid ${editing ? C("lime") : C("line")}` }}
        >
          {editing ? t("w.analyze.vol.done") : t("w.analyze.vol.editLandmarks")}
        </button>
      </div>

      {/* ── HERO — the whole week as one number and one shape ─────────────── */}
      <section style={{ ...card, paddingBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={eyebrow}>{t("w.analyze.vol.range7d")}</span>
          {customized && <span style={{ ...eyebrow, color: C("lime") }}>{t("w.analyze.vol.customised")}</span>}
        </div>

        {summary.empty ? (
          <p style={{ marginTop: 14, marginBottom: 0, fontSize: fs.note, lineHeight: 1.55, color: C("ash"), maxWidth: 460 }}>{t("w.analyze.vol.empty")}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 68, lineHeight: 1.06, letterSpacing: "-0.04em" }}>{summary.inRange}</span>
              <span style={{ ...mono(fs.heading), color: C("ash"), marginLeft: 4 }}>/{summary.total}</span>
            </div>
            <p style={{ fontSize: fs.note, lineHeight: 1.4, color: C("ash"), margin: 0, maxWidth: 260 }}>{t("w.analyze.vol.heroCaption")}</p>

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, gap: 6, marginTop: 22, maxWidth: 520 }}>
              {rows.map((r) => {
                const on = picked === r.muscle;
                const label = ml(r.muscle);
                return (
                  <button
                    key={r.muscle}
                    onClick={() => setPicked(on ? null : r.muscle)}
                    aria-label={`${label} – ${setsLabel(r.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[r.zone])}`}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}
                  >
                    <ShapeColumn s={r} token={ZONE_TOKEN[r.zone]} dim={picked !== null && !on} />
                    <span style={{ marginTop: 8, ...mono(9), letterSpacing: ".06em", color: on ? C("chalk") : C("ash") }}>{label.slice(0, 3).toUpperCase()}</span>
                  </button>
                );
              })}
            </div>

            <p style={{ marginTop: 16, marginBottom: 0, fontSize: fs.bodyLg, lineHeight: 1.45, color: C("chalk") }}>
              {pickedRow ? (
                <>
                  {ml(pickedRow.muscle)}
                  <span style={{ color: C("ash") }}>{" — "}</span>
                  <span style={{ ...mono(fs.bodyLg), color: C(ZONE_TOKEN[pickedRow.zone]) }}>{setsLabel(pickedRow.sets)} {t("w.analyze.vol.sets")}</span>
                  <span style={{ color: C("ash") }}>, {t(ZONE_KEY[pickedRow.zone])}</span>
                </>
              ) : (
                verdict
              )}
            </p>
          </>
        )}
      </section>

      {/* ── THE WEEK'S PRESCRIPTION — verb + magnitude, said once ─────────── */}
      <Prescription title={t("w.analyze.vol.easeOff")} why={t("w.analyze.vol.easeOffWhy")} items={summary.over} token="red" ml={ml} unit={t("w.analyze.vol.perWeek")} />
      <Prescription title={t("w.analyze.vol.addVolume")} why={t("w.analyze.vol.addVolumeWhy")} items={summary.under} token="amber" ml={ml} unit={t("w.analyze.vol.perWeek")} />

      {/* ── BY MUSCLE — one legend, then the stack of comparable rails ────── */}
      {!summary.empty && (
        <section style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
            <h2 style={sectionTitle}>{t("w.analyze.vol.byMuscle")}</h2>
            <span style={eyebrow}>{t("w.analyze.vol.range7d")}</span>
          </div>

          <div>
            {ranked.map((r) => (
              <MuscleRow
                key={r.muscle} s={r} label={ml(r.muscle)} token={ZONE_TOKEN[r.zone]}
                expanded={editing || open === r.muscle} editing={editing}
                onToggle={() => setOpen(open === r.muscle ? null : r.muscle)}
                onEdit={editField}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── The glossary that used to be a wall of acronyms in the header ─── */}
      <section style={card}>
        <button
          onClick={() => setGloss((v) => !v)} aria-expanded={gloss}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
        >
          <span style={{ ...sectionTitle, fontSize: fs.subtitle }}>{t("w.analyze.vol.whatBands")}</span>
          <span style={{ ...mono(fs.caption), color: C("ash") }}>{gloss ? "–" : "+"}</span>
        </button>
        {gloss && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {([["MV", "w.analyze.vol.glossMv"], ["MEV", "w.analyze.vol.glossMev"], ["MAV", "w.analyze.vol.glossMav"], ["MRV", "w.analyze.vol.glossMrv"]] as const).map(([k, key]) => (
              <div key={k} style={{ display: "flex", gap: space.md }}>
                <span style={{ ...mono(fs.caption), fontWeight: 700, color: C("lime"), width: 42, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t(key)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && customized && (
        <button onClick={() => setLoggerPref("landmarkOverrides", {})} style={{ alignSelf: "center", marginTop: 4, padding: "10px 18px", background: "none", border: "none", cursor: "pointer", ...mono(fs.caption), color: C("ash") }}>
          {t("w.analyze.vol.resetDefaults")}
        </button>
      )}
    </div>
  );
}

/** One column of the hero's week-shape — the same normalised rail, stood up. */
function ShapeColumn({ s, token, dim }: { s: MuscleVolumeStatus; token: string; dim: boolean }) {
  const g = railGeometry(s);
  return (
    <div style={{ position: "relative", width: "100%", height: 66, borderRadius: 7, background: C("ink"), overflow: "hidden", opacity: dim ? 0.35 : 1, transition: "opacity .18s ease" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.bandStart), height: pct(g.bandEnd - g.bandStart), background: mix("lime", 13) }} />
      {/* the territory past the ceiling */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), top: 0, background: mix("red", 16) }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pct(g.x), background: C(token), opacity: 0.9, borderRadius: "7px 7px 0 0", transition: "height .3s cubic-bezier(.2,.7,.2,1)" }} />
      {/* the ceiling reads as a NOTCH in the column, so it survives the fill */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), height: 2, background: C("ink2") }} />
    </div>
  );
}

/** "Ease off" / "Add volume" — the prescription as chips, with the reason said
 *  ONCE underneath instead of repeated verbatim on every muscle. */
function Prescription({ title, why, items, token, ml, unit }: {
  title: string; why: string; items: MuscleVolumeStatus[]; token: string; ml: (m: string) => string; unit: string;
}) {
  if (!items.length) return null;
  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <h2 style={sectionTitle}>{title}</h2>
        <span style={eyebrow}>{unit}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, marginTop: 14 }}>
        {items.map((s) => (
          <span key={s.muscle} style={{ display: "inline-flex", alignItems: "center", gap: space.sm, padding: "9px 14px", borderRadius: 999, border: `1px solid ${mix(token, 35)}`, background: mix(token, 10) }}>
            <span style={{ fontSize: fs.bodyLg, fontWeight: 600, color: C("chalk") }}>{ml(s.muscle)}</span>
            <span style={{ ...mono(fs.bodyLg), fontWeight: 700, color: C(token) }}>{deltaLabel(s)}</span>
          </span>
        ))}
      </div>
      <p style={{ marginTop: 14, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{why}</p>
    </section>
  );
}

/** One muscle: name, count, the normalised rail — and, on tap, the landmarks
 *  behind it (read-only, or as fields while editing). */
function MuscleRow({ s, label, token, expanded, editing, onToggle, onEdit }: {
  s: MuscleVolumeStatus; label: string; token: string; expanded: boolean; editing: boolean;
  onToggle: () => void; onEdit: (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => void;
}) {
  const { t } = useLang();
  const g = railGeometry(s);
  const sc = railScale(s.landmark);
  return (
    <div style={{ padding: "12px 0" }}>
      <button
        onClick={onToggle} aria-expanded={expanded}
        aria-label={`${label} – ${setsLabel(s.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[s.zone])}`}
        style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 9 }}>
          <span style={{ flex: 1, fontSize: fs.note, fontWeight: 600 }}>{label}</span>
          <span style={{ ...mono(fs.note), fontWeight: 700, color: C(token) }}>{setsLabel(s.sets)} {t("w.analyze.vol.sets")}</span>
          <span style={{ ...mono(fs.caption), color: C("ash") }}>{t(ZONE_KEY[s.zone])}</span>
        </div>
        <div style={{ position: "relative", height: 11, borderRadius: 6, background: C("ink"), overflow: "hidden" }}>
          {/* The track is itself the key: the productive band lit, the territory
              past the ceiling tinted, so the zones read even on an empty rail. */}
          <div style={{ position: "absolute", left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart), top: 0, bottom: 0, background: mix("lime", 13) }} />
          <div style={{ position: "absolute", left: pct(g.mrv), right: 0, top: 0, bottom: 0, background: mix("red", 16) }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(g.x), background: C(token), opacity: 0.9, borderRadius: 6, transition: "width .3s cubic-bezier(.2,.7,.2,1)" }} />
          {/* MEV + MRV as notches cut out of the rail — always legible, filled or not */}
          <div style={{ position: "absolute", left: pct(g.mev), top: 0, bottom: 0, width: 2, background: C("ink2") }} />
          <div style={{ position: "absolute", left: pct(g.mrv), top: 0, bottom: 0, width: 2, background: C("ink2") }} />
        </div>
        {/* This muscle's OWN scale, each value named and sitting under the mark
            it belongs to — MEV and MRV directly beneath their notches, MAV under
            the middle of the band. The old row said the same thing, but
            left-packed and with a coloured square in front of every label; here
            the label is the quiet part and the number carries the weight. */}
        <div style={{ position: "relative", height: 16, marginTop: 6 }}>
          {([["MEV", sc.mev, sc.mevX], ["MAV", sc.mav, sc.mavX], ["MRV", sc.mrv, sc.mrvX]] as const).map(([k, v, x]) => (
            <span key={k} style={{ position: "absolute", left: pct(x), top: 0, marginLeft: -45, width: 90, textAlign: "center", ...mono(9), letterSpacing: ".05em", color: C("ash") }}>
              {k} <span style={{ fontSize: 11, color: C("chalk") }}>{v}</span>
            </span>
          ))}
        </div>
      </button>

      {/* Expanding adds only what the scale above does NOT already say: the
          maintenance floor and the prescription. Editing swaps in all five
          fields, since all five are editable. */}
      {expanded && !editing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...mono(fs.caption), color: C("ash") }}>MV {s.landmark.mv}</div>
          <p style={{ marginTop: 7, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{rowAdvice(s, t)}</p>
        </div>
      )}
      {expanded && editing && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginTop: 12 }}>
          {(["mv", "mev", "mavLow", "mavHigh", "mrv"] as const).map((k, i) => (
            <div key={k}>
              <div style={{ ...mono(9), letterSpacing: ".06em", color: C("ash"), textAlign: "center", marginBottom: 5 }}>{["MV", "MEV", "MAV LO", "MAV HI", "MRV"][i]}</div>
              <input
                type="number" min={0} defaultValue={s.landmark[k]} aria-label={`${label} ${k}`}
                onBlur={(e) => onEdit(s.muscle, k, e.target.value)}
                style={{ ...mono(fs.body), width: "100%", textAlign: "center", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "7px 4px", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function rowAdvice(s: MuscleVolumeStatus, t: (k: string) => string): string {
  if (s.action === "add") {
    const n = Math.round(s.deltaSets);
    return `${t("w.analyze.vol.adviceAddPre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceAddTail")}${s.maintaining ? t("w.analyze.vol.adviceMaintaining") : ""}.`;
  }
  if (s.action === "reduce") {
    const n = Math.round(Math.abs(s.deltaSets));
    return `${t("w.analyze.vol.adviceReducePre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceReduceTail")}`;
  }
  if (s.action === "progress") return `${t("w.analyze.vol.adviceProgressPre")}${s.deltaSets}${t("w.analyze.vol.adviceProgressTail")}`;
  return t("w.analyze.vol.adviceHold");
}
