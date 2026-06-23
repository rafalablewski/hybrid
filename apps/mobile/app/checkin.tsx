import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { computeCompliance, type LoggedSession } from "@hybrid/core";
import { fetchCheckins, createCheckin, fetchSessions, fetchBillingStatus, type Checkin } from "../lib/api";
import { fs, space, Screen, Card, Kicker, Mono, Chip, Button, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraCheckin from "../components/aurora/checkin";

const RATINGS: { key: "energy" | "sleep" | "soreness" | "mood"; label: string }[] = [
  { key: "energy", label: "Energy" },
  { key: "sleep", label: "Sleep" },
  { key: "soreness", label: "Soreness" },
  { key: "mood", label: "Mood" },
];

export default function CheckinScreen() {
  if (useTemplate().template === "aurora") return <AuroraCheckin />;
  return <ClassicCheckin />;
}

function ClassicCheckin() {
  const C = useTheme().palette;
  const router = useRouter();
  const [history, setHistory] = useState<Checkin[]>([]);
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paid, setPaid] = useState(false);
  const [form, setForm] = useState<{ bodyMassKg: string; energy: number; sleep: number; soreness: number; mood: number; adherencePct: string; note: string; sharedWithCoach: boolean }>(
    { bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false },
  );

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchCheckins(), fetchSessions()])
      .then(([c, s]) => { setHistory(c); setSessions(s); })
      .finally(() => setRefreshing(false));
  };
  useFocusEffect(useCallback(load, []));
  useEffect(() => {
    fetchBillingStatus().then((b) => setPaid(b?.entitlement === "paid")).catch(() => {});
  }, []);

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
    if (!ok) {
      // Don't clear the form on failure — the athlete keeps their entry to retry.
      Alert.alert("Couldn't submit", "Your check-in didn't save. Please try again.");
      return;
    }
    setForm({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false });
    load();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Daily check-in</Kicker>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>← back</Text>
      </View>

      <Card style={{ marginTop: 10 }}>
        <Kicker color={C.lime}>Training volume · this week</Kicker>
        <Mono color={C.chalk} style={{ marginTop: 6 }}>
          {compliance.completedThisWeek}/{compliance.target} sessions · {compliance.pct}% of plan · {compliance.status}
        </Mono>
        {RATINGS.map((r) => (
          <View key={r.key} style={{ marginTop: 12 }}>
            <Mono color={C.chalk} style={{ fontSize: fs.caption }}>{r.label}</Mono>
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const sel = form[r.key] === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setForm((s) => ({ ...s, [r.key]: n }))}
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: sel ? C.lime : C.line, backgroundColor: sel ? `${C.lime}1a` : "transparent" }}
                  >
                    <Text style={{ fontFamily: F.bold, color: sel ? C.lime : C.ash }}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 14 }}>
          <Field value={form.bodyMassKg} onChange={(v) => setForm((s) => ({ ...s, bodyMassKg: v }))} ph="weight kg" />
          <Field value={form.adherencePct} onChange={(v) => setForm((s) => ({ ...s, adherencePct: v }))} ph="adherence %" />
        </View>
        <TextInput
          value={form.note}
          onChangeText={(v) => setForm((s) => ({ ...s, note: v }))}
          placeholder="How did the week go? Anything your coach should know…"
          placeholderTextColor={C.ash}
          multiline
          style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 70, textAlignVertical: "top" }}
        />
        <Pressable
          onPress={() => paid && setForm((s) => ({ ...s, sharedWithCoach: !s.sharedWithCoach }))}
          disabled={!paid}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: form.sharedWithCoach && paid ? C.violet : C.line, backgroundColor: form.sharedWithCoach && paid ? `${C.violet}1a` : "transparent", opacity: paid ? 1 : 0.6 }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{paid ? "Share with coach" : "🔒 Share with coach"}</Text>
            <Mono style={{ marginTop: 2, fontSize: fs.micro }}>
              {paid ? "Send this check-in to your coach" : "Full plan — share check-ins with your coach"}
            </Mono>
          </View>
          <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: form.sharedWithCoach && paid ? C.violet : C.line, backgroundColor: form.sharedWithCoach && paid ? C.violet : "transparent" }}>
            {form.sharedWithCoach && paid ? <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.ink }}>✓</Text> : null}
          </View>
        </Pressable>
        <View style={{ marginTop: 12 }}>
          <Button label={saving ? "Submitting…" : "Submit check-in"} onPress={submit} disabled={saving} />
        </View>
      </Card>

      <Kicker color={C.blue}>History</Kicker>
      {history.length === 0 ? (
        <Mono style={{ marginTop: 8 }}>No check-ins yet — submit your first above.</Mono>
      ) : (
        history.map((c) => (
          <Card key={c.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Mono color={C.chalk}>{new Date(c.weekOf).toLocaleDateString()}</Mono>
                {c.sharedWithCoach ? <Chip color={C.violet}>shared</Chip> : null}
              </View>
              <Mono>{c.adherencePct != null ? `${c.adherencePct}% adherence` : ""}</Mono>
            </View>
            <Mono style={{ marginTop: 6, fontSize: fs.caption }}>
              energy {c.energy ?? "—"} · sleep {c.sleep ?? "—"} · soreness {c.soreness ?? "—"} · mood {c.mood ?? "—"}
              {c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
            </Mono>
            {c.note ? <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 18 }}>{c.note}</Mono> : null}
            {c.coachReply ? (
              <View style={{ marginTop: 10, borderLeftWidth: 2, borderLeftColor: C.violet, paddingLeft: 10 }}>
                <Kicker color={C.violet}>Coach</Kicker>
                <Mono color={C.chalk} style={{ marginTop: 4, lineHeight: 18 }}>{c.coachReply}</Mono>
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

function Field({ value, onChange, ph }: { value: string; onChange: (v: string) => void; ph: string }) {
  const C = useTheme().palette;
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={ph}
      placeholderTextColor={C.ash}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 }}
    />
  );
}
