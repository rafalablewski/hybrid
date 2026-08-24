import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { fmtKm, pacePerKm, mmss, STATE_OPACITY, LABEL_GAP } from "@hybrid/core";
import { createSession } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { F, PressScale as Pressable, fs, leading, space, tracking, ty} from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, APill, RADIUS } from "./kit";

/** AURORA Run tracking — the stopwatch, a typed distance and the pace those two
 *  produce, saved as a cardio session through the API. Every figure on this
 *  screen is one the athlete or the clock produced; there is no route drawing,
 *  because there is no route being recorded (see the note where the map card
 *  used to be). */
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
        discipline: "running",
        ...(Number.isFinite(km) && km > 0 ? { distance: km } : {}),
        ...(minutes > 0 ? { minutes: Math.round(minutes) } : {}),
      }],
    });
    setSaving(false);
    if (ok) { setMsg({ text: t("w.train.runTrack.saved"), ok: true }); reset(); }
    else setMsg({ text: t("w.train.runTrack.signInSave"), ok: false });
  };

  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.train.runTrack.title") }}>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 16, lineHeight: leading(fs.bodyLg) }}>{t("w.train.runTrack.intro")}</Text>

      {/* NO MAP. There used to be one here: a 200dp card drawing two coloured
          dots on a flat fill under the words "Live route map". Nothing was
          tracked — the dots were at fixed offsets, the same two every run, for
          every athlete. In a product whose whole claim is "measured, not
          claimed", it was the one surface that lied, and it lied in the most
          expensive place: the first thing you saw on the screen. GPS lands with
          the route it actually recorded (SessionStream carries the trace) or it
          does not land at all. */}

      {/* Live stats */}
      <ACard style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row" }}>
          <Stat label={t("w.train.runTrack.time")} value={mmss(elapsed)} color={C.chalk} C={C} />
          <Stat label={t("w.train.runTrack.distance")} value={Number.isFinite(km) && km > 0 ? fmtKm(km) : "—"} color={txt(C, C.blue)} C={C} />
          <Stat label={t("w.train.runTrack.pacePerKm")} value={pace ?? "—"} color={txt(C, C.lime)} C={C} />
        </View>
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 16 }}>
          <APill
            label={running ? t("w.train.runTrack.pause") : elapsed > 0 ? t("w.train.runTrack.resume") : t("w.train.runTrack.startRun")}
            color={running ? C.amber : C.lime}
            onPress={toggle}
            style={{ flex: 1 }}
          />
          <Pressable onPress={reset} disabled={elapsed === 0} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 16, paddingHorizontal: 20, alignItems: "center", opacity: elapsed === 0 ? STATE_OPACITY.disabled : 1 }}>
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
          style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{t("w.train.runTrack.gpsNote")}</Text>
      </ACard>

      {msg && <Text accessibilityLiveRegion={msg.ok ? "polite" : "assertive"} accessibilityRole={msg.ok ? undefined : "alert"} style={{ fontFamily: F.reg, fontSize: fs.body, color: msg.ok ? txt(C, C.lime) : txt(C, C.amber), marginBottom: 8 }}>{msg.text}</Text>}

      <APill label={t("w.train.runTrack.saveRun")} savingLabel={t("w.train.runTrack.saving")} state={saving ? "saving" : "idle"} onPress={save} />

      <Pressable onPress={() => router.push("/endurance")} style={{ paddingVertical: 16, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.train.runTrack.seeAnalytics")}</Text>
      </Pressable>
      <View style={{ height: 16 }} />
    </AuroraScreen>
  );
}

function Stat({ label, value, color, C }: { label: string; value: string; color: string; C: ReturnType<typeof useTheme>["palette"] }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={ty(C, "kicker")}>{label}</Text>
      <Text style={{ fontFamily: F.takeover, fontSize: fs.display, color, marginTop: LABEL_GAP }}>{value}</Text>
    </View>
  );
}
