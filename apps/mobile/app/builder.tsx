import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { MOVEMENTS, inferBlockKind } from "@hybrid/core";
import { useRoutineBuilder, type BuilderKind, type BuilderItem } from "../lib/use-routine-builder";
import { Screen, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraBuilder from "../components/aurora/builder";

export default function Builder() {
  if (useTemplate().template === "aurora") return <AuroraBuilder />;
  return <ClassicBuilder />;
}

const kindColor = (k: BuilderKind, C: ReturnType<typeof useTheme>["palette"]) =>
  k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet;

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

  const fieldStyle = { fontFamily: F.mono, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 } as const;

  return (
    <Screen>
      <Kicker>Builder</Kicker>
      <Mono style={{ marginTop: 6, marginBottom: 14, lineHeight: 18 }}>Assemble a reusable routine — save it, then start it from Train.</Mono>

      <TextInput
        value={b.name}
        onChangeText={b.setName}
        placeholder="Routine name"
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 }}
      />

      {b.items.map((x) => (
        <ItemCard key={x.uid} item={x} C={C} onRemove={() => b.removeItem(x.uid)} onPatch={(p) => b.patchItem(x.uid, p)} onBump={(d) => b.bumpSets(x.uid, d)} fieldStyle={fieldStyle} />
      ))}

      {picker ? (
        <Card>
          <Kicker color={C.lime}>Pick an exercise</Kicker>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search or type a custom name"
            placeholderTextColor={C.ash}
            autoFocus
            onSubmitEditing={() => query.trim() && add(query)}
            style={[fieldStyle, { marginTop: 10, fontSize: 15, paddingVertical: 11 }]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {matches.map((n) => {
              const c = kindColor(inferBlockKind(n) as BuilderKind, C);
              return (
                <Pressable key={n} onPress={() => add(n, inferBlockKind(n) as BuilderKind)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: `${c}55`, backgroundColor: `${c}1f` }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 13, color: txt(C, c) }}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
          {q.length > 0 && !exact && (
            <Pressable onPress={() => add(query)} style={{ marginTop: 14, borderRadius: 10, backgroundColor: C.lime, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 14, color: C.ink }}>+ “{query.trim()}”</Text>
            </Pressable>
          )}
          <Pressable onPress={() => { setPicker(false); setQuery(""); }} style={{ paddingTop: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, textAlign: "center" }}>Close</Text>
          </Pressable>
        </Card>
      ) : (
        <Pressable onPress={() => setPicker(true)} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 }}>
          <Text style={{ fontFamily: F.black, fontSize: 15, color: txt(C, C.lime) }}>+ Add exercise</Text>
        </Pressable>
      )}

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
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{r.name}</Text>
                <Mono style={{ fontSize: 11, marginTop: 2 }}>{r.blocks.length} blocks · tap to edit</Mono>
              </Pressable>
              <Pressable onPress={() => b.remove(r.id)} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>✕</Text>
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, c) }}>{x.kind.toUpperCase()}</Text>
        <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.chalk }} numberOfLines={1}>{x.name}</Text>
        <Pressable onPress={onRemove} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 15, color: C.ash }}>✕</Text></Pressable>
      </View>
      {x.kind === "strength" ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12, alignItems: "flex-end" }}>
          <View>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>SETS</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable onPress={() => onBump(-1)} style={{ width: 32, height: 36, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ash, fontSize: 16 }}>−</Text></Pressable>
              <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk, minWidth: 18, textAlign: "center" }}>{x.sets}</Text>
              <Pressable onPress={() => onBump(1)} style={{ width: 32, height: 36, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: txt(C, C.lime), fontSize: 16 }}>+</Text></Pressable>
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
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
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
    </Card>
  );
}
