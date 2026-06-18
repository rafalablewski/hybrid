import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { pacePerKm } from "@hybrid/core";
import { createSession } from "../../lib/api";
import { F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** AURORA Run tracking — live-run surface with a PLACEHOLDER route map (live
 *  GPS needs expo-location + a map lib in the native build); the stopwatch +
 *  manual distance → pace are real and save a cardio session via the API. */
export default function AuroraRunTrack() {
  const { palette: C } = useTheme();
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
    <AuroraScreen>
      <AHeading style={{ fontSize: 26 }}>Run tracking</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.ash, marginTop: 8, marginBottom: 14, lineHeight: 20 }}>Track a run — time it, log the distance, save it to your history.</Text>

      {/* Map placeholder */}
      <ACard style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
        <View style={{ height: 200, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", top: 24, left: 28, width: 12, height: 12, borderRadius: 6, backgroundColor: C.lime }} />
          <View style={{ position: "absolute", bottom: 28, right: 30, width: 12, height: 12, borderRadius: 6, backgroundColor: C.amber }} />
          <AuroraIcon name="location" size={30} color={C.ash} />
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk, marginTop: 8 }}>Live route map</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 6, textAlign: "center", paddingHorizontal: 28, lineHeight: 17 }}>
            GPS route tracking goes live in the native app build. Timing &amp; distance below work everywhere.
          </Text>
        </View>
      </ACard>

      {/* Live stats */}
      <ACard style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row" }}>
          <Stat label="Time" value={mmss(elapsed)} color={C.chalk} C={C} />
          <Stat label="Distance" value={Number.isFinite(km) && km > 0 ? `${km} km` : "—"} color={txt(C, C.blue)} C={C} />
          <Stat label="Pace /km" value={pace ?? "—"} color={txt(C, C.lime)} C={C} />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Pressable onPress={toggle} style={{ flex: 1, backgroundColor: running ? C.amber : C.lime, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 15, color: C.ink }}>{running ? "❚❚ Pause" : elapsed > 0 ? "▶ Resume" : "▶ Start run"}</Text>
          </Pressable>
          <Pressable onPress={reset} disabled={elapsed === 0} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", opacity: elapsed === 0 ? 0.5 : 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Reset</Text>
          </Pressable>
        </View>
      </ACard>

      <ACard style={{ marginBottom: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, marginBottom: 6 }}>Distance (km)</Text>
        <TextInput
          value={distance}
          onChangeText={setDistance}
          keyboardType="numeric"
          placeholder="e.g. 5.0"
          placeholderTextColor={C.ash}
          style={{ fontFamily: F.mono, fontSize: 16, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 11 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 8 }}>In the native build, GPS fills this in automatically as you run.</Text>
      </ACard>

      {msg && <Text style={{ fontFamily: F.mono, fontSize: 13, color: msg.ok ? txt(C, C.lime) : txt(C, C.amber), marginBottom: 8 }}>{msg.text}</Text>}

      <APill label={saving ? "Saving…" : "Save run →"} onPress={save} disabled={saving} />

      <Pressable onPress={() => router.push("/(tabs)/running")} style={{ paddingVertical: 16, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>See your running analytics →</Text>
      </Pressable>
      <View style={{ height: 16 }} />
    </AuroraScreen>
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
