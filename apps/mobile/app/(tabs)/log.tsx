import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import { fetchSessions, createSession } from "../../lib/api";
import { Screen, Card, Kicker, Mono, Button, C, F } from "../../lib/ui";

type EB = SessionBlock & { uid: string };
const uid = () => Math.random().toString(36).slice(2);

export default function Log() {
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [title, setTitle] = useState("Workout");
  const [blocks, setBlocks] = useState<EB[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSessions().then(setSessions);
  }, []);

  const rx = useMemo(
    () => prescribeSession(sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS),
    [sessions],
  );

  const usePrescribed = () => {
    setTitle("AI Prescribed");
    setBlocks(
      rx.blocks.map((b) =>
        b.kind === "strength"
          ? { uid: uid(), kind: "strength", name: b.name, sets: b.sets }
          : { uid: uid(), kind: "conditioning", name: b.name, work: b.work, rest: b.rest, rounds: b.rounds },
      ),
    );
  };

  const addStrength = () =>
    setBlocks((b) => [...b, { uid: uid(), kind: "strength", name: "Back Squat", sets: [{ load: "", reps: "", rpe: "" }] }]);
  const addCond = () =>
    setBlocks((b) => [...b, { uid: uid(), kind: "conditioning", name: "Row Intervals", minutes: 12, rpe: 8 }]);
  const remove = (u: string) => setBlocks((bs) => bs.filter((x) => x.uid !== u));
  const rename = (u: string, name: string) =>
    setBlocks((bs) => bs.map((x) => (x.uid === u ? ({ ...x, name } as EB) : x)));
  const setStrSet = (u: string, i: number, k: "load" | "reps" | "rpe", v: string) =>
    setBlocks((bs) =>
      bs.map((x) =>
        x.uid === u && x.kind === "strength"
          ? ({ ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s)) } as EB)
          : x,
      ),
    );
  const addSet = (u: string) =>
    setBlocks((bs) =>
      bs.map((x) => (x.uid === u && x.kind === "strength" ? ({ ...x, sets: [...x.sets, { load: "", reps: "", rpe: "" }] } as EB) : x)),
    );

  const save = async () => {
    setSaving(true);
    setError("");
    const ok = await createSession({
      title: title.trim() || "Workout",
      readiness: rx.readiness,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      blocks: blocks.map(({ uid: _u, ...b }) => b),
    });
    if (!ok) {
      setError("Couldn't save — check your connection / sign-in.");
      setSaving(false);
      return;
    }
    setBlocks([]);
    setTitle("Workout");
    setSaving(false);
    router.push("/(tabs)/history");
  };

  return (
    <Screen>
      <Kicker>Log session</Kicker>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Kicker color={C.violet}>AI Coach · {rx.readiness}/100</Kicker>
          <Pressable onPress={usePrescribed}>
            <Mono color={C.violet}>use →</Mono>
          </Pressable>
        </View>
        <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>{rx.why}</Mono>
      </Card>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Session title"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 12 }}
      />

      {blocks.map((b) => (
        <Card key={b.uid}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Mono color={b.kind === "strength" ? C.lime : C.blue} style={{ fontSize: 10 }}>
              {b.kind.toUpperCase()}
            </Mono>
            <TextInput
              value={b.name}
              onChangeText={(v) => rename(b.uid, v)}
              style={{ flex: 1, fontFamily: F.bold, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
            />
            <Pressable onPress={() => remove(b.uid)}>
              <Text style={{ color: C.red, fontSize: 16, padding: 4 }}>✕</Text>
            </Pressable>
          </View>

          {b.kind === "strength" ? (
            <>
              {b.sets.map((st, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                  <Cell value={st.load} onChange={(v) => setStrSet(b.uid, i, "load", v)} ph="kg" />
                  <Cell value={st.reps} onChange={(v) => setStrSet(b.uid, i, "reps", v)} ph="reps" />
                  <Cell value={st.rpe ?? ""} onChange={(v) => setStrSet(b.uid, i, "rpe", v)} ph="rpe" />
                </View>
              ))}
              <Pressable onPress={() => addSet(b.uid)}>
                <Mono color={C.ash}>+ set</Mono>
              </Pressable>
            </>
          ) : (
            <Mono>{[b.minutes ? `${b.minutes} min` : null, b.rpe ? `RPE ${b.rpe}` : null].filter(Boolean).join(" · ")}</Mono>
          )}
        </Card>
      ))}

      <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
        <Pressable onPress={addStrength} style={pill(C.lime)}>
          <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.lime }}>+ Strength</Text>
        </Pressable>
        <Pressable onPress={addCond} style={pill(C.blue)}>
          <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.blue }}>+ Conditioning</Text>
        </Pressable>
      </View>

      {!!error && <Mono color={C.red} style={{ marginBottom: 10 }}>{error}</Mono>}

      <Button
        label={saving ? "Saving…" : "Save session →"}
        onPress={save}
        disabled={saving || blocks.length === 0}
      />
    </Screen>
  );
}

function Cell({ value, onChange, ph }: { value: string; onChange: (v: string) => void; ph: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={ph}
      placeholderTextColor={C.ash}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}
    />
  );
}

const pill = (color: string) => ({
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: `${color}55`,
  backgroundColor: `${color}1f`,
});
