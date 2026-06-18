import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { pacePerKm } from "@hybrid/core";
import { createSession } from "../lib/api";
import { Screen, Card, Kicker, Mono, H1, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraRunTrack from "../components/aurora/run-track";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function RunTrack() {
  if (useTemplate().template === "aurora") return <AuroraRunTrack />;
  return <ClassicRunTrack />;
}

/** Run tracking — live-run surface. Live GPS route mapping needs the native
 *  build (expo-location + a map lib), so the map is a PLACEHOLDER; the
 *  stopwatch + manual distance → pace are real and save a cardio session. */
function ClassicRunTrack() {
  const C = useTheme().palette;
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const startedRef = useRef<number | null>(null);
  const baseRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - (startedRef.current ?? Date.now())) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) { baseRef.current = elapsed; setRunning(false); }
    else { startedRef.current = Date.now(); setRunning(true); }
  };
  const reset = () => { setRunning(false); setElapsed(0); baseRef.current = 0; startedRef.current = null; setMsg(null); };

  const km = parseFloat(distance);
  const minutes = elapsed / 60;
  const pace = Number.isFinite(km) && km > 0 && minutes > 0 ? pacePerKm({ distance: km, minutes }) : null;

  const save = async () => {
    if (elapsed < 1 && !(Number.isFinite(km) && km > 0)) { setMsg({ text: "Start the timer or enter a distance first.", ok: false }); return; }
    setSaving(true);
    setMsg(null);
    const now = new Date();
    const ok = await createSession({
      title: "Run",
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      blocks: [{
        kind: "cardio",
        name: "Run",
        ...(Number.isFinite(km) && km > 0 ? { distance: km } : {}),
        ...(minutes > 0 ? { minutes: Math.round(minutes) } : {}),
      }],
    });
    setSaving(false);
    if (ok) { setMsg({ text: "✓ Run saved to your history.", ok: true }); reset(); }
    else setMsg({ text: "Couldn't save — sign in and try again.", ok: false });
  };

  return (
    <Screen>
      <Kicker>Run tracking</Kicker>
      <H1>Track a run</H1>
      <Mono style={{ marginTop: 6, marginBottom: 14, lineHeight: 18 }}>Time it, log the distance, save it to your history.</Mono>

      {/* Map placeholder */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ height: 200, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", top: 24, left: 28, width: 12, height: 12, borderRadius: 6, backgroundColor: C.lime }} />
          <View style={{ position: "absolute", bottom: 28, right: 30, width: 12, height: 12, borderRadius: 6, backgroundColor: C.amber }} />
          <Text style={{ fontSize: 26 }}>📍</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk, marginTop: 8 }}>Live route map</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 6, textAlign: "center", paddingHorizontal: 28, lineHeight: 17 }}>
            GPS route tracking goes live in the native app build. Timing &amp; distance below work everywhere.
          </Text>
        </View>
      </Card>

      {/* Live stats */}
      <Card>
        <View style={{ flexDirection: "row" }}>
          <Stat label="Time" value={mmss(elapsed)} color={C.chalk} C={C} />
          <Stat label="Distance" value={Number.isFinite(km) && km > 0 ? `${km} km` : "—"} color={txt(C, C.blue)} C={C} />
          <Stat label="Pace /km" value={pace ?? "—"} color={txt(C, C.lime)} C={C} />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Pressable onPress={toggle} style={{ flex: 1, backgroundColor: running ? C.amber : C.lime, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 15, color: C.ink }}>{running ? "❚❚ Pause" : elapsed > 0 ? "▶ Resume" : "▶ Start run"}</Text>
          </Pressable>
          <Pressable onPress={reset} disabled={elapsed === 0} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", opacity: elapsed === 0 ? 0.5 : 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Reset</Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <Mono style={{ marginBottom: 6 }}>Distance (km)</Mono>
        <TextInput
          value={distance}
          onChangeText={setDistance}
          keyboardType="numeric"
          placeholder="e.g. 5.0"
          placeholderTextColor={C.ash}
          style={{ fontFamily: F.mono, fontSize: 16, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }}
        />
        <Mono style={{ fontSize: 11, marginTop: 8 }}>In the native build, GPS fills this in automatically as you run.</Mono>
      </Card>

      {msg && <Mono color={msg.ok ? C.lime : C.amber} style={{ marginVertical: 8 }}>{msg.text}</Mono>}

      <View style={{ marginTop: 4 }}>
        <Button label={saving ? "Saving…" : "Save run →"} color={C.lime} onPress={save} disabled={saving} />
      </View>

      <Pressable onPress={() => router.push("/(tabs)/running")} style={{ paddingVertical: 16, alignItems: "center" }}>
        <Mono>See your running analytics →</Mono>
      </Pressable>
      <View style={{ height: 16 }} />
    </Screen>
  );
}

function Stat({ label, value, color, C }: { label: string; value: string; color: string; C: ReturnType<typeof useTheme>["palette"] }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 24, color, marginTop: 4 }}>{value}</Text>
    </View>
  );
}
