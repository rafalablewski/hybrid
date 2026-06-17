import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ALL_MUSCLES } from "@hybrid/core";
import { fetchMyExercises, createExercise, deleteExercise, type LibExercise } from "../lib/api";
import { Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

// Athlete+ "My exercises" — create your OWN movements; they flow into the
// workout picker (which reads /api/exercises). Free users get an upgrade nudge.
const PATTERNS = ["squat", "hinge", "push", "pull", "lunge", "carry", "core", "cond"];

export default function CustomExercises() {
  const C = useTheme().palette;
  const router = useRouter();
  const [mine, setMine] = useState<LibExercise[]>([]);
  const [canCreate, setCanCreate] = useState(true);
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("push");
  const [kind, setKind] = useState("strength");
  const [muscles, setMuscles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = () => fetchMyExercises().then((r) => { setMine(r.exercises); setCanCreate(r.canCreate); });
  useEffect(() => { load(); }, []);

  const toggle = (m: string) => setMuscles((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const create = async () => {
    if (!name.trim() || muscles.length === 0) { setMsg({ text: "Name + at least one muscle required.", ok: false }); return; }
    setBusy(true); setMsg(null);
    const r = await createExercise({ name: name.trim(), pattern, kind, muscles });
    setBusy(false);
    if (r.ok) { setMsg({ text: `Added "${name.trim()}".`, ok: true }); setName(""); setMuscles([]); load(); }
    else { setMsg({ text: r.error ?? "Couldn't save.", ok: false }); if (r.error?.includes("Full")) setCanCreate(false); }
  };

  const inputStyle = { fontFamily: F.mono, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 } as const;

  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={{ marginBottom: 6 }}>
        <Mono>← Back</Mono>
      </Pressable>
      <Kicker>My exercises</Kicker>

      {!canCreate ? (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 10 }}>
          <Mono color={C.chalk} style={{ lineHeight: 20 }}>
            Add your own movements — they show up in your workout picker. It&apos;s part of Full.
          </Mono>
          <View style={{ marginTop: 12 }}>
            <Button label="Unlock Full →" color={C.lime} onPress={() => router.push("/upgrade")} />
          </View>
        </Card>
      ) : (
        <Card style={{ marginTop: 10 }}>
          <Mono color={C.chalk} style={{ lineHeight: 20 }}>Add a movement we don&apos;t have — it joins your picker.</Mono>
          <TextInput value={name} onChangeText={setName} placeholder="Exercise name" placeholderTextColor={C.ash} style={inputStyle} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {PATTERNS.map((p) => (
              <Pressable key={p} onPress={() => setPattern(p)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: pattern === p ? C.lime : C.line, backgroundColor: pattern === p ? `${C.lime}22` : "transparent" }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: pattern === p ? txt(C, C.lime) : C.ash }}>{p}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            {["strength", "conditioning"].map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: kind === k ? C.blue : C.line, backgroundColor: kind === k ? `${C.blue}22` : "transparent" }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: kind === k ? txt(C, C.blue) : C.ash }}>{k}</Text>
              </Pressable>
            ))}
          </View>
          <Mono color={C.ash} style={{ marginTop: 10, fontSize: 11 }}>Muscles worked</Mono>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {ALL_MUSCLES.map((m) => (
              <Pressable key={m} onPress={() => toggle(m)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: muscles.includes(m) ? C.lime : C.line, backgroundColor: muscles.includes(m) ? `${C.lime}22` : "transparent" }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: muscles.includes(m) ? txt(C, C.lime) : C.ash }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          {msg && <Mono color={msg.ok ? C.lime : C.amber} style={{ marginTop: 10 }}>{msg.text}</Mono>}
          <View style={{ marginTop: 12 }}>
            <Button label={busy ? "Adding…" : "Add exercise →"} color={C.lime} onPress={create} disabled={busy} />
          </View>
        </Card>
      )}

      {mine.map((m) => (
        <Card key={m.id} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{m.name}</Text>
              <Mono color={C.ash} style={{ fontSize: 11 }}>{m.pattern} · {m.kind} · {m.muscles.join(", ")}</Mono>
            </View>
            <Pressable onPress={async () => { if (m.id && (await deleteExercise(m.id))) load(); }}>
              <Mono color={C.ash}>Delete</Mono>
            </Pressable>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
