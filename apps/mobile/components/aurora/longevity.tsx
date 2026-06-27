import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { longevityReport } from "@hybrid/core";
import { fetchSignals, type CoreSignal } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** AURORA Longevity — biological age vs chronological from recovery markers,
 *  reusing the exact longevityReport engine + Signal prefill as the classic. */
export default function AuroraLongevity() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [age, setAge] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [hrv, setHrv] = useState("");
  const [vo2, setVo2] = useState("");
  const [sleepH, setSleepH] = useState("");

  useEffect(() => {
    fetchSignals().then((sigs: CoreSignal[]) => {
      const latest = (kind: string) => sigs.filter((s) => s.kind === kind).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0]?.value;
      const rhr = latest("restingHr"); if (rhr) setRestingHr(String(Math.round(rhr)));
      const h = latest("hrv"); if (h) setHrv(String(Math.round(h)));
      const sl = latest("sleep"); if (sl) setSleepH(String(Math.round(sl * 10) / 10));
    });
  }, []);

  const report = useMemo(() => {
    const a = num(age);
    if (!a) return null;
    const markers = [restingHr, hrv, vo2, sleepH].some((m) => num(m) !== undefined);
    if (!markers) return null;
    return longevityReport({ age: a, restingHr: num(restingHr), hrv: num(hrv), vo2: num(vo2), sleepH: num(sleepH) });
  }, [age, restingHr, hrv, vo2, sleepH]);

  const chip = (color: string, label: string) => (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, color) }}>{label}</Text>
    </View>
  );

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.longevity.title")}</AHeading>
        <View style={{ marginLeft: "auto" }}><AuroraIcon name="heart" size={24} color={txt(C, C.lime)} /></View>
      </View>
      <ASub style={{ marginTop: 10 }}>{t("w.recovery.longevity.intro")}</ASub>

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.longevity.yourMarkers")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: 12 }}>
          <Field C={C} label={`${t("w.recovery.longevity.fAge")} (yr)`} value={age} onChange={setAge} />
          <Field C={C} label={`${t("w.recovery.longevity.fRestingHr")} (bpm)`} value={restingHr} onChange={setRestingHr} />
          <Field C={C} label="HRV (ms)" value={hrv} onChange={setHrv} />
          <Field C={C} label="VO₂ (ml/kg/min)" value={vo2} onChange={setVo2} />
          <Field C={C} label={`${t("w.recovery.longevity.fSleep")} (h)`} value={sleepH} onChange={setSleepH} />
        </View>
      </ACard>

      {report ? (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.longevity.bioAge")}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.ms, marginTop: 6, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: F.black, fontSize: 48, color: C.chalk }}>{Math.round(report.bioAge)}</Text>
            {chip(report.delta <= 0 ? C.lime : C.amber, `${report.delta <= 0 ? "" : "+"}${report.delta} ${t("w.recovery.longevity.yrVsAge")}`)}
            {chip(C.lime, `${t("w.recovery.longevity.healthspan")} ${report.healthspanScore}`)}
          </View>
          {report.contributions.length > 0 && (
            <View style={{ marginTop: 12 }}>
              {report.contributions.map((c) => (
                <View key={c.marker} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{c.marker}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, c.deltaYears <= 0 ? C.lime : C.amber) }}>{c.deltaYears <= 0 ? "" : "+"}{Math.round(c.deltaYears * 10) / 10} yr</Text>
                </View>
              ))}
            </View>
          )}
          {report.flags.length > 0 && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: txt(C, C.amber), marginTop: 10, lineHeight: 18 }}>{report.flags.join(" · ")}</Text>}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 10 }}>{t("w.recovery.longevity.model")} {report.modelVersion}</Text>
        </ACard>
      ) : (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 19 }}>{t("w.recovery.longevity.bioAgeEmpty")}</Text>
        </ACard>
      )}
    </AuroraScreen>
  );
}

function Field({ C, label, value, onChange }: { C: Palette; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ width: "47%", flexGrow: 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 13 }}
      />
    </View>
  );
}
