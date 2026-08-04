import { View, Text, TextInput } from "react-native";
import {
  fs, blockKindKey, resolveBlock, blockRamp,
  type AthleteVolumeProfile, type MuscleGroup, type VolumeBlock, type VolumeLandmark,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useVolumeModel } from "../../lib/use-volume-model";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, space, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { AuroraScreen, ACard, ASection, RADIUS, withAlpha } from "./kit";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const EXP_KEY = { beginner: "w.analyze.vol.expBeginner", intermediate: "w.analyze.vol.expIntermediate", advanced: "w.analyze.vol.expAdvanced" } as const;
const NUTRITION_KEY = { deficit: "w.analyze.vol.nutDeficit", maintenance: "w.analyze.vol.nutMaintenance", surplus: "w.analyze.vol.nutSurplus" } as const;
const FIELDS = ["mv", "mev", "mavLow", "mavHigh", "mrv"] as const;
const FIELD_LABEL = ["MV", "MEV", "MAV LO", "MAV HI", "MRV"];

type Palette = ReturnType<typeof useTheme>["palette"];

/**
 * THE VOLUME MODEL — the settings route (mobile). Mirrors
 * apps/web/components/aurora/volume-model.tsx.
 *
 * These controls used to live inside the Volume SCREEN, revealed by an "Edit
 * landmarks" toggle: five numeric fields on each of seven muscles, a profile
 * form of six numbers and six toggles, the block steppers, and the two model
 * switches. Around fifty controls inside a read surface — and they are MODEL
 * PARAMETERS, so a mistyped number silently changed every band, prescription
 * and verdict on the screen above, with no confirmation and no way to see what
 * the edit had done.
 *
 * So the first thing here is the DIFF: the same profile resolved with and
 * without the athlete's overrides, so every number they have moved is shown as
 * a change from the estimate it replaced, and can be put back.
 */
