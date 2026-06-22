import { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, ScrollView } from "react-native";
import { MOVEMENTS, inferBlockKind, olympicSportsByCategory, exercisesByCategory, sportDistanceUnit } from "@hybrid/core";
import { useRoutineBuilder, type BuilderKind, type BuilderItem } from "../lib/use-routine-builder";
import { fs, space, Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraBuilder from "../components/aurora/builder";
import { AuroraIcon } from "../components/aurora/icons";

export default function Builder() {
  if (useTemplate().template === "aurora") return <AuroraBuilder />;
  return <ClassicBuilder />;
}

const kindColor = (k: BuilderKind, C: ReturnType<typeof useTheme>["palette"]) =>
  k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet;

// Classic builder is English-only (no i18n); map the category to a header label.
const CAT_LABEL: Record<string, string> = { squat: "Squat", hinge: "Hinge", push: "Push", pull: "Pull", cond: "Conditioning", other: "Other" };

/** Builder — assemble a reusable routine (WorkoutTemplate) and save it; load one
 *  to edit, or delete. Reuses the shared routine-builder hook + /api/templates. */
function ClassicBuilder() {
  const C = useTheme().palette;
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

  const fieldStyle = { fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 } as const;

  return (
    <Screen>
      <Kicker>Builder</Kicker>
      <Mono style={{ marginTop: 6, marginBottom: 14, lineHeight: 18 }}>Assemble a reusable routine — save it, then start it from Train.</Mono>

      <TextInput
        value={b.name}
        onChangeText={b.setName}
        placeholder="Routine name"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 }}
      />

      {b.items.map((x) => (
        <ItemCard key={x.uid} item={x} C={C} onRemove={() => b.removeItem(x.uid)} onPatch={(p) => b.patchItem(x.uid, p)} onBump={(d) => b.bumpSets(x.uid, d)} fieldStyle={fieldStyle} />
      ))}

      <Pressable onPress={() => setPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 4, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13 }}>
        <AuroraIcon name="add" size={18} color={txt(C, C.lime)} />
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>Add exercise</Text>
        <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>▾</Text>
      </Pressable>

      {/* Searchable exercise picker — grouped by muscle/pattern, like the sport picker. */}
      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => { setPicker(false); setQuery(""); }}>
        <Pressable onPress={() => { setPicker(false); setQuery(""); }} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ flex: 1, marginTop: 64, backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, paddingTop: 20, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>Pick an exercise</Text>
              <Pressable onPress={() => { setPicker(false); setQuery(""); }} hitSlop={10}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>Close</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14 }}>
              <AuroraIcon name="search" size={18} color={C.ash} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search or type a custom name"
                placeholderTextColor={C.ash}
                autoFocus
                onSubmitEditing={() => query.trim() && add(query)}
                style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 12 }}
              />
            </View>
            <ScrollView style={{ flex: 1, marginTop: 6 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, paddingBottom: 28 }}>
              {exercisesByCategory(MOVEMENTS)
                .map((g) => ({ ...g, names: g.names.filter((n) => !q || n.toLowerCase().includes(q)) }))
                .filter((g) => g.names.length > 0)
                .map((g) => (
                  <View key={g.category}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1.4, marginTop: 14, marginBottom: 4 }}>{CAT_LABEL[g.category]}</Text>
                    {g.names.map((n) => {
                      const c = kindColor(inferBlockKind(n) as BuilderKind, C);
                      return (
                        <Pressable key={n} onPress={() => add(n, inferBlockKind(n) as BuilderKind)} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}>
                          <View style={{ width: 22, alignItems: "center" }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} /></View>
                          <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{n}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              {olympicSportsByCategory()
                .map((g) => ({ category: g.category, sports: g.sports.filter((s) => !q || s.name.toLowerCase().includes(q)) }))
                .filter((g) => g.sports.length > 0)
                .map((g) => (
                  <View key={g.category}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1.4, marginTop: 14, marginBottom: 4 }}>{g.category}</Text>
                    {g.sports.map((s) => (
                      <Pressable key={s.name} onPress={() => add(s.name, "cardio")} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: fs.subtitle, width: 22, textAlign: "center" }}>{s.icon}</Text>
                        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{s.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              {q.length > 0 && !exact && (
                <Pressable onPress={() => add(query)} style={{ marginTop: 16, borderRadius: 10, backgroundColor: C.lime, paddingVertical: 13, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.ink }}>+ “{query.trim()}”</Text>
                </Pressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {b.msg && <Mono color={b.msg.ok ? C.lime : C.amber} style={{ marginTop: 14 }}>{b.msg.text}</Mono>}

      <View style={{ marginTop: 16 }}>
        <Button label={b.saving ? "Saving…" : "Save routine →"} color={C.lime} onPress={b.save} disabled={b.saving || b.items.length === 0} />
      </View>

      {b.routines.length > 0 && (
        <Card style={{ marginTop: 20, borderLeftWidth: 3, borderLeftColor: C.violet }}>
          <Kicker color={C.violet}>Your routines</Kicker>
          {b.routines.map((r, i) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: i ? 12 : 10, paddingTop: i ? 12 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Pressable style={{ flex: 1 }} onPress={() => b.loadRoutine(r)}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{r.name}</Text>
                <Mono style={{ fontSize: fs.micro, marginTop: 2 }}>{r.blocks.length} blocks · tap to edit</Mono>
              </Pressable>
              <Pressable onPress={() => b.remove(r.id)} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}
      <View style={{ height: 24 }} />
    </Screen>
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
    <Card style={{ borderLeftWidth: 3, borderLeftColor: c }}>
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
              <Pressable onPress={() => onBump(-1)} style={{ width: 32, height: 36, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ash, fontSize: fs.subtitle }}>−</Text></Pressable>
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, minWidth: 18, textAlign: "center" }}>{x.sets}</Text>
              <Pressable onPress={() => onBump(1)} style={{ width: 32, height: 36, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: txt(C, C.lime), fontSize: fs.subtitle }}>+</Text></Pressable>
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
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>{sportDistanceUnit(x.name) === "m" ? "M" : "KM"}</Text>
            <TextInput value={x.distance} onChangeText={(v) => onPatch({ distance: v })} keyboardType="numeric" placeholder={sportDistanceUnit(x.name) === "m" ? "400" : "5"} placeholderTextColor={C.ash} style={fieldStyle} />
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
    </Card>
  );
}
