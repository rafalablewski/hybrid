import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { parseForcePlateCsv, type ForcePlateImport } from "@hybrid/core";
import { fetchSignals, importSignal, type CoreSignal } from "../lib/api";
import { Screen, Card, Kicker, Mono, H1, Chip, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraForcePlate from "../components/aurora/forceplate";

/** Force-plate / jump-test CSV import — paste a Hawkin/ForceDecks-style CSV; it
 *  normalizes jump height / asymmetry into the Signal ontology. Mobile port. */
export default function ForcePlate() {
  if (useTemplate().template === "aurora") return <AuroraForcePlate />;
  return <ClassicForcePlate />;
}

function ClassicForcePlate() {
  const C = useTheme().palette;
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ForcePlateImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signals, setSignals] = useState<CoreSignal[]>([]);

  const loadSignals = () => fetchSignals().then(setSignals);
  useEffect(() => { loadSignals(); }, []);

  const parse = () => {
    setMsg(null);
    try {
      setParsed(parseForcePlateCsv(text, { athleteId: "me" }));
    } catch {
      setParsed(null);
      setMsg("Couldn't parse that CSV — check the format.");
    }
  };

  const doImport = async () => {
    if (!parsed || parsed.signals.length === 0) return;
    setImporting(true);
    const results = await Promise.all(
      parsed.signals.map((s) => importSignal({ kind: s.kind, value: s.value, unit: s.unit, source: "forceplate", ts: s.ts })),
    );
    const ok = results.filter(Boolean).length;
    setImporting(false);
    setMsg(`Imported ${ok} of ${parsed.signals.length} signals.`);
    setParsed(null);
    setText("");
    loadSignals();
  };

  const jumps = useMemo(
    () => signals.filter((s) => s.kind === "jumpHeight").sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()),
    [signals],
  );
  const maxJ = Math.max(1, ...jumps.map((j) => j.value));

  return (
    <Screen>
      <Kicker>Force plate</Kicker>
      <H1>Import jump CSV</H1>
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue, marginTop: 14 }}>
        <Mono color={C.chalk} style={{ lineHeight: 18 }}>
          Paste a Hawkin / ForceDecks-style CSV (wide: date + metric columns, or long: date,metric,value,unit). Jump height & asymmetry land in your Twin; unknown columns are skipped.
        </Mono>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={"date,metric,value,unit\n2026-06-01,Jump Height,42.1,cm"}
          placeholderTextColor={C.ash}
          multiline
          autoCapitalize="none"
          style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 120, textAlignVertical: "top" }}
        />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Pressable onPress={parse} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 11, alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.chalk }}>Parse</Text>
          </Pressable>
          <Pressable onPress={doImport} disabled={!parsed || parsed.signals.length === 0 || importing} style={{ flex: 1, backgroundColor: parsed && parsed.signals.length > 0 ? C.lime : C.line, borderRadius: 10, paddingVertical: 11, alignItems: "center", opacity: importing ? 0.6 : 1 }}>
            <Text style={{ fontFamily: F.black, fontSize: 13, color: C.ink }}>{importing ? "Importing…" : "Import"}</Text>
          </Pressable>
        </View>

        {parsed && (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Chip color={C.lime}>{parsed.signals.length} signals · {parsed.rows} rows</Chip>
              {parsed.recognized.length > 0 && <Chip color={C.blue}>recognized: {parsed.recognized.join(", ")}</Chip>}
              {parsed.ignored.length > 0 && <Chip color={C.ash}>skipped: {parsed.ignored.join(", ")}</Chip>}
            </View>
          </View>
        )}
        {msg && <Mono color={C.lime} style={{ marginTop: 10 }}>{msg}</Mono>}
      </Card>

      {jumps.length > 0 && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 14 }}>
          <Kicker color={C.lime}>Jump height</Kicker>
          <Mono color={C.ash} style={{ fontSize: 11, marginTop: 2 }}>neuromuscular readiness · a drop flags fatigue</Mono>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 90, marginTop: 12 }}>
            {jumps.slice(-20).map((j, i) => (
              <View key={i} style={{ flex: 1, height: Math.max(3, (j.value / maxJ) * 84), backgroundColor: i === Math.min(jumps.length, 20) - 1 ? C.lime : `${C.lime}66`, borderRadius: 2 }} />
            ))}
          </View>
          <Mono color={C.ash} style={{ fontSize: 10, marginTop: 6 }}>latest {Math.round(jumps[jumps.length - 1]!.value * 10) / 10} cm</Mono>
        </Card>
      )}
      <View style={{ height: 16 }} />
    </Screen>
  );
}
