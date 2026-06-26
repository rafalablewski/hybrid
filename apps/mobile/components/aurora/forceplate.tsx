import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { parseForcePlateCsv, type ForcePlateImport } from "@hybrid/core";
import { fetchSignals, importSignal, type CoreSignal } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

/** AURORA Force plate — CSV import of jump-test data into the Signal ontology +
 *  jump-height trend, reusing the exact parseForcePlateCsv + import flow. */
export default function AuroraForcePlate() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ForcePlateImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signals, setSignals] = useState<CoreSignal[]>([]);

  const loadSignals = () => fetchSignals().then(setSignals);
  useEffect(() => { loadSignals(); }, []);

  const parse = () => {
    setMsg(null);
    try { setParsed(parseForcePlateCsv(text, { athleteId: "me" })); }
    catch { setParsed(null); setMsg(t("w.analyze.fp.parseError")); }
  };
  const doImport = async () => {
    if (!parsed || parsed.signals.length === 0) return;
    setImporting(true);
    const results = await Promise.all(parsed.signals.map((s) => importSignal({ kind: s.kind, value: s.value, unit: s.unit, source: "forceplate", ts: s.ts })));
    const ok = results.filter(Boolean).length;
    setImporting(false);
    setMsg(`${t("w.analyze.fp.imported")} ${ok}/${parsed.signals.length} ${t("w.analyze.fp.signalsWord")}`);
    setParsed(null); setText(""); loadSignals();
  };

  const jumps = useMemo(() => signals.filter((s) => s.kind === "jumpHeight").sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()), [signals]);
  const maxJ = Math.max(1, ...jumps.map((j) => j.value));
  const chip = (color: string, label: string) => <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color) }}>{label}</Text></View>;

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.fp.title")}</AHeading>
      </View>

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 19 }}>{t("w.analyze.fp.importBody-mobile")}</Text>
        <TextInput value={text} onChangeText={setText} placeholder={"date,metric,value,unit\n2026-06-01,Jump Height,42.1,cm"} placeholderTextColor={C.ash} multiline autoCapitalize="none"
          style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 12, marginTop: 12, minHeight: 120, textAlignVertical: "top" }} />
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 12 }}>
          <APill label={t("w.analyze.fp.parse")} variant="soft" onPress={parse} style={{ flex: 1 }} />
          <APill label={importing ? t("w.analyze.fp.importing") : t("w.analyze.fp.importPre")} onPress={doImport} disabled={!parsed || parsed.signals.length === 0 || importing} style={{ flex: 1 }} />
        </View>
        {parsed && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12 }}>
            {chip(C.lime, `${parsed.signals.length} ${t("w.analyze.fp.signals")} · ${parsed.rows} ${t("w.analyze.fp.rows")}`)}
            {parsed.recognized.length > 0 && chip(C.blue, `${t("w.analyze.fp.recognized")} ${parsed.recognized.join(", ")}`)}
            {parsed.ignored.length > 0 && chip(C.ash, `${t("w.analyze.fp.skipped")} ${parsed.ignored.join(", ")}`)}
          </View>
        )}
        {msg && <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime), marginTop: 10 }}>{msg}</Text>}
      </ACard>

      {jumps.length > 0 && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.fp.jumpTitle-mobile")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t("w.analyze.fp.jumpSubtitle")}</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xxs, height: 90, marginTop: 12 }}>
            {jumps.slice(-20).map((j, i) => <View key={i} style={{ flex: 1, height: Math.max(3, (j.value / maxJ) * 84), backgroundColor: i === Math.min(jumps.length, 20) - 1 ? C.lime : `${C.lime}66`, borderRadius: 3 }} />)}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 6 }}>{t("w.analyze.fp.latest")} {Math.round(jumps[jumps.length - 1]!.value * 10) / 10} cm</Text>
        </ACard>
      )}
    </AuroraScreen>
  );
}
