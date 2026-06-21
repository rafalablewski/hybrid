import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { deploymentReadiness, unitReadiness, type UnitMember } from "@hybrid/core";
import { fetchState, type StateSnapshot } from "../../lib/api";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";

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

/** AURORA Tactical — Deployment Readiness Index (Performance State + occupational capacity)
 *  and a unit go/no-go roll-up, reusing deploymentReadiness + unitReadiness. */
export default function AuroraTactical() {
  const { palette: C } = useTheme();
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
    <AuroraScreen>
      <AHeading style={{ fontSize: fs.display }}>Deployment readiness</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, lineHeight: 20 }}>
        Fuses the Performance State (HPI + injury availability) with occupational capacity into a duty status, plus a unit go/no-go.
      </Text>

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>Your readiness</Text>
        {noData ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 8, lineHeight: 18 }}>Log training to compute your DRI from real readiness + injury risk.</Text>
        ) : dr ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.ms, marginTop: 6 }}>
              <Text style={{ fontFamily: F.black, fontSize: 48, color: txt(C, statusColor(dr.status, C)) }}>{dr.dri}</Text>
              <View style={{ backgroundColor: `${statusColor(dr.status, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, statusColor(dr.status, C)) }}>{dr.status}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>HPI {state!.hpi}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>injury risk {state!.injuryRisk}</Text>
            </View>
            {dr.limiters.length > 0 && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 8, lineHeight: 18 }}>{dr.limiters.join(" · ")}</Text>}
            <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
              <Field C={C} label="Load carriage" value={loadCarriage} onChange={setLoadCarriage} />
              <Field C={C} label="Work capacity" value={workCapacity} onChange={setWorkCapacity} />
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 8 }}>Loading…</Text>
        )}
      </ACard>

      {unit && (
        <ACard style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, unit.go ? C.lime : C.red) }}>Unit readiness</Text>
            <View style={{ backgroundColor: `${unit.go ? C.lime : C.red}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, unit.go ? C.lime : C.red) }}>{unit.go ? "MISSION GO" : "NO-GO"} · {unit.pctReady}%</Text>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            {unit.members.map((m) => (
              <View key={m.name} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{m.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, width: 44, textAlign: "right" }}>{m.dri}</Text>
                <View style={{ width: 120, alignItems: "flex-end" }}>
                  <View style={{ backgroundColor: `${statusColor(m.status, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, statusColor(m.status, C)) }}>{m.status}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>Your readiness alongside an illustrative unit (real units plug in via the Org graph).</Text>
        </ACard>
      )}
      <View style={{ height: 16 }} />
    </AuroraScreen>
  );
}

function Field({ C, label, value, onChange }: { C: Palette; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14 }}
      />
    </View>
  );
}
