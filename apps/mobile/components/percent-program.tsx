import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { planProgramView, rpeColor, workoutColor, type GoalNode, type GoalPlan, type PlanProgram, type ProgramDayView, type ProgramLiftView, type ProgramSessionView, type LoadColor } from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import { useTheme } from "../lib/theme";
import { fs, space, F } from "../lib/ui";

type Palette = ReturnType<typeof useTheme>["palette"];
const loadHex = (C: Palette, c: LoadColor): string => ({ blue: C.blue, lime: C.lime, amber: C.amber, red: C.red, ash: C.ash })[c];
const tint = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
const HAIR = "rgba(255,255,255,0.05)";
// A lift is "gym" if it carries structured loading (a %-ramp, sets×reps, RPE);
// otherwise it's a prose workout (a run / cross-train).
const isGym = (l: ProgramLiftView) => !!(l.steps && l.steps.length) || l.rpe != null || l.setsReps != null;
const isProse = (l: ProgramLiftView) => !isGym(l);
const liftColor = (l: ProgramLiftView): LoadColor =>
  l.rpe != null ? rpeColor(l.rpe) : l.steps && l.steps.length ? "lime" : workoutColor(l.name);

type Group = { kind: "run" | "lift"; lifts: ProgramLiftView[] };
function groupByKind(lifts: ProgramLiftView[]): Group[] {
  const groups: Group[] = [];
  for (const l of lifts) {
    const kind = isProse(l) ? "run" : "lift";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.lifts.push(l);
    else groups.push({ kind, lifts: [l] });
  }
  return groups;
}

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

      <ProgramDays days={view.days} week={view.week} peakNote={view.peakNote} C={C} />

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

// The HYBRID plan day view (mobile) — mirrors web `program-days.tsx` 1:1 off the
// SAME shared planProgramView. Layout is chosen from CONTENT: an all-prose week
// (pure running) → ONE week card of Day rows; anything with gym work → one card
// per day, and a hybrid day splits into a RUN block (prose) + a STRENGTH block
// (the Sets×Reps/RPE or %-ramp table).
function ProgramDays({ days, week, peakNote, C }: { days: ProgramDayView[]; week: number; peakNote: string | null; C: Palette }) {
  const card = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: "hidden" as const, marginBottom: 12 };
  const allProse = days.length > 0 && days.every((d) => d.sessions.every((s) => s.lifts.every(isProse)));

  if (allProse) {
    return (
      <View style={card}>
        <DayHeader title={`Week ${week}`} right={peakNote ? peakNote.toLowerCase() : null} C={C} />
        {days.map((day, di) => {
          const lifts = day.sessions.flatMap((s) => s.lifts);
          return (
            <View key={di} style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: di > 0 ? 1 : 0, borderTopColor: HAIR }}>
              <Text style={{ width: 42, fontFamily: F.mono, fontSize: fs.caption, color: "#5a5e56", textTransform: "uppercase" }}>{day.title}</Text>
              <View style={{ flex: 1 }}>
                {lifts.length === 0 ? (
                  <WeekRow restName={day.kindLabel ?? "—"} first C={C} />
                ) : (
                  lifts.map((l, i) => <WeekRow key={i} lift={l} first={i === 0} C={C} />)
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <>
      {days.map((day, di) => {
        const all = day.sessions.flatMap((s) => s.lifts);
        const mixed = all.some(isProse) && all.some(isGym);
        return (
          <View key={di} style={card}>
            <DayHeader title={day.title + (day.kindLabel ? ` — ${day.kindLabel}` : "")} right={day.volume} C={C} />
            {day.sessions.map((s, si) => (
              <SessionBlock key={si} s={s} si={si} mixed={mixed} C={C} />
            ))}
          </View>
        );
      })}
    </>
  );
}

function DayHeader({ title, right, C }: { title: string; right: string | null; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: HAIR }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: C.amber }}>{title}</Text>
      {!!right && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{right}</Text>}
    </View>
  );
}

function Band({ label, color, topBorder, C }: { label: string; color: string; topBorder: boolean; C: Palette }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: HAIR, borderTopWidth: topBorder ? 1 : 0, borderTopColor: HAIR, backgroundColor: tint(color, 0.04) }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color }}>{label}</Text>
    </View>
  );
}

