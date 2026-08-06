"use client";

import { useState, type CSSProperties } from "react";
import {
  fs, space, BAND_KEYS, blockKindKey, resolveBlock, blockRamp,
  VOLUME_PROFILE_FIELD_KEY,
  type AthleteVolumeProfile, type LoggedSession, type MuscleGroup, type VolumeBlock, type VolumeLandmark,
} from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useVolumeModel } from "@/lib/use-volume-model";
import { useLang } from "@/lib/i18n";
import { HeroScreen } from "./hero";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const EXP_KEY = { beginner: "w.analyze.vol.expBeginner", intermediate: "w.analyze.vol.expIntermediate", advanced: "w.analyze.vol.expAdvanced" } as const;
const NUTRITION_KEY = { deficit: "w.analyze.vol.nutDeficit", maintenance: "w.analyze.vol.nutMaintenance", surplus: "w.analyze.vol.nutSurplus" } as const;
const FIELDS = ["mv", "mev", "mavLow", "mavHigh", "mrv"] as const;
const FIELD_LABEL = ["MV", "MEV", "MAV LO", "MAV HI", "MRV"];

const C = (v: string) => `var(--color-${v})`;
const mix = (token: string, amount: number) => `color-mix(in srgb, ${C(token)} ${amount}%, transparent)`;
const card: CSSProperties = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 };
const mono = (size: number): CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: size });
const sectionTitle: CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk"), margin: 0 };
const prose: CSSProperties = { margin: 0, fontSize: fs.body, lineHeight: 1.55, color: C("ash") };

/**
 * THE VOLUME MODEL — the settings route.
 *
 * These controls used to live inside the Volume SCREEN, revealed by an "Edit
 * landmarks" toggle in its header: five numeric fields on each of seven muscles
 * (thirty-five inputs), a profile form of six numbers and six toggles, the
 * block steppers, and the two model switches. Around fifty controls inside a
 * read surface, which had two problems and only one of them was placement.
 *
 * The other is that these are MODEL PARAMETERS. An athlete who mistyped a
 * bodyweight or an MRV silently changed every band, every prescription and
 * every verdict on the screen above, with no confirmation, no history, and no
 * way to see what their edit had done — or even to tell an edit apart from the
 * model's own estimate.
 *
 * So the first thing on this route is the DIFF: the same profile resolved with
 * and without the athlete's overrides, so every number they have moved is shown
 * as a change from the estimate it replaced, and can be put back. The form
 * comes after it. Editing is a place you go, and what you did there is visible
 * when you get there.
 *
 * Mirrors apps/mobile/components/aurora/volume-model.tsx.
 */
