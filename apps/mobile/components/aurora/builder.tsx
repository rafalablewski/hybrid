import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { MOVEMENTS, inferBlockKind } from "@hybrid/core";
import { useRoutineBuilder, type BuilderKind, type BuilderItem } from "../../lib/use-routine-builder";
import { useLang } from "../../lib/i18n";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";

const kindColor = (k: BuilderKind, C: ReturnType<typeof useTheme>["palette"]) =>
  k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet;

/** AURORA Builder (mobile) — assemble a reusable routine (WorkoutTemplate):
 *  add exercises, set targets, save + manage. Reuses the shared builder hook so
 *  it's behaviourally identical to the classic variant + /api/templates. */
export default function AuroraBuilder() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const b = useRoutineBuilder();
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = Object.keys(MOVEMENTS).filter((n) => !q || n.toLowerCase().includes(q));
  const exact = Object.keys(MOVEMENTS).some((n) => n.toLowerCase() === q);

  const add = (name: string, kind?: BuilderKind) => {
    b.addExercise(name, kind);
    setPicker(false);
    setQuery("");
  };

  const fieldStyle = { fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 9 } as const;

  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: fs.display }}>{t("w.train.builder.title")}</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 14, lineHeight: 20 }}>
        {t("w.train.builder.intro")}
      </Text>

      <TextInput
        value={b.name}
        onChangeText={b.setName}
        placeholder={t("w.train.builder.routineNamePh")}
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 }}
      />

      {b.items.map((x) => (
        <ItemCard key={x.uid} item={x} C={C} onRemove={() => b.removeItem(x.uid)} onPatch={(p) => b.patchItem(x.uid, p)} onBump={(d) => b.bumpSets(x.uid, d)} fieldStyle={fieldStyle} />
      ))}

      {picker ? (
        <ACard style={{ marginTop: 4 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.train.builder.pickExercise")}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("w.train.builder.searchCustomPh")}
            placeholderTextColor={C.ash}
            autoFocus
            onSubmitEditing={() => query.trim() && add(query)}
            style={[fieldStyle, { marginTop: 10, fontSize: fs.note, paddingVertical: 11 }]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
            {matches.map((n) => {
              const c = kindColor(inferBlockKind(n) as BuilderKind, C);
              return (
                <Pressable key={n} onPress={() => add(n, inferBlockKind(n) as BuilderKind)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: `${c}55`, backgroundColor: `${c}1f` }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: txt(C, c) }}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
          {q.length > 0 && !exact && (
            <Pressable onPress={() => add(query)} style={{ marginTop: 14, borderRadius: RADIUS.pill, backgroundColor: C.lime, paddingVertical: 13, alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.ink }}>+ “{query.trim()}”</Text>
            </Pressable>
          )}
          <Pressable onPress={() => { setPicker(false); setQuery(""); }} style={{ paddingTop: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center" }}>{t("w.train.builder.close")}</Text>
          </Pressable>
        </ACard>
      ) : (
        <Pressable onPress={() => setPicker(true)} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center", marginTop: 4 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{t("w.train.builder.addExercise")}</Text>
        </Pressable>
      )}

      {b.msg && <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: b.msg.ok ? txt(C, C.lime) : txt(C, C.amber), marginTop: 14 }}>{b.msg.text}</Text>}

      <APill
        label={b.saving ? t("w.train.builder.saving") : t("w.train.builder.saveRoutine")}
        onPress={b.save}
        disabled={b.saving || b.items.length === 0}
        style={{ marginTop: 16 }}
      />

      {b.routines.length > 0 && (
        <ACard style={{ marginTop: 20 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.violet) }}>{t("w.train.logger.yourRoutines")}</Text>
          {b.routines.map((r, i) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: i ? 12 : 10, paddingTop: i ? 12 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Pressable style={{ flex: 1 }} onPress={() => b.loadRoutine(r)}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{r.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{r.blocks.length} {t("w.train.builder.blocks")} · {t("w.train.builder.tapToEdit")}</Text>
              </Pressable>
              <Pressable onPress={() => b.remove(r.id)} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </ACard>
      )}
      <View style={{ height: 24 }} />
    </AuroraScreen>
  );
}

function ItemCard({
  item: x,
  C,
  onRemove,
  onPatch,
  onBump,
  fieldStyle,
}: {
  item: BuilderItem;
  C: ReturnType<typeof useTheme>["palette"];
  onRemove: () => void;
  onPatch: (p: Partial<BuilderItem>) => void;
  onBump: (delta: number) => void;
  fieldStyle: object;
}) {
  const c = kindColor(x.kind, C);
  return (
    <ACard style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, c) }}>{x.kind.toUpperCase()}</Text>
        <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }} numberOfLines={1}>{x.name}</Text>
        <Pressable onPress={onRemove} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.ash }}>✕</Text></Pressable>
      </View>
      {x.kind === "strength" ? (
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 12, alignItems: "flex-end" }}>
          <View>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>SETS</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Pressable onPress={() => onBump(-1)} style={{ width: 32, height: 36, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ash, fontSize: fs.subtitle }}>−</Text></Pressable>
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, minWidth: 18, textAlign: "center" }}>{x.sets}</Text>
              <Pressable onPress={() => onBump(1)} style={{ width: 32, height: 36, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: txt(C, C.lime), fontSize: fs.subtitle }}>+</Text></Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>REPS</Text>
            <TextInput value={x.reps} onChangeText={(v) => onPatch({ reps: v })} keyboardType="numeric" placeholder="8" placeholderTextColor={C.ash} style={fieldStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>LOAD</Text>
            <TextInput value={x.load} onChangeText={(v) => onPatch({ load: v })} keyboardType="numeric" placeholder="—" placeholderTextColor={C.ash} style={fieldStyle} />
          </View>
        </View>
      ) : x.kind === "cardio" ? (
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>KM</Text>
            <TextInput value={x.distance} onChangeText={(v) => onPatch({ distance: v })} keyboardType="numeric" placeholder="5" placeholderTextColor={C.ash} style={fieldStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>MIN</Text>
            <TextInput value={x.minutes} onChangeText={(v) => onPatch({ minutes: v })} keyboardType="numeric" placeholder="30" placeholderTextColor={C.ash} style={fieldStyle} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>MIN</Text>
          <TextInput value={x.minutes} onChangeText={(v) => onPatch({ minutes: v })} keyboardType="numeric" placeholder="12" placeholderTextColor={C.ash} style={fieldStyle} />
        </View>
      )}
    </ACard>
  );
}