function ColHeader({ C }: { C: Palette }) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: HAIR }}>
      <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, color: "#5a5e56", textTransform: "uppercase", letterSpacing: 1 }}>Exercise</Text>
      <Text style={{ width: 70, fontFamily: F.mono, fontSize: fs.nano, color: "#5a5e56", textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>Sets×Reps</Text>
      <Text style={{ width: 54, fontFamily: F.mono, fontSize: fs.nano, color: "#5a5e56", textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>RPE</Text>
    </View>
  );
}

function SessionBlock({ s, si, mixed, C }: { s: ProgramSessionView; si: number; mixed: boolean; C: Palette }) {
  const groups = groupByKind(s.lifts);
  return (
    <View>
      {!!s.label && <Band label={[s.label, s.volume].filter(Boolean).join(" · ")} color={s.label === "PM" ? C.blue : C.lime} topBorder={si > 0} C={C} />}
      {groups.map((g, gi) => {
        const topBorder = gi > 0 || !!s.label || si > 0;
        if (g.kind === "run")
          return (
            <View key={gi}>
              {mixed && <Band label="Run" color={C.blue} topBorder={topBorder} C={C} />}
              {g.lifts.map((l, i) => (
                <ProseRow key={i} lift={l} top={i > 0} C={C} />
              ))}
            </View>
          );
        const hasRpe = g.lifts.some((l) => l.rpe != null);
        return (
          <View key={gi}>
            {mixed && <Band label={`Strength · ${g.lifts.length} exercise${g.lifts.length === 1 ? "" : "s"}`} color={C.lime} topBorder={topBorder} C={C} />}
            {hasRpe && <ColHeader C={C} />}
            {g.lifts.map((l, i) => {
              const top = i > 0;
              if (l.rpe != null) return <HeatRow key={i} lift={l} top={top} C={C} />;
              if (l.steps && l.steps.length) return <RampRow key={i} lift={l} top={top} C={C} />;
              return <FallbackRow key={i} lift={l} top={top} C={C} />;
            })}
          </View>
        );
      })}
    </View>
  );
}

// a prose workout line (a run / cross-train) inside a day card
function ProseRow({ lift, top, C }: { lift: ProgramLiftView; top: boolean; C: Palette }) {
  const rest = /rest/i.test(lift.name);
  const detail = [lift.prescription, lift.note].filter(Boolean).join(" · ") || null;
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, marginRight: 7, backgroundColor: loadHex(C, liftColor(lift)) }} />
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: rest ? C.ash : C.chalk }}>{lift.name}</Text>
      </View>
      {!!detail && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3, lineHeight: 17, marginLeft: 14 }}>{detail}</Text>}
    </View>
  );
}

// One line in the endurance week card — a uniform dotted row (dot + name +
// prose detail below) for EVERY item, run or accessory, so the week card stays
// visually consistent. The detail carries the item's full prescription.
function WeekRow({ lift, restName, first, C }: { lift?: ProgramLiftView; restName?: string; first: boolean; C: Palette }) {
  const name = lift?.name ?? restName ?? "—";
  const rest = lift ? /rest/i.test(lift.name) : true;
  const detail = lift ? [lift.prescription, lift.note].filter(Boolean).join(" · ") || null : null;
  return (
    <View style={{ marginTop: first ? 0 : 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, marginRight: 7, backgroundColor: loadHex(C, lift ? liftColor(lift) : "ash") }} />
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: rest ? C.ash : C.chalk }}>{name}</Text>
      </View>
      {!!detail && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3, lineHeight: 17, marginLeft: 14 }}>{detail}</Text>}
    </View>
  );
}

function NameCell({ lift, C }: { lift: ProgramLiftView; C: Palette }) {
  return (
    <View style={{ flex: 1, marginRight: 8 }}>
      <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{lift.name}</Text>
      {!!lift.note && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{lift.note}</Text>}
    </View>
  );
}

// RPE "heat" meter — value + intensity bar. Shared by the bodybuilding row and
// a strength accessory inside the endurance week card.
function HeatMeter({ rpe, C }: { rpe: number; C: Palette }) {
  const col = loadHex(C, rpeColor(rpe));
  return (
    <View style={{ width: 54, alignItems: "flex-end" }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: col }}>@{rpe}</Text>
      <View style={{ width: 44, height: 3, borderRadius: 2, marginTop: 5, backgroundColor: HAIR, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.min(100, rpe * 10)}%`, borderRadius: 2, backgroundColor: col }} />
      </View>
    </View>
  );
}

// Coloured %-ramp text (nested <Text> runs). Shared by the weightlifting row and
// a %-based accessory in the week card.
function RampText({ lift, C }: { lift: ProgramLiftView; C: Palette }) {
  return (
    <>
      {lift.steps!.map((st, i) => (
        <Text key={i}>
          {i > 0 ? <Text style={{ color: "#5a5e56" }}> · </Text> : null}
          <Text style={{ color: loadHex(C, st.color), fontFamily: F.bold }}>{st.load}</Text>
          <Text style={{ color: C.ash }}>{st.detail}</Text>
          {st.kg ? <Text style={{ color: "#5a5e56" }}> · {st.kg}</Text> : null}
        </Text>
      ))}
    </>
  );
}

// bodybuilding — Sets×Reps + RPE heat bar
function HeatRow({ lift, top, C }: { lift: ProgramLiftView; top: boolean; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ width: 70, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, textAlign: "right", marginRight: 10 }}>{lift.setsReps ?? "—"}</Text>
      <HeatMeter rpe={lift.rpe!} C={C} />
    </View>
  );
}

// weightlifting — coloured %-ramp prescription
function RampRow({ lift, top, C }: { lift: ProgramLiftView; top: boolean; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right", lineHeight: 19 }}>
        <RampText lift={lift} C={C} />
      </Text>
    </View>
  );
}

// prose fallback (mixed/odd entries inside a day card)
function FallbackRow({ lift, top, C }: { lift: ProgramLiftView; top: boolean; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, textAlign: "right", lineHeight: 18 }}>{lift.prescription}</Text>
    </View>
  );
}
