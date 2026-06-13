import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { computeCompliance, type LoggedSession } from "@hybrid/core";
import { fetchCheckins, createCheckin, fetchSessions, type Checkin } from "../lib/api";
import { Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme } from "../lib/theme";

const RATINGS: { key: "energy" | "sleep" | "soreness" | "mood"; label: string }[] = [
  { key: "energy", label: "Energy" },
  { key: "sleep", label: "Sleep" },
  { key: "soreness", label: "Soreness" },
  { key: "mood", label: "Mood" },
];

export default function CheckinScreen() {
  const C = useTheme().palette;
  const router = useRouter();
  const [history, setHistory] = useState<Checkin[]>([]);
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ bodyMassKg: string; energy: number; sleep: number; soreness: number; mood: number; adherencePct: string; note: string }>(
    { bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "" },
  );

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchCheckins(), fetchSessions()])
      .then(([c, s]) => { setHistory(c); setSessions(s); })
      .finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  const compliance = useMemo(() => computeCompliance(sessions, { targetPerWeek: 3 }), [sessions]);

  const submit = async () => {
    setSaving(true);
    await createCheckin({
      weekOf: new Date().toISOString(),
      bodyMassKg: form.bodyMassKg ? parseFloat(form.bodyMassKg) : null,
      energy: form.energy, sleep: form.sleep, soreness: form.soreness, mood: form.mood,
      adherencePct: form.adherencePct ? parseInt(form.adherencePct, 10) : null,
      note: form.note || null,
    });
    setForm({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "" });
    setSaving(false);
    load();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Weekly check-in</Kicker>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>← back</Text>
      </View>

      <Card style={{ marginTop: 10 }}>
        <Kicker color={C.lime}>This week</Kicker>
        <Mono color={C.chalk} style={{ marginTop: 6 }}>
          {compliance.completedThisWeek}/{compliance.target} sessions · {compliance.pct}% of plan · {compliance.status}
        </Mono>
        {RATINGS.map((r) => (
          <View key={r.key} style={{ marginTop: 12 }}>
            <Mono color={C.chalk} style={{ fontSize: 12 }}>{r.label}</Mono>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
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
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <Field value={form.bodyMassKg} onChange={(v) => setForm((s) => ({ ...s, bodyMassKg: v }))} ph="weight kg" />
          <Field value={form.adherencePct} onChange={(v) => setForm((s) => ({ ...s, adherencePct: v }))} ph="adherence %" />
        </View>
        <TextInput
          value={form.note}
          onChangeText={(v) => setForm((s) => ({ ...s, note: v }))}
          placeholder="How did the week go? Anything your coach should know…"
          placeholderTextColor={C.ash}
          multiline
          style={{ fontFamily: F.mono, fontSize: 13, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 70, textAlignVertical: "top" }}
        />
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
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Mono color={C.chalk}>{new Date(c.weekOf).toLocaleDateString()}</Mono>
              <Mono>{c.adherencePct != null ? `${c.adherencePct}% adherence` : ""}</Mono>
            </View>
            <Mono style={{ marginTop: 6, fontSize: 12 }}>
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
      style={{ flex: 1, fontFamily: F.mono, fontSize: 13, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 }}
    />
  );
}
