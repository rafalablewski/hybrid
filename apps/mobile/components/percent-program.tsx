import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { planProgramView, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import { useTheme } from "../lib/theme";
import { fs, space, F } from "../lib/ui";

/**
 * Discipline-shaped (% of 1RM) program — the Olympic-weightlifting shape: a week
 * selector, NL (number-of-lifts) volume, AM/PM days, complexes, tempo, and the
 * percentage prescription KEPT as written (the working kg appears next to it once
 * you enter your maxes). Reads the shared planProgramView from core, so it renders
 * the SAME content as the web. The caller supplies the screen wrapper (classic
 * <Screen> or Aurora <AuroraScreen>) so both templates reuse this one component.
 */
export default function PercentProgram({
  goal,
  plan,
  program,
  back,
}: {
  goal: GoalNode;
  plan: GoalPlan;
  program: PlanProgram;
  back: () => void;
}) {
  const C = useTheme().palette;
  const [week, setWeek] = useState(1);
  const [maxes, setMaxes] = useState<Record<string, number>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const view = planProgramView(program, { week, maxes });

  const enroll = async () => {
    setState("busy");
    setState((await enrollPlan(goal.name, plan.id)) ? "done" : "error");
  };
  const setMax = (key: string, raw: string) =>
    setMaxes((m) => {
      const n = parseFloat(raw);
      const next = { ...m };
      if (Number.isFinite(n) && n > 0) next[key] = n;
      else delete next[key];
      return next;
    });

  const card = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, marginBottom: 12 } as const;

  return (
    <View>
      <Pressable onPress={back} style={{ marginBottom: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>← {goal.name}</Text>
      </Pressable>
      <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, marginVertical: 6 }}>{plan.name}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginBottom: 14 }}>
        {plan.weeks} wks · {plan.sessions}×/wk · {plan.tag}{view.anchored ? " · peaks to competition" : ""}
      </Text>

      {/* Maxes — optional; the % stays either way, kg appears when filled. */}
      <View style={card}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: C.lime }}>Your maxes (kg) — optional</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
          {view.refLifts.map((rl) => (
            <View key={rl.key} style={{ gap: 4 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{rl.label}</Text>
              <TextInput
                keyboardType="numeric"
                value={maxes[rl.key] ? String(maxes[rl.key]) : ""}
                onChangeText={(v) => setMax(rl.key, v)}
                style={{ fontFamily: F.mono, width: 72, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 }}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Week selector + week volume. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginBottom: 12 }}>
        {view.weeks.map((w) => (
          <Pressable key={w} onPress={() => setWeek(w)}>
            <View style={{ backgroundColor: w === view.week ? C.lime : C.ink2, borderWidth: 1, borderColor: w === view.week ? C.lime : C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: w === view.week ? C.ink : C.chalk }}>Wk {w}</Text>
            </View>
          </Pressable>
        ))}
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginLeft: "auto" }}>{view.weekNL} lifts</Text>
      </View>

      {view.days.map((day, di) => (
        <View key={di} style={card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: C.amber }}>
              {day.title}{day.kindLabel ? ` — ${day.kindLabel}` : ""}
            </Text>
            {day.nl > 0 && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{day.nl} lifts</Text>}
          </View>
          {day.sessions.map((s, si) => (
            <View key={si} style={{ marginTop: 10 }}>
              {!!s.label && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, color: C.lime }}>{s.label} · {s.nl} lifts</Text>}
              {s.lifts.map((l, li) => (
                <View key={li} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingVertical: 8, borderTopWidth: li || s.label ? 1 : 0, borderTopColor: C.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{l.name}</Text>
                    {!!l.note && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{l.note}</Text>}
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, textAlign: "right" }}>{l.prescription}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}

      <View style={card}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>How it progresses</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 20 }}>{view.progression}</Text>
      </View>

      <Pressable onPress={enroll} disabled={state === "busy" || state === "done"} style={{ marginTop: 6, backgroundColor: state === "done" ? C.ink2 : C.lime, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 13, alignItems: "center" }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: state === "done" ? C.lime : C.ink }}>
          {state === "busy" ? "Enrolling…" : state === "done" ? "✓ Enrolled" : `Enroll in ${plan.name}`}
        </Text>
      </Pressable>
      {state === "error" && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.amber, marginTop: 8 }}>Couldn&apos;t enroll — check your connection.</Text>}
    </View>
  );
}
