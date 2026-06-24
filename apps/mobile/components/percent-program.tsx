import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { planProgramView, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import { useTheme } from "../lib/theme";
import { fs, space, F } from "../lib/ui";

/**
 * Discipline-shaped program — renders ANY PlanProgram (Olympic-weightlifting %
 * blocks, endurance pace plans, …) through the shared planProgramView, so every
 * plan comes out in ONE consistent layout: a week selector, the discipline's
 * volume label, AM/PM or weekday cards, the prescription KEPT as written, and a
 * "fill in your numbers" panel (strength maxes → kg, or goal paces). Renders the
 * SAME content as the web. The caller supplies the screen wrapper (classic
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
  const [vals, setVals] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const maxes: Record<string, number> = {};
  for (const i of program.inputs) {
    if (i.kind !== "number") continue;
    const n = parseFloat(vals[i.key] ?? "");
    if (Number.isFinite(n) && n > 0) maxes[i.key] = n;
  }
  const view = planProgramView(program, { week, maxes });

  const enroll = async () => {
    setState("busy");
    setState((await enrollPlan(goal.name, plan.id)) ? "done" : "error");
  };

  const card = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, marginBottom: 12 } as const;

  return (
    <View>
      <Pressable onPress={back} style={{ marginBottom: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>← {goal.name}</Text>
      </Pressable>
      <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, marginVertical: 6 }}>{plan.name}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginBottom: 14 }}>
        {plan.weeks} wk{plan.weeks === 1 ? "" : "s"} · {plan.sessions}×/wk · {plan.tag}{view.peakNote ? ` · ${view.peakNote.toLowerCase()}` : ""}
      </Text>

      {/* Inputs — strength maxes (→ kg) or goal paces. Optional; the plan reads the same either way. */}
      <View style={card}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: C.lime }}>{view.inputsTitle}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
          {view.inputs.map((inp) => (
            <View key={inp.key} style={{ gap: 4 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{inp.label}</Text>
              <TextInput
                keyboardType={inp.kind === "number" ? "numeric" : "default"}
                placeholder={inp.placeholder ?? ""}
                placeholderTextColor={C.ash}
                value={vals[inp.key] ?? ""}
                onChangeText={(v) => setVals((m) => ({ ...m, [inp.key]: v }))}
                style={{ fontFamily: F.mono, width: inp.kind === "number" ? 72 : 104, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 }}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Week selector (hidden for a single-week plan) + week volume. */}
      {(view.weeks.length > 1 || !!view.weekVolume) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginBottom: 12 }}>
          {view.weeks.length > 1 &&
            view.weeks.map((w) => (
              <Pressable key={w} onPress={() => setWeek(w)}>
                <View style={{ backgroundColor: w === view.week ? C.lime : C.ink2, borderWidth: 1, borderColor: w === view.week ? C.lime : C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: w === view.week ? C.ink : C.chalk }}>Wk {w}</Text>
                </View>
              </Pressable>
            ))}
          {!!view.weekVolume && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginLeft: "auto" }}>{view.weekVolume}</Text>}
        </View>
      )}

      {view.days.map((day, di) => (
        <View key={di} style={{ ...card, padding: 0 }}>
          {/* Day header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: C.amber }}>
              {day.title}{day.kindLabel ? ` — ${day.kindLabel}` : ""}
            </Text>
            {!!day.volume && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{day.volume}</Text>}
          </View>

          {day.sessions.map((s, si) => {
            // Mixed sessions (run + gym) get 4-col headers so gym rows align;
            // prose/strength rows within that session render a spanning prescription.
            const hasStructured = s.lifts.some((l) => l.rpe != null);
            return (
              <View key={si}>
                {/* Session sub-label (AM / PM) */}
                {(!!s.label || !!s.volume) && (
                  <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, color: C.lime }}>{[s.label, s.volume].filter(Boolean).join(" · ")}</Text>
                  </View>
                )}

                {/* Column headers */}
                <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1 }}>Exercise</Text>
                  {hasStructured ? (
                    <>
                      <Text style={{ width: 52, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>Sets</Text>
                      <Text style={{ width: 56, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>Wt</Text>
                      <Text style={{ width: 38, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>RPE</Text>
                    </>
                  ) : (
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>Prescription</Text>
                  )}
                </View>

                {/* Rows */}
                {s.lifts.map((l, li) => (
                  <View key={li} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: li > 0 ? 1 : 0, borderTopColor: C.line }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{l.name}</Text>
                      {!!l.note && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{l.note}</Text>}
                    </View>
                    {l.rpe != null ? (
                      // Structured gym row — 3 fixed-width right cells
                      <>
                        <Text style={{ width: 52, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, textAlign: "right" }}>{l.setsReps ?? "—"}</Text>
                        <Text style={{ width: 56, fontFamily: F.mono, fontSize: fs.body, color: C.ash, textAlign: "right" }}>{l.weight ?? "—"}</Text>
                        <View style={{ width: 38, alignItems: "flex-end" }}>
                          <MobileRpeBadge rpe={l.rpe} C={C} />
                        </View>
                      </>
                    ) : (
                      // Prose/strength row — prescription fills the right side,
                      // matching the total width of the 3 gym columns when mixed.
                      <Text style={{ width: hasStructured ? 146 : undefined, fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, textAlign: "right", flexShrink: 1 }}>{l.prescription}</Text>
                    )}
                  </View>
                ))}
              </View>
            );
          })}
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

function MobileRpeBadge({ rpe, C }: { rpe: number; C: ReturnType<typeof useTheme>["palette"] }) {
  const color  = rpe >= 10 ? "#e8a838" : rpe >= 9 ? "#7bb8ec" : C.ash;
  const border = rpe >= 10 ? "rgba(232,168,56,.35)" : rpe >= 9 ? "rgba(94,160,224,.3)" : "rgba(80,80,80,.25)";
  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, alignItems: "center" }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, fontWeight: "bold" as const, color }}>@{rpe}</Text>
    </View>
  );
}
