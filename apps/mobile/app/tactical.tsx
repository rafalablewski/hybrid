import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { deploymentReadiness, unitReadiness, type UnitMember } from "@hybrid/core";
import { fetchState, type StateSnapshot } from "../lib/api";
import { fs, space, Screen, Card, Kicker, Mono, H1, Chip, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraTactical from "../components/aurora/tactical";

type Palette = ReturnType<typeof useTheme>["palette"];
const num = (s: string, d: number) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const statusColor = (s: string, C: Palette) =>
  s === "ready" ? C.lime : s === "qualified" ? C.blue : s === "limited" ? C.amber : C.red;

// Illustrative squad alongside the athlete's own readiness.
const PEERS: UnitMember[] = [
  { name: "Alpha-1", dri: 88, status: "ready" },
  { name: "Alpha-2", dri: 74, status: "qualified" },
  { name: "Alpha-3", dri: 61, status: "limited" },
  { name: "Alpha-4", dri: 44, status: "non-deployable" },
];

/** Tactical — a Deployment Readiness Index (Twin + occupational capacity) and a
 *  unit go/no-go roll-up. Mobile port. */
export default function Tactical() {
  if (useTemplate().template === "aurora") return <AuroraTactical />;
  return <ClassicTactical />;
}

function ClassicTactical() {
  const C = useTheme().palette;
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadCarriage, setLoadCarriage] = useState("78");
  const [workCapacity, setWorkCapacity] = useState("80");

  useEffect(() => {
    fetchState().then((s) => { setState(s); setLoaded(true); });
  }, []);

  const dr = useMemo(() => {
    if (!state) return null;
    return deploymentReadiness({ hpi: state.hpi, injuryRisk: state.injuryRisk, loadCarriage: num(loadCarriage, 78), workCapacity: num(workCapacity, 80) });
  }, [state, loadCarriage, workCapacity]);

  const unit = useMemo(() => {
    if (!dr) return null;
    return unitReadiness([{ name: "You", dri: dr.dri, status: dr.status }, ...PEERS]);
  }, [dr]);

  const noData = loaded && (!state || state.sessionCount === 0);

  return (
    <Screen>
      <Kicker>Tactical</Kicker>
      <H1>Deployment readiness</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>
        Fuses the Twin (HPI + injury availability) with occupational capacity into a duty status, plus a unit go/no-go.
      </Mono>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue, marginTop: 14 }}>
        <Kicker color={C.blue}>Your readiness</Kicker>
        {noData ? (
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 18 }}>Log training to compute your DRI from real readiness + injury risk.</Mono>
        ) : dr ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.ms, marginTop: 4 }}>
              <Text style={{ fontFamily: F.black, fontSize: 48, color: txt(C, statusColor(dr.status, C)) }}>{dr.dri}</Text>
              <Chip color={statusColor(dr.status, C)}>{dr.status}</Chip>
            </View>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
              <Mono color={C.ash}>HPI {state!.hpi}</Mono>
              <Mono color={C.ash}>injury risk {state!.injuryRisk}</Mono>
            </View>
            {dr.limiters.length > 0 && <Mono color={C.amber} style={{ marginTop: 8, lineHeight: 18 }}>{dr.limiters.join(" · ")}</Mono>}
            <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
              <Field C={C} label="Load carriage" value={loadCarriage} onChange={setLoadCarriage} />
              <Field C={C} label="Work capacity" value={workCapacity} onChange={setWorkCapacity} />
            </View>
          </>
        ) : (
          <Mono color={C.ash} style={{ marginTop: 8 }}>Loading…</Mono>
        )}
      </Card>

      {unit && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: unit.go ? C.lime : C.red, marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Kicker color={unit.go ? C.lime : C.red}>Unit readiness</Kicker>
            <Chip color={unit.go ? C.lime : C.red}>{unit.go ? "MISSION GO" : "NO-GO"} · {unit.pctReady}%</Chip>
          </View>
          <View style={{ marginTop: 10 }}>
            {unit.members.map((m) => (
              <View key={m.name} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{m.name}</Text>
                <Mono color={C.chalk} style={{ width: 44, textAlign: "right", fontSize: fs.body }}>{m.dri}</Mono>
                <View style={{ width: 110, alignItems: "flex-end" }}><Chip color={statusColor(m.status, C)}>{m.status}</Chip></View>
              </View>
            ))}
          </View>
          <Mono color={C.ash} style={{ marginTop: 10, fontSize: fs.micro }}>Your readiness alongside an illustrative unit (real units plug in via the Org graph).</Mono>
        </Card>
      )}
      <View style={{ height: 16 }} />
    </Screen>
  );
}

function Field({ C, label, value, onChange }: { C: Palette; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Mono color={C.ash} style={{ fontSize: fs.nano, marginBottom: 4 }}>{label}</Mono>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 }}
      />
    </View>
  );
}
