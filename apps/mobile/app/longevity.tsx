import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { longevityReport } from "@hybrid/core";
import { fetchSignals, type CoreSignal } from "../lib/api";
import { Screen, Card, Kicker, Mono, H1, Chip, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

type Palette = ReturnType<typeof useTheme>["palette"];
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Longevity — biological age vs chronological + healthspan, from recovery
 *  markers (prefilled from the Signal ontology). Mobile port. */
export default function Longevity() {
  const C = useTheme().palette;
  const [age, setAge] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [hrv, setHrv] = useState("");
  const [vo2, setVo2] = useState("");
  const [sleepH, setSleepH] = useState("");

  useEffect(() => {
    fetchSignals().then((sigs: CoreSignal[]) => {
      const latest = (kind: string) =>
        sigs.filter((s) => s.kind === kind).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0]?.value;
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

  return (
    <Screen>
      <Kicker>Longevity</Kicker>
      <H1>Performance medicine</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>
        Estimates your biological age vs your real age from recovery markers. Heuristic v0 — not a diagnostic.
      </Mono>

      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>Your markers</Kicker>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <Field C={C} label="Age (yrs)" value={age} onChange={setAge} />
          <Field C={C} label="Resting HR" value={restingHr} onChange={setRestingHr} />
          <Field C={C} label="HRV (ms)" value={hrv} onChange={setHrv} />
          <Field C={C} label="VO₂max" value={vo2} onChange={setVo2} />
          <Field C={C} label="Sleep (h)" value={sleepH} onChange={setSleepH} />
        </View>
      </Card>

      {report ? (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue, marginTop: 14 }}>
          <Kicker color={C.blue}>Biological age</Kicker>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 4 }}>
            <Text style={{ fontFamily: F.black, fontSize: 48, color: C.chalk }}>{Math.round(report.bioAge)}</Text>
            <Chip color={report.delta <= 0 ? C.lime : C.amber}>
              {report.delta <= 0 ? "" : "+"}{report.delta} vs {report.age}
            </Chip>
            <Chip color={C.violet}>healthspan {report.healthspanScore}</Chip>
          </View>
          {report.contributions.length > 0 && (
            <View style={{ marginTop: 12 }}>
              {report.contributions.map((c) => (
                <View key={c.marker} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Mono color={C.chalk} style={{ fontSize: 12 }}>{c.marker}</Mono>
                  <Mono color={c.deltaYears <= 0 ? C.lime : C.amber} style={{ fontSize: 12 }}>{c.deltaYears <= 0 ? "" : "+"}{Math.round(c.deltaYears * 10) / 10} yr</Mono>
                </View>
              ))}
            </View>
          )}
          {report.flags.length > 0 && <Mono color={C.amber} style={{ marginTop: 10, lineHeight: 18 }}>{report.flags.join(" · ")}</Mono>}
          <Mono color={C.ash} style={{ marginTop: 10, fontSize: 10 }}>model {report.modelVersion}</Mono>
        </Card>
      ) : (
        <Card style={{ marginTop: 14 }}>
          <Mono color={C.chalk} style={{ lineHeight: 18 }}>Enter your age and at least one recovery marker to see your biological age.</Mono>
        </Card>
      )}
      <View style={{ height: 16 }} />
    </Screen>
  );
}

function Field({ C, label, value, onChange }: { C: Palette; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ width: "47%", flexGrow: 1 }}>
      <Mono color={C.ash} style={{ fontSize: 10, marginBottom: 4 }}>{label}</Mono>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 }}
      />
    </View>
  );
}