export default function AuroraVolumeModel() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
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
  // replaced — computed from the two resolutions rather than from the override
  // map, so it reports the EFFECT of an edit and not merely its existence.
  const changes = (Object.keys(resolved.landmarks) as MuscleGroup[]).flatMap((m) =>
    FIELDS.flatMap((k) => {
      const now = resolved.landmarks[m][k];
      const was = baseline.landmarks[m][k];
      return now === was ? [] : [{ muscle: m, field: k, was, now }];
    }),
  );

  const field = { fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 8, textAlign: "center" as const };
  const prose = { fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={refetch} hero={{ rank: "title", title: t("w.analyze.model.title"), meta: [t("w.analyze.model.sub")] }}>

      {/* ── WHAT YOUR EDITS CHANGED ────────────────────────────────────────── */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.analyze.model.changed")} />
        {changes.length === 0 ? (
          <Text style={prose}>{t("w.analyze.model.noChanges")}</Text>
        ) : (
          <>
            <View style={{ gap: 9 }}>
              {changes.map((c) => (
                <View key={`${c.muscle}-${c.field}`} style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>
                    {ml(c.muscle)} <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{FIELD_LABEL[FIELDS.indexOf(c.field)]}</Text>
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{c.was} →</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.body, fontWeight: "700", color: txt(C, C.lime), minWidth: 32, textAlign: "right" }}>{c.now}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => setLoggerPref("landmarkOverrides", {})}
              style={{ alignSelf: "flex-start", marginTop: 16, paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.vol.resetDefaults")}</Text>
            </Pressable>
          </>
        )}
      </ACard>

      {/* ── ABOUT YOU — the profile the estimate is built from ─────────────── */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.analyze.vol.aboutYou")} />
        {measuredKeys.size > 0 && <Text style={prose}>{t("w.analyze.vol.measuredWhy")}</Text>}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
          {(["beginner", "intermediate", "advanced"] as const).map((e) => (
            <Toggle key={e} C={C} on={profile.experience === e} label={t(EXP_KEY[e])} onPress={() => setProfile({ experience: profile.experience === e ? undefined : e })} />
          ))}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {([
            ["ageYears", t("w.analyze.vol.fieldAge"), 10, 100],
            ["bodyweightKg", t("w.analyze.vol.fieldBodyweight"), 25, 300],
            ["heightCm", t("w.analyze.vol.fieldHeight"), 120, 230],
            ["sleep", t("w.analyze.vol.fieldSleep"), 1, 5],
            ["stress", t("w.analyze.vol.fieldStress"), 1, 5],
            ["daysPerWeek", t("w.analyze.vol.fieldDays"), 1, 14],
          ] as const).map(([key, label]) => {
            const isMeasured = measuredKeys.has(key);
            return (
              <View key={key} style={{ width: "30%", flexGrow: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.7, color: isMeasured ? txt(C, C.lime) : C.ash, textAlign: "center", marginBottom: 5 }}>{label}</Text>
                <TextInput
                  keyboardType="number-pad"
                  defaultValue={profile[key] != null ? String(profile[key]) : ""}
                  accessibilityLabel={label}
                  maxFontSizeMultiplier={FIXED_FONT_SCALE}
                  onEndEditing={(e) => setProfile({ [key]: e.nativeEvent.text.trim() === "" ? undefined : Number(e.nativeEvent.text) } as Partial<AthleteVolumeProfile>)}
                  style={{ ...field, color: isMeasured ? C.ash : C.chalk, borderColor: isMeasured ? withAlpha(C.lime, 0.35) : C.line }}
                />
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {(["deficit", "maintenance", "surplus"] as const).map((n) => (
            <Toggle key={n} C={C} on={profile.nutrition === n} label={t(NUTRITION_KEY[n])} onPress={() => setProfile({ nutrition: profile.nutrition === n ? undefined : n })} />
          ))}
        </View>

        {Object.keys(prefs.volumeProfile).length > 0 && (
          <Pressable onPress={() => setLoggerPref("volumeProfile", {})} style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.vol.clearProfile")}</Text>
          </Pressable>
        )}
      </ACard>

      {/* ── LANDMARKS — the thirty-five fields, one muscle per row ─────────── */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.analyze.model.landmarks")} />
        <Text style={prose}>{t("w.analyze.model.landmarksSub")}</Text>
        {(Object.keys(resolved.landmarks) as MuscleGroup[]).map((m) => (
          <View key={m} style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk, marginBottom: 6 }}>{ml(m)}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {FIELDS.map((k, i) => {
                const overridden = prefs.landmarkOverrides[m]?.[k] !== undefined;
                return (
                  <View key={k} style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.7, color: C.ash, textAlign: "center", marginBottom: 4 }}>{FIELD_LABEL[i]}</Text>
                    <TextInput
                      keyboardType="number-pad"
                      defaultValue={String(resolved.landmarks[m][k])}
                      accessibilityLabel={`${ml(m)} ${k}`}
                      maxFontSizeMultiplier={FIXED_FONT_SCALE}
                      onEndEditing={(e) => editField(m, k, e.nativeEvent.text)}
                      style={{ ...field, fontSize: fs.caption, paddingHorizontal: 2, color: overridden ? C.chalk : C.ash, borderColor: overridden ? withAlpha(C.lime, 0.45) : C.line }}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ACard>

      {/* ── HOW THE MODEL BEHAVES — the two switches and the block ─────────── */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.analyze.model.behaviour")} />

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{t("w.analyze.vol.adaptive")}</Text>
          <Toggle C={C} on={prefs.adaptiveLandmarks} label={t(prefs.adaptiveLandmarks ? "common.on" : "common.off")} onPress={() => setLoggerPref("adaptiveLandmarks", !prefs.adaptiveLandmarks)} />
        </View>
        <Text style={{ ...prose, marginTop: 8 }}>{t("w.analyze.vol.adaptiveWhy")}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{t("w.analyze.vol.thisBlock")}</Text>
          <Toggle C={C} on={prefs.periodizeVolume} label={t("w.analyze.vol.periodize")} onPress={() => setLoggerPref("periodizeVolume", !prefs.periodizeVolume)} />
        </View>
        {!prefs.periodizeVolume ? (
          <Text style={{ ...prose, marginTop: 8 }}>{t("w.analyze.vol.periodizeWhy")}</Text>
        ) : (
          <View style={{ gap: 10, marginTop: 14 }}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>
              {t("w.analyze.vol.weekPre")}{block.week}{t("w.analyze.vol.weekOf")}{block.weeks}
              <Text style={{ color: C.ash }}>{" — "}</Text>
              <Text style={{ color: txt(C, current?.kind === "deload" ? C.blue : C.lime) }}>{current ? t(blockKindKey(current.kind)) : ""}</Text>
            </Text>
            <Stepper C={C} label={t("w.analyze.vol.currentWeek")} value={block.week} min={1} max={block.weeks} onChange={(v) => setBlock({ week: v })} />
            <Stepper C={C} label={t("w.analyze.vol.blockLength")} value={block.weeks} suffix={t("w.analyze.vol.weeksShort")} min={1} max={16} onChange={(v) => setBlock({ weeks: v })} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.analyze.vol.lastLoadWeek")}</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["mav", "overreach"] as const).map((k) => (
                  <Toggle key={k} C={C} on={block.peakAt === k} label={t(k === "mav" ? "w.analyze.vol.peakMav" : "w.analyze.vol.peakOverreach")} onPress={() => setBlock({ peakAt: k })} />
                ))}
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.analyze.vol.deloadLast")}</Text>
              <Toggle C={C} on={!!block.deloadLast} label={t(block.deloadLast ? "w.analyze.vol.done" : "w.analyze.vol.deloadLast")} onPress={() => setBlock({ deloadLast: !block.deloadLast })} />
            </View>
          </View>
        )}
      </ACard>
    </AuroraScreen>
  );
}

/** A pill switch — the same control the Volume screen uses. */
function Toggle({ C, on, label, onPress }: { C: Palette; on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? withAlpha(C.lime, 0.12) : "transparent" }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash }}>{label}</Text>
    </Pressable>
  );
}

/** A −/+ stepper for the small integer block settings. */
function Stepper({ C, label, value, suffix, min, max, onChange }: {
  C: Palette; label: string; value: number; suffix?: string; min: number; max: number; onChange: (v: number) => void;
}) {
  const btn = { width: 30, height: 30, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{label}</Text>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} accessibilityLabel={`${label} −`} style={btn}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>−</Text>
      </Pressable>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, minWidth: 46, textAlign: "center" }}>{value}{suffix ? ` ${suffix}` : ""}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} accessibilityLabel={`${label} +`} style={btn}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>+</Text>
      </Pressable>
    </View>
  );
}
