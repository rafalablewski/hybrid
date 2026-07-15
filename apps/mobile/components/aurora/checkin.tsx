import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  CHECKIN_METRICS,
  CHECKIN_SCALE,
  CHECKIN_STEP_COUNT,
  checkinScaleFeeling,
  checkinScaleWordKey,
  type CheckinMetricKey,
  type ReadinessFeeling,
} from "@hybrid/core";
import { fetchCheckins, createCheckin, fetchBillingStatus, type Checkin } from "../../lib/api";
import { useRevalidate } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import ReadinessFace from "./readiness-face";

type Ratings = Record<CheckinMetricKey, number>;

const ACCENT: Record<ReadinessFeeling, keyof Palette> = { primed: "lime", good: "blue", flat: "amber", wrecked: "red" };
const feelingColor = (C: Palette, feeling: ReadinessFeeling) => txt(C, C[ACCENT[feeling]] as string);

/** AURORA Daily check-in (mobile) — a GUIDED, one-question-per-card flow. Steps
 *  1–4 walk Energy / Sleep / Soreness / Mood with a big reactive readiness face;
 *  the final card collects weight, adherence, a note + share-with-coach and
 *  submits. Same createCheckin flow + history as before. Mirrors the web wizard.
 *  `embedded` drops the screen chrome so the flow can live inside a sheet. */