export default function AuroraVolumeModel({ sessions }: { sessions: LoggedSession[] }) {
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const prefs = useLoggerPrefs();
  const { measuredKeys, profile, resolved, baseline, setProfile } = useVolumeModel(sessions);
  const block = resolveBlock(prefs.volumeBlock);
  const ramp = blockRamp(block, resolved.landmarks);
  const current = ramp.find((c) => c.current) ?? ramp[0];

  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m] } };
    if (raw.trim() === "") delete next[m]![k];
    else next[m]![k] = Math.max(0, Math.round(Number(raw) || 0));
    if (!Object.keys(next[m]!).length) delete next[m];
    setLoggerPref("landmarkOverrides", next);
  };
  const setBlock = (patch: Partial<VolumeBlock>) => setLoggerPref("volumeBlock", resolveBlock({ ...block, ...patch }));

  // Every band the athlete has actually moved, against the estimate it
  // replaced. Computed from the two resolutions rather than from the override
  // map, so it reports the EFFECT of an edit and not merely its existence.
  const changes = (Object.keys(resolved.landmarks) as MuscleGroup[]).flatMap((m) =>
    FIELDS.flatMap((k) => {
      const now = resolved.landmarks[m][k];
      const was = baseline.landmarks[m][k];
      return now === was ? [] : [{ muscle: m, field: k, was, now }];
    }),
  );

  return (
    <HeroScreen hero={{ rank: "title", title: t("w.analyze.model.title"), meta: [t("w.analyze.model.sub")] }}>
      <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxWidth: "100%", fontFamily: "var(--font-display)", color: C("chalk") }}>

        {/* ── WHAT YOUR EDITS CHANGED ─────────────────────────────────────── */}
        <section style={card}>
          <h2 style={{ ...sectionTitle, fontSize: fs.subtitle }}>{t("w.analyze.model.changed")}</h2>
          {changes.length === 0 ? (
            <p style={{ ...prose, marginTop: 10 }}>{t("w.analyze.model.noChanges")}</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 14 }}>
                {changes.map((c) => (
                  <div key={`${c.muscle}-${c.field}`} style={{ display: "flex", alignItems: "baseline", gap: space.sm }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: fs.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ml(c.muscle)} <span style={{ ...mono(fs.caption), color: C("ash") }}>{FIELD_LABEL[FIELDS.indexOf(c.field)]}</span>
                    </span>
                    <span style={{ ...mono(fs.caption), color: C("ash") }}>{c.was}</span>
                    <span aria-hidden style={{ ...mono(fs.caption), color: C("ash") }}>→</span>
                    <span style={{ ...mono(fs.body), fontWeight: 700, minWidth: 34, textAlign: "right", color: "var(--lime-text)" }}>{c.now}</span>
                  </div>
                ))}
              </div>
              <button
                className="pressable"
                onClick={() => setLoggerPref("landmarkOverrides", {})}
                style={{ marginTop: 16, padding: "9px 16px", borderRadius: 999, cursor: "pointer", background: "none", border: `1px solid ${C("line")}`, ...mono(fs.caption), color: C("ash") }}
              >
                {t("w.analyze.vol.resetDefaults")}
              </button>
            </>
          )}
        </section>

        {/* ── ABOUT YOU — the profile the estimate is built from ──────────── */}
        <section style={card}>
          <h2 style={{ ...sectionTitle, fontSize: fs.subtitle }}>{t("w.analyze.vol.aboutYou")}</h2>
          {measuredKeys.size > 0 && <p style={{ ...prose, marginTop: 8 }}>{t("w.analyze.vol.measuredWhy")}</p>}

          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {(["beginner", "intermediate", "advanced"] as const).map((e) => (
              <Toggle key={e} on={profile.experience === e} label={t(EXP_KEY[e])} onClick={() => setProfile({ experience: profile.experience === e ? undefined : e })} />
            ))}
          </div>

          {/* SEX — not cosmetic and not optional-feeling. Every strength and
              endurance threshold in the app is published for a male athlete and
              shifted from there, so leaving this blank holds a woman to the
              men's bar and usually costs her a tier of training age. Same
              toggle idiom as experience and nutrition; tapping the active one
              clears it, so it can be unset as well as set. */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...mono(9), letterSpacing: ".08em", color: C("ash"), marginRight: 2 }}>{t("w.analyze.vol.fieldSex")}</span>
            {(["F", "M"] as const).map((x) => (
              <Toggle
                key={x}
                on={profile.sex === x}
                label={t(x === "F" ? "w.analyze.vol.sexF" : "w.analyze.vol.sexM")}
                onClick={() => setProfile({ sex: profile.sex === x ? undefined : x })}
              />
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 8, marginTop: 12 }}>
            {([
              ["ageYears", t("w.analyze.vol.fieldAge"), 10, 100],
              ["bodyweightKg", t("w.analyze.vol.fieldBodyweight"), 25, 300],
              ["heightCm", t("w.analyze.vol.fieldHeight"), 120, 230],
              ["sleep", t("w.analyze.vol.fieldSleep"), 1, 5],
              ["stress", t("w.analyze.vol.fieldStress"), 1, 5],
              ["daysPerWeek", t("w.analyze.vol.fieldDays"), 1, 14],
            ] as const).map(([key, label, min, max]) => {
              const isMeasured = measuredKeys.has(key);
              return (
                <div key={key}>
                  <div style={{ ...mono(9), letterSpacing: ".08em", color: isMeasured ? C("lime") : C("ash"), textAlign: "center", marginBottom: 5 }}>{label}</div>
                  <input
                    type="number" min={min} max={max} aria-label={label}
                    defaultValue={profile[key] ?? ""}
                    onBlur={(e) => setProfile({ [key]: e.target.value.trim() === "" ? undefined : Number(e.target.value) } as Partial<AthleteVolumeProfile>)}
                    style={{ ...field, color: isMeasured ? C("ash") : C("chalk"), borderColor: isMeasured ? mix("lime", 35) : C("line") }}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {(["deficit", "maintenance", "surplus"] as const).map((n) => (
              <Toggle key={n} on={profile.nutrition === n} label={t(NUTRITION_KEY[n])} onClick={() => setProfile({ nutrition: profile.nutrition === n ? undefined : n })} />
            ))}
          </div>

          {Object.keys(prefs.volumeProfile).length > 0 && (
            <button className="pressable" onClick={() => setLoggerPref("volumeProfile", {})} style={{ marginTop: 16, padding: 0, background: "none", border: "none", cursor: "pointer", ...mono(fs.caption), color: C("ash") }}>
              {t("w.analyze.vol.clearProfile")}
            </button>
          )}
        </section>

        {/* ── LANDMARKS — the thirty-five fields, as a table ───────────────── */}
        <section style={card}>
          <h2 style={{ ...sectionTitle, fontSize: fs.subtitle }}>{t("w.analyze.model.landmarks")}</h2>
          <p style={{ ...prose, marginTop: 8 }}>{t("w.analyze.model.landmarksSub")}</p>
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <div style={{ minWidth: 380 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(78px, 1.2fr) repeat(5, minmax(0, 1fr))", gap: 6, paddingBottom: 7 }}>
                <span />
                {FIELD_LABEL.map((l) => (
                  <span key={l} style={{ ...mono(9), letterSpacing: ".08em", color: C("ash"), textAlign: "center" }}>{l}</span>
                ))}
              </div>
              {(Object.keys(resolved.landmarks) as MuscleGroup[]).map((m) => (
                <div key={m} style={{ display: "grid", gridTemplateColumns: "minmax(78px, 1.2fr) repeat(5, minmax(0, 1fr))", gap: 6, alignItems: "center", padding: "5px 0" }}>
                  <span style={{ fontSize: fs.caption, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ml(m)}</span>
                  {FIELDS.map((k) => {
                    const overridden = prefs.landmarkOverrides[m]?.[k] !== undefined;
                    return (
                      <input
                        key={k}
                        type="number" min={0}
                        defaultValue={resolved.landmarks[m][k]}
                        aria-label={`${ml(m)} ${k}`}
                        onBlur={(e) => editField(m, k, e.target.value)}
                        style={{ ...field, color: overridden ? C("chalk") : C("ash"), borderColor: overridden ? mix("lime", 45) : C("line") }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* BAND_KEYS is the app's one ordering of the bands — named here so a
              future reordering can't leave this table out of step. */}
          <p style={{ ...prose, marginTop: 12, ...mono(fs.nano) }}>{BAND_KEYS.map((k) => k.toUpperCase()).join(" – ")}</p>
        </section>

        {/* ── HOW THE MODEL BEHAVES — the two switches and the block ───────── */}
        <section style={card}>
          <h2 style={{ ...sectionTitle, fontSize: fs.subtitle }}>{t("w.analyze.model.behaviour")}</h2>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 160, fontSize: fs.body }}>{t("w.analyze.vol.adaptive")}</span>
            <Toggle on={prefs.adaptiveLandmarks} label={t(prefs.adaptiveLandmarks ? "common.on" : "common.off")} onClick={() => setLoggerPref("adaptiveLandmarks", !prefs.adaptiveLandmarks)} />
          </div>
          <p style={{ ...prose, marginTop: 8 }}>{t("w.analyze.vol.adaptiveWhy")}</p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C("line")}`, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 160, fontSize: fs.body }}>{t("w.analyze.vol.thisBlock")}</span>
            <Toggle on={prefs.periodizeVolume} label={t("w.analyze.vol.periodize")} onClick={() => setLoggerPref("periodizeVolume", !prefs.periodizeVolume)} />
          </div>
          {!prefs.periodizeVolume ? (
            <p style={{ ...prose, marginTop: 8 }}>{t("w.analyze.vol.periodizeWhy")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              <p style={{ ...prose, color: C("chalk") }}>
                {t("w.analyze.vol.weekPre")}{block.week}{t("w.analyze.vol.weekOf")}{block.weeks}
                <span style={{ color: C("ash") }}>{" — "}</span>
                <span style={{ color: current?.kind === "deload" ? C("blue") : C("lime") }}>{current ? t(blockKindKey(current.kind)) : ""}</span>
              </p>
              <Stepper label={t("w.analyze.vol.currentWeek")} value={block.week} min={1} max={block.weeks} onChange={(v) => setBlock({ week: v })} />
              <Stepper label={t("w.analyze.vol.blockLength")} value={block.weeks} suffix={t("w.analyze.vol.weeksShort")} min={1} max={16} onChange={(v) => setBlock({ weeks: v })} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
                <span style={{ fontSize: fs.body, color: C("ash") }}>{t("w.analyze.vol.lastLoadWeek")}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["mav", "overreach"] as const).map((k) => (
                    <Toggle key={k} on={block.peakAt === k} label={t(k === "mav" ? "w.analyze.vol.peakMav" : "w.analyze.vol.peakOverreach")} onClick={() => setBlock({ peakAt: k })} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                <span style={{ fontSize: fs.body, color: C("ash") }}>{t("w.analyze.vol.deloadLast")}</span>
                <Toggle on={!!block.deloadLast} label={t(block.deloadLast ? "w.analyze.vol.done" : "w.analyze.vol.deloadLast")} onClick={() => setBlock({ deloadLast: !block.deloadLast })} />
              </div>
            </div>
          )}
        </section>

        {/* The profile's own completeness prompt still lives on the Volume
            screen's provenance card, which is where the athlete asks the
            question it answers; this route is where they act on it. */}
        <p style={{ ...prose, ...mono(fs.caption) }}>{t(VOLUME_PROFILE_FIELD_KEY.experience)}</p>
      </div>
    </HeroScreen>
  );
}

const field: CSSProperties = { ...mono(fs.body), width: "100%", textAlign: "center", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 12, padding: "8px 4px", boxSizing: "border-box" };

/** A pill switch — the same control the Volume screen uses. */
function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button className="pressable"
      onClick={onClick} role="switch" aria-checked={on}
      style={{ ...mono(fs.caption), whiteSpace: "nowrap", padding: "8px 12px", borderRadius: 999, cursor: "pointer", color: on ? C("lime") : C("ash"), background: on ? mix("lime", 12) : "transparent", border: `1px solid ${on ? C("lime") : C("line")}` }}
    >
      {label}
    </button>
  );
}

/** A −/+ stepper for the small integer block settings. */
function Stepper({ label, value, suffix, min, max, onChange }: {
  label: string; value: number; suffix?: string; min: number; max: number; onChange: (v: number) => void;
}) {
  const btn: CSSProperties = { ...mono(fs.body), width: 30, height: 30, borderRadius: 12, cursor: "pointer", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}` };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
      <span style={{ fontSize: fs.body, color: C("ash") }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="pressable" style={btn} aria-label={`${label} −`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span style={{ ...mono(fs.body), minWidth: 46, textAlign: "center" }}>{value}{suffix ? ` ${suffix}` : ""}</span>
        <button className="pressable" style={btn} aria-label={`${label} +`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}
