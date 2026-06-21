import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { computeCompliance, type LoggedSession } from "@hybrid/core";
import { fetchCheckins, createCheckin, fetchSessions, fetchBillingStatus, type Checkin } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const RATINGS: { key: "energy" | "sleep" | "soreness" | "mood"; labelKey: string }[] = [
  { key: "energy", labelKey: "w.recovery.checkins.energy" },
  { key: "sleep", labelKey: "w.recovery.checkins.sleep" },
  { key: "soreness", labelKey: "w.recovery.checkins.soreness" },
  { key: "mood", labelKey: "w.recovery.checkins.mood" },
];

/** AURORA Check-in — the daily readiness log in the rounded Aurora style,
 *  reusing the exact same form, compliance + createCheckin flow as the classic. */
export default function AuroraCheckin() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [history, setHistory] = useState<Checkin[]>([]);
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paid, setPaid] = useState(false);
  const [form, setForm] = useState({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false });

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchCheckins(), fetchSessions()])
      .then(([c, s]) => { setHistory(c); setSessions(s); })
      .finally(() => setRefreshing(false));
  };
  useEffect(load, []);
  useEffect(() => { fetchBillingStatus().then((b) => setPaid(b?.entitlement === "paid")).catch(() => {}); }, []);

  const compliance = useMemo(() => computeCompliance(sessions, { targetPerWeek: 3 }), [sessions]);

  const submit = async () => {
    setSaving(true);
    const ok = await createCheckin({
      weekOf: new Date().toISOString(),
      bodyMassKg: form.bodyMassKg ? parseFloat(form.bodyMassKg) : null,
      energy: form.energy, sleep: form.sleep, soreness: form.soreness, mood: form.mood,
      adherencePct: form.adherencePct ? parseInt(form.adherencePct, 10) : null,
      note: form.note || null,
      sharedWithCoach: paid ? form.sharedWithCoach : false,
    });
    setSaving(false);
    if (!ok) { Alert.alert("Couldn't submit", "Your check-in didn't save. Please try again."); return; }
    setForm({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false });
    load();
  };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.checkins.title")}</AHeading>
        <View style={{ marginLeft: "auto" }}><AuroraIcon name="heart" size={24} color={txt(C, C.red)} /></View>
      </View>

      <ACard style={{ marginTop: 18 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Training volume · this week</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 6 }}>
          {compliance.completedThisWeek}/{compliance.target} {t("w.recovery.checkins.sessions")} · {compliance.pct}% {t("w.recovery.checkins.ofPlan")} · {compliance.status}
        </Text>

        {RATINGS.map((r) => (
          <View key={r.key} style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t(r.labelKey)}</Text>
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const sel = form[r.key] === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setForm((s) => ({ ...s, [r.key]: n }))}
                    style={{ flex: 1, height: 46, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: sel ? C.lime : C.line, backgroundColor: sel ? C.lime : "transparent" }}
                  >
                    <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: sel ? C.onAccent : C.ash }}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 16 }}>
          <NumField value={form.bodyMassKg} onChange={(v) => setForm((s) => ({ ...s, bodyMassKg: v }))} ph={t("w.recovery.checkins.weightKg")} />
          <NumField value={form.adherencePct} onChange={(v) => setForm((s) => ({ ...s, adherencePct: v }))} ph={t("w.recovery.checkins.adherencePct")} />
        </View>

        <TextInput
          value={form.note}
          onChangeText={(v) => setForm((s) => ({ ...s, note: v }))}
          placeholder="How did the week go? Anything your coach should know…"
          placeholderTextColor={C.ash}
          multiline
          style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, marginTop: 12, minHeight: 80, textAlignVertical: "top" }}
        />

        <Pressable
          onPress={() => paid && setForm((s) => ({ ...s, sharedWithCoach: !s.sharedWithCoach }))}
          disabled={!paid}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 14, padding: 14, borderRadius: RADIUS.field, borderWidth: 1, borderColor: form.sharedWithCoach && paid ? C.violet : C.line, backgroundColor: form.sharedWithCoach && paid ? `${C.violet}1a` : "transparent", opacity: paid ? 1 : 0.6 }}
        >
          {form.sharedWithCoach && paid ? <AuroraIcon name="check" size={22} color={txt(C, C.violet)} /> : <AuroraIcon name="lock" size={20} color={C.ash} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.checkins.shareCoach")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>
              {paid ? "Send this check-in to your coach" : "Full plan — share check-ins with your coach"}
            </Text>
          </View>
        </Pressable>

        <APill label={saving ? t("w.recovery.checkins.submitting") : t("w.recovery.checkins.submit")} onPress={submit} disabled={saving} style={{ marginTop: 14 }} />
      </ACard>

      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue), marginTop: 8, marginBottom: 10 }}>History</Text>
      {history.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>No check-ins yet — submit your first above.</Text>
      ) : (
        history.map((c) => (
          <ACard key={c.id} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{new Date(c.weekOf).toLocaleDateString()}</Text>
                {c.sharedWithCoach ? (
                  <View style={{ backgroundColor: `${C.violet}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, C.violet), textTransform: "uppercase" }}>{t("w.recovery.checkins.shared")}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{c.adherencePct != null ? `${c.adherencePct}% ${t("w.recovery.checkins.adherence")}` : ""}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6 }}>
              {t("w.recovery.checkins.energyLc")} {c.energy ?? "—"} · {t("w.recovery.checkins.sleepLc")} {c.sleep ?? "—"} · {t("w.recovery.checkins.sorenessLc")} {c.soreness ?? "—"} · {t("w.recovery.checkins.moodLc")} {c.mood ?? "—"}{c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
            </Text>
            {c.note ? <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 18 }}>{c.note}</Text> : null}
            {c.coachReply ? (
              <View style={{ marginTop: 10, borderLeftWidth: 2, borderLeftColor: C.violet, paddingLeft: 10 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.violet) }}>{t("w.recovery.checkins.coach")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 4, lineHeight: 18 }}>{c.coachReply}</Text>
              </View>
            ) : null}
          </ACard>
        ))
      )}
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