export default function AuroraCheckin({ embedded = false, onDone }: { embedded?: boolean; onDone?: () => void } = {}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const revalidate = useRevalidate();
  const [history, setHistory] = useState<Checkin[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paid, setPaid] = useState(false);
  const [step, setStep] = useState(0); // 0..3 metrics, 4 = details
  const [done, setDone] = useState(false);
  const [ratings, setRatings] = useState<Ratings>({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
  const [extras, setExtras] = useState({ bodyMassKg: "", adherencePct: "", note: "", sharedWithCoach: false });

  const load = () => {
    setRefreshing(true);
    fetchCheckins().then((c) => setHistory(c)).finally(() => setRefreshing(false));
  };
  useFocusEffect(useCallback(load, []));
  useEffect(() => { fetchBillingStatus().then((b) => setPaid(b?.entitlement === "paid")).catch(() => {}); }, []);

  const detailsStep = CHECKIN_METRICS.length; // index 4
  const isDetails = step === detailsStep;

  const submit = async () => {
    setSaving(true);
    const ok = await createCheckin({
      weekOf: new Date().toISOString(),
      bodyMassKg: extras.bodyMassKg ? parseFloat(extras.bodyMassKg) : null,
      energy: ratings.energy, sleep: ratings.sleep, soreness: ratings.soreness, mood: ratings.mood,
      adherencePct: extras.adherencePct ? parseInt(extras.adherencePct, 10) : null,
      note: extras.note || null,
      sharedWithCoach: paid ? extras.sharedWithCoach : false,
    });
    setSaving(false);
    if (!ok) { Alert.alert(t("w.recovery.checkins.errSubmit"), t("w.recovery.checkins.errSaveBody")); return; }
    setDone(true);
    load();
    revalidate.recovery();
    onDone?.();
  };

  const restart = () => {
    setDone(false); setStep(0);
    setRatings({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
    setExtras({ bodyMassKg: "", adherencePct: "", note: "", sharedWithCoach: false });
  };

  const backBtn = (
    <Pressable onPress={() => setStep((s) => s - 1)} accessibilityRole="button" accessibilityLabel={t("w.recovery.checkins.prev")}
      style={{ paddingHorizontal: 22, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.ash }}>{t("w.recovery.checkins.prev")}</Text>
    </Pressable>
  );

  const wizard = (
    <ACard style={{ marginTop: embedded ? 0 : 18 }}>
      {/* progress */}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {Array.from({ length: CHECKIN_STEP_COUNT }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 999, backgroundColor: done || i <= step ? C.lime : C.line }} />
        ))}
      </View>

      {done ? (
        <View style={{ alignItems: "center", paddingVertical: 16 }}>
          <AuroraIcon name="check-circle" size={54} color={txt(C, C.lime)} />
          <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, marginTop: 14 }}>{t("w.recovery.checkins.loggedTitle")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: 18, maxWidth: 280 }}>{t("w.recovery.checkins.loggedSub")}</Text>
          <APill label={t("w.recovery.checkins.newCheckin")} onPress={restart} style={{ marginTop: 20, paddingHorizontal: 28, paddingVertical: 14 }} />
        </View>
      ) : isDetails ? (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.4, color: C.ash, marginTop: 18 }}>
            {t("w.recovery.checkins.step")} {CHECKIN_STEP_COUNT} / {CHECKIN_STEP_COUNT} — {t("w.recovery.checkins.detailsStep")}
          </Text>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, marginTop: 8 }}>{t("w.recovery.checkins.reviewTitle")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {CHECKIN_METRICS.map((m) => (
              <View key={m.key} style={{ flex: 1, alignItems: "center", gap: 6, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 12 }}>
                <ReadinessFace feeling={checkinScaleFeeling(ratings[m.key])} scale={0.76} />
                <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash }}>{t(m.labelKey)}</Text>
              </View>
            ))}
          </View>

          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 16, marginBottom: 8 }}>{t("w.recovery.checkins.detailsOptional")}</Text>
          <View style={{ flexDirection: "row", gap: space.ms }}>
            <NumField value={extras.bodyMassKg} onChange={(v) => setExtras((s) => ({ ...s, bodyMassKg: v }))} ph={t("w.recovery.checkins.weightKg")} />
            <NumField value={extras.adherencePct} onChange={(v) => setExtras((s) => ({ ...s, adherencePct: v }))} ph={t("w.recovery.checkins.adherencePct")} />
          </View>
          <TextInput
            value={extras.note}
            onChangeText={(v) => setExtras((s) => ({ ...s, note: v }))}
            placeholder={t("w.recovery.checkins.notePlaceholder")}
            placeholderTextColor={C.ash}
            multiline
            style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, marginTop: 12, minHeight: 80, textAlignVertical: "top" }}
          />

          <Pressable
            onPress={() => paid && setExtras((s) => ({ ...s, sharedWithCoach: !s.sharedWithCoach }))}
            disabled={!paid}
            accessibilityRole="checkbox"
            accessibilityLabel={t("w.recovery.checkins.shareCoach")}
            accessibilityState={{ checked: !!(extras.sharedWithCoach && paid), disabled: !paid }}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 14, padding: 14, borderRadius: RADIUS.field, borderWidth: 1, borderColor: extras.sharedWithCoach && paid ? C.lime : C.line, backgroundColor: extras.sharedWithCoach && paid ? `${C.lime}1a` : "transparent", opacity: paid ? 1 : 0.6 }}
          >
            {extras.sharedWithCoach && paid ? <AuroraIcon name="check" size={22} color={txt(C, C.lime)} /> : <AuroraIcon name="lock" size={20} color={C.ash} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.checkins.shareCoach")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{paid ? t("w.recovery.checkins.shareCoachOnShort") : t("w.recovery.checkins.shareCoachOffShort")}</Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", gap: space.ms, marginTop: 16 }}>
            {backBtn}
            <APill label={saving ? t("w.recovery.checkins.submitting") : t("w.recovery.checkins.submit")} onPress={submit} disabled={saving} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        (() => {
          const m = CHECKIN_METRICS[step];
          if (!m) return null;
          const val = ratings[m.key];
          const feeling = checkinScaleFeeling(val);
          return (
            <View style={{ alignItems: "center" }}>
              <Text style={{ alignSelf: "flex-start", fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.4, color: C.ash, marginTop: 18 }}>
                {t("w.recovery.checkins.step")} {step + 1} / {CHECKIN_STEP_COUNT} — {t(m.labelKey)}
              </Text>
              <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: C.chalk, textAlign: "center", marginTop: 14, maxWidth: 280 }}>{t(m.questionKey)}</Text>
              <View style={{ marginTop: 22, marginBottom: 4 }}><ReadinessFace feeling={feeling} scale={2.5} /></View>
              <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: feelingColor(C, feeling) }}>{t(checkinScaleWordKey(val))}</Text>

              <View style={{ flexDirection: "row", gap: 9, marginTop: 22, alignSelf: "stretch" }}>
                {CHECKIN_SCALE.map((n) => {
                  const sel = val === n;
                  return (
                    <Pressable key={n} onPress={() => setRatings((s) => ({ ...s, [m.key]: n }))}
                      accessibilityRole="radio" accessibilityLabel={`${t(m.labelKey)}: ${n}`} accessibilityState={{ selected: sel }}
                      style={{ flex: 1, aspectRatio: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: sel ? C.lime : C.line, backgroundColor: sel ? `${C.lime}1a` : C.ink }}>
                      <ReadinessFace feeling={checkinScaleFeeling(n)} scale={0.7} />
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: "row", gap: space.ms, marginTop: 24, alignSelf: "stretch" }}>
                {step > 0 && backBtn}
                <APill label={t("w.recovery.checkins.next")} onPress={() => setStep((s) => s + 1)} style={{ flex: 1 }} />
              </View>
            </View>
          );
        })()
      )}
    </ACard>
  );

  const body = (
    <>
      {!embedded && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
          <ABack />
          <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.checkins.title")}</AHeading>
          <View style={{ marginLeft: "auto" }}><AuroraIcon name="heart" size={24} color={txt(C, C.red)} /></View>
        </View>
      )}

      {wizard}

      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginTop: 18, marginBottom: 10 }}>{t("w.recovery.checkins.historyShort")}</Text>
      {history.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.recovery.checkins.historyEmptyFirst")}</Text>
      ) : (
        history.map((c) => (
          <ACard key={c.id} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{new Date(c.weekOf).toLocaleDateString()}</Text>
                {c.sharedWithCoach ? (
                  <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, C.lime), textTransform: "uppercase" }}>{t("w.recovery.checkins.shared")}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{c.adherencePct != null ? `${c.adherencePct}% ${t("w.recovery.checkins.adherence")}` : ""}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6 }}>
              {t("w.recovery.checkins.energyLc")} {c.energy ?? "—"} – {t("w.recovery.checkins.sleepLc")} {c.sleep ?? "—"} – {t("w.recovery.checkins.sorenessLc")} {c.soreness ?? "—"} – {t("w.recovery.checkins.moodLc")} {c.mood ?? "—"}{c.bodyMassKg != null ? ` – ${c.bodyMassKg}kg` : ""}
            </Text>
            {c.note ? <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 18 }}>{c.note}</Text> : null}
            {c.coachReply ? (
              <View style={{ marginTop: 10, borderLeftWidth: 2, borderLeftColor: C.line, paddingLeft: 10 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{t("w.recovery.checkins.coach")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 4, lineHeight: 18 }}>{c.coachReply}</Text>
              </View>
            ) : null}
          </ACard>
        ))
      )}
    </>
  );

  if (embedded) return body;
  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {body}
    </AuroraScreen>
  );
}

function NumField({ value, onChange, ph }: { value: string; onChange: (v: string) => void; ph: string }) {
  const { palette: C } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={ph}
      placeholderTextColor={C.ash}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 13 }}
    />
  );
}
