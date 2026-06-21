import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { pacePerKm } from "@hybrid/core";
import { createSession } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** AURORA Run tracking — live-run surface with a PLACEHOLDER route map (live
 *  GPS needs expo-location + a map lib in the native build); the stopwatch +
 *  manual distance → pace are real and save a cardio session via the API. */
export default function AuroraRunTrack() {
  const { palette: C } = useTheme();
  const { t } = useLang();
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
    if (elapsed < 1 && !(Number.isFinite(km) && km > 0)) { setMsg({ text: t("w.train.runTrack.startFirst"), ok: false }); return; }
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
    if (ok) { setMsg({ text: t("w.train.runTrack.saved"), ok: true }); reset(); }
    else setMsg({ text: t("w.train.runTrack.signInSave"), ok: false });
  };

  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: fs.display }}>{t("w.train.runTrack.title")}</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 14, lineHeight: 20 }}>{t("w.train.runTrack.intro")}</Text>

      {/* Map placeholder */}
      <ACard style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
        <View style={{ height: 200, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", top: 24, left: 28, width: 12, height: 12, borderRadius: 6, backgroundColor: C.lime }} />
          <View style={{ position: "absolute", bottom: 28, right: 30, width: 12, height: 12, borderRadius: 6, backgroundColor: C.amber }} />
          <AuroraIcon name="location" size={30} color={C.ash} />
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, marginTop: 8 }}>{t("w.train.runTrack.liveRouteMap")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6, textAlign: "center", paddingHorizontal: 28, lineHeight: 17 }}>
            {t("w.train.runTrack.mapNote")}
          </Text>
        </View>
      </ACard>

      {/* Live stats */}
      <ACard style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row" }}>
          <Stat label={t("w.train.runTrack.time")} value={mmss(elapsed)} color={C.chalk} C={C} />
          <Stat label={t("w.train.runTrack.distance")} value={Number.isFinite(km) && km > 0 ? `${km} km` : "—"} color={txt(C, C.blue)} C={C} />
          <Stat label={t("w.train.runTrack.pacePerKm")} value={pace ?? "—"} color={txt(C, C.lime)} C={C} />
        </View>
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 16 }}>
          <Pressable onPress={toggle} style={{ flex: 1, backgroundColor: running ? C.amber : C.lime, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>{running ? t("w.train.runTrack.pause") : elapsed > 0 ? t("w.train.runTrack.resume") : t("w.train.runTrack.startRun")}</Text>
          </Pressable>
          <Pressable onPress={reset} disabled={elapsed === 0} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", opacity: elapsed === 0 ? 0.5 : 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.train.runTrack.reset")}</Text>
          </Pressable>
        </View>
      </ACard>

      <ACard style={{ marginBottom: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 6 }}>{t("w.train.runTrack.distanceKm")}</Text>
        <TextInput
          value={distance}
          onChangeText={setDistance}
          keyboardType="numeric"
          placeholder={t("w.train.runTrack.distancePh")}
          placeholderTextColor={C.ash}
          style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 11 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{t("w.train.runTrack.gpsNote")}</Text>
      </ACard>

      {msg && <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: msg.ok ? txt(C, C.lime) : txt(C, C.amber), marginBottom: 8 }}>{msg.text}</Text>}

      <APill label={saving ? t("w.train.runTrack.saving") : t("w.train.runTrack.saveRun")} onPress={save} disabled={saving} />

      <Pressable onPress={() => router.push("/(tabs)/running")} style={{ paddingVertical: 16, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.train.runTrack.seeAnalytics")}</Text>
      </Pressable>
      <View style={{ height: 16 }} />
    </AuroraScreen>
  );
}

function Stat({ label, value, color, C }: { label: string; value: string; color: string; C: ReturnType<typeof useTheme>["palette"] }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 24, color, marginTop: 4 }}>{value}</Text>
    </View>
  );
}
