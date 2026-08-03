import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { fs, space, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { getCoachDiet, saveCoachDiet } from "../lib/api";
import { ACard, cardStack } from "./aurora/kit";

type Fields = { kcal: string; protein: string; carbs: string; fat: string; note: string };
const EMPTY: Fields = { kcal: "", protein: "", carbs: "", fat: "", note: "" };

/** Coach-assigned diet (macro targets) for a client — the nutrition analogue of
 *  an assigned plan. Shared by the classic + Aurora mobile client-detail views;
 *  the client sees it read-only on Nutrition. Soft-degrades until the SQL runs. */
export default function CoachDiet({ linkId }: { linkId: string }) {
  const C = useTheme().palette;
  const [d, setD] = useState<Fields>(EMPTY);
  const [unavailable, setUnavailable] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getCoachDiet(linkId)
      .then(({ diet, unavailable }) => {
        setUnavailable(unavailable);
        if (diet) setD({
          kcal: diet.kcal?.toString() ?? "",
          protein: diet.protein?.toString() ?? "",
          carbs: diet.carbs?.toString() ?? "",
          fat: diet.fat?.toString() ?? "",
          note: diet.note ?? "",
        });
      })
      .catch(() => {});
  }, [linkId]);

  const num = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Number(s) || 0));
  const save = async () => {
    setMsg("");
    const r = await saveCoachDiet(linkId, { kcal: num(d.kcal), protein: num(d.protein), carbs: num(d.carbs), fat: num(d.fat), note: d.note.trim() || undefined });
    setMsg(r.ok ? "Saved — your client sees it on Nutrition." : (r.error || "Couldn't save."));
  };

  const field = (label: string, key: keyof Fields) => (
    <View style={{ flex: 1 }}>
      <Mono color={C.ash} style={{ fontSize: fs.nano, marginBottom: 4 }}>{label}</Mono>
      <TextInput
        value={d[key]}
        onChangeText={(v) => setD((p) => ({ ...p, [key]: v.replace(/[^0-9]/g, "") }))}
        keyboardType="number-pad"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10 }}
      />
    </View>
  );

  return (
    <ACard style={[cardStack, { borderLeftWidth: 3, borderLeftColor: C.lime }]}>
      <Kicker color={C.lime}>Assign diet – daily macros</Kicker>
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: 10 }}>
        {field("kcal", "kcal")}
        {field("protein g", "protein")}
        {field("carbs g", "carbs")}
        {field("fat g", "fat")}
      </View>
      <TextInput
        value={d.note}
        onChangeText={(v) => setD((p) => ({ ...p, note: v }))}
        placeholder="note (optional)"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, marginTop: 8 }}
      />
      <View style={{ marginTop: 10 }}><Button label="Save diet" color={C.lime} onPress={save} /></View>
      {msg !== "" && <View accessibilityLiveRegion="polite"><Mono color={C.lime} style={{ marginTop: 8 }}>{msg}</Mono></View>}
      {unavailable && <Mono color={C.ash} style={{ marginTop: 8 }}>Diet assignment isn&apos;t enabled yet — run reference/sql-coach-diet.sql.</Mono>}
    </ACard>
  );
}
