import { useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import { planProgramView, rpeColor, workoutColor, sessionColor, isProseLift, liftKind, dayContentSummary, type GoalNode, type GoalPlan, type PlanProgram, type ProgramDayView, type ProgramLiftView, type ProgramSessionView, type ProgramStepView, type LoadColor, type LiftKind } from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import { useLang } from "../lib/i18n";
import { usePlanMaxes, setPlanMax } from "../lib/plan-maxes";
import { useTheme, txt } from "../lib/theme";
import { fs, space, F } from "../lib/ui";
import { MetaLine } from "./aurora/meta";

type Palette = ReturnType<typeof useTheme>["palette"];
const loadHex = (C: Palette, c: LoadColor): string => ({ blue: C.blue, lime: C.lime, amber: C.amber, red: C.red, ash: C.ash })[c];
const tint = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
const HAIR = "rgba(255,255,255,0.05)";
// content classification (isProseLift / liftKind) is shared from @hybrid/core.
const isProse = isProseLift;
const liftColor = (l: ProgramLiftView): LoadColor =>
  l.rpe != null ? rpeColor(l.rpe) : l.steps && l.steps.length ? "lime" : l.intensity ?? workoutColor(l.name);

type Group = { kind: LiftKind; lifts: ProgramLiftView[] };
function groupByKind(lifts: ProgramLiftView[]): Group[] {
  const groups: Group[] = [];
  for (const l of lifts) {
    const kind = liftKind(l);
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.lifts.push(l);
    else groups.push({ kind, lifts: [l] });
  }
  return groups;
}
// Block label for a content group (% barbell = "Main"; rpe = "Accessories" when
// barbell is present, else "Strength"). Returns the palette colour too.
function bandFor(kind: LiftKind, n: number, hasPercent: boolean, C: Palette): { label: string; color: string } {
  const ex = `${n} exercise${n === 1 ? "" : "s"}`;
  if (kind === "run") return { label: "Run", color: C.blue };
  if (kind === "percent") return { label: `Main (${ex})`, color: C.amber };
  return { label: `${hasPercent ? "Accessories" : "Strength"} (${ex})`, color: C.lime };
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
  const { t } = useLang();
  const [week, setWeek] = useState(1);
  // Maxes persist on-device (shared with Today) — seed each input from the store;
  // `vals` holds only the transient text being typed.
  const storedMaxes = usePlanMaxes();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const inputValue = (key: string) => vals[key] ?? (storedMaxes[key] != null ? String(storedMaxes[key]) : "");
  const onMaxChange = (key: string, text: string) => {
    setVals((m) => ({ ...m, [key]: text }));
    const n = parseFloat(text);
    setPlanMax(key, Number.isFinite(n) && n > 0 ? n : null);
  };
  const maxes: Record<string, number> = {};
  for (const i of program.inputs) {
    if (i.kind !== "number") continue;
    const n = parseFloat(inputValue(i.key));
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
      <View style={{ marginBottom: 14 }}>
        <MetaLine
          parts={[plan.weeks === 1 ? t("plans.week1") : `${plan.weeks} ${t("plans.weeks")}`, `${plan.sessions}${t("plans.perWk")}`, plan.tag, view.peakNote ? view.peakNote.toLowerCase() : ""]}
          textStyle={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}
        />
      </View>

      {/* Inputs — strength maxes (→ kg) or goal paces. Optional; the plan reads the same either way. */}
      <View style={card}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: txt(C, C.lime) }}>{view.inputsTitle}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
          {view.inputs.map((inp) => (
            <View key={inp.key} style={{ gap: 4 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{inp.label}</Text>
              <TextInput
                keyboardType={inp.kind === "number" ? "numeric" : "default"}
                placeholder={inp.placeholder ?? ""}
                placeholderTextColor={C.ash}
                value={inputValue(inp.key)}
                onChangeText={(v) => (inp.kind === "number" ? onMaxChange(inp.key, v) : setVals((m) => ({ ...m, [inp.key]: v })))}
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
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: w === view.week ? C.onAccent : C.chalk }}>{t("plans.wkShort")} {w}</Text>
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
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: state === "done" ? C.lime : C.onAccent }}>
          {state === "busy" ? "Enrolling…" : state === "done" ? "✓ Enrolled" : `Enroll in ${plan.name}`}
        </Text>
      </Pressable>
      {state === "error" && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 8 }}>Couldn&apos;t enroll — check your connection.</Text>}
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
      {days.map((day, di) => (
        <View key={di} style={card}>
          <DayHeader title={day.title + (day.kindLabel ? ` — ${day.kindLabel}` : "")} right={dayContentSummary(day)} C={C} />
          {day.sessions.map((s, si) => (
            <SessionBlock key={si} s={s} si={si} count={day.sessions.length} C={C} />
          ))}
        </View>
      ))}
    </>
  );
}

function DayHeader({ title, right, C }: { title: string; right: string | null; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: HAIR }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: txt(C, C.amber) }}>{title}</Text>
      {!!right && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{right}</Text>}
    </View>
  );
}

function Band({ label, color, topBorder, C }: { label: string; color: string; topBorder: boolean; C: Palette }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: HAIR, borderTopWidth: topBorder ? 1 : 0, borderTopColor: HAIR, backgroundColor: tint(color, 0.04) }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, color) }}>{label}</Text>
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

function SessionBlock({ s, si, count, C }: { s: ProgramSessionView; si: number; count: number; C: Palette }) {
  const groups = groupByKind(s.lifts);
  const mixed = groups.length > 1;
  const hasPercent = groups.some((g) => g.kind === "percent");
  // A multi-session day gets one marker per session: the plan's time-of-day
  // (AM/MID/PM) when set, else a plain "Training N" from the ordinal — so an
  // untimed two/three-a-day is distinguished, not silently merged.
  const marker = s.label ?? (count > 1 ? `Training ${si + 1}` : null);
  return (
    <View>
      {!!marker && <Band label={s.volume ? `${marker} (${s.volume})` : marker} color={loadHex(C, sessionColor(s.label, si))} topBorder={si > 0} C={C} />}
      {groups.map((g, gi) => {
        const topBorder = gi > 0 || !!marker || si > 0;
        const band = bandFor(g.kind, g.lifts.length, hasPercent, C);
        return (
          <View key={gi}>
            {mixed && <Band label={band.label} color={band.color} topBorder={topBorder} C={C} />}
            {g.kind === "percent" ? (
              <PercentMatrix lifts={g.lifts} C={C} />
            ) : g.kind === "run" ? (
              g.lifts.map((l, i) => <ProseRow key={i} lift={l} top={i > 0} C={C} />)
            ) : (
              <>
                {g.lifts.some((l) => l.rpe != null) && <ColHeader C={C} />}
                {g.lifts.map((l, i) =>
                  l.rpe != null ? <HeatRow key={i} lift={l} top={i > 0} C={C} /> : <FallbackRow key={i} lift={l} top={i > 0} C={C} />,
                )}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

// a prose workout line (a run / cross-train) inside a day card
function ProseRow({ lift, top, C }: { lift: ProgramLiftView; top: boolean; C: Palette }) {
  const rest = /rest/i.test(lift.name);
  const detail = lift.prescription && lift.note ? `${lift.prescription} (${lift.note})` : lift.prescription || lift.note || null;
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
  const detail = lift ? (lift.prescription && lift.note ? `${lift.prescription} (${lift.note})` : lift.prescription || lift.note || null) : null;
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

// Olympic / % work — the Percentage Matrix: loads are fixed columns (ordered by
// %, bodyweight last); reps drop into the matching cell. Horizontal-scrolls when
// there are many distinct loads.
const MX_NAME = 132;
const MX_COL = 64;
function PercentMatrix({ lifts, C }: { lifts: ProgramLiftView[]; C: Palette }) {
  const colMap = new Map<string, ProgramStepView>();
  for (const l of lifts) for (const st of l.steps ?? []) if (!colMap.has(st.load)) colMap.set(st.load, st);
  const cols = [...colMap.values()].sort((a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: HAIR }}>
          <Text style={{ width: MX_NAME, fontFamily: F.mono, fontSize: fs.nano, color: "#5a5e56", textTransform: "uppercase", letterSpacing: 1 }}>Exercise</Text>
          {cols.map((c) => (
            <Text key={c.load} style={{ width: MX_COL, fontFamily: F.mono, fontSize: 10, fontWeight: "700", textAlign: "center", color: txt(C, loadHex(C, c.color)) }}>{c.load}</Text>
          ))}
        </View>
        {lifts.map((l, i) => {
          const byLoad = new Map((l.steps ?? []).map((st) => [st.load, st]));
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: HAIR }}>
              <View style={{ width: MX_NAME, paddingRight: 8 }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{l.name}</Text>
                {!!l.note && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{l.note}</Text>}
              </View>
              {cols.map((c) => {
                const st = byLoad.get(c.load);
                return (
                  <Text key={c.load} style={{ width: MX_COL, fontFamily: F.mono, fontSize: fs.caption, textAlign: "center", color: st ? txt(C, loadHex(C, c.color)) : "#34372f" }}>
                    {st ? st.detail : "·"}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// bodybuilding — Sets×Reps + RPE heat bar
function HeatRow({ lift, top, C }: { lift: ProgramLiftView; top: boolean; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ width: 70, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, textAlign: "right", marginRight: 10 }}>{lift.setsReps ?? "—"}</Text>
      <Text style={{ width: 54, textAlign: "right", fontFamily: F.mono, fontSize: fs.body, color: txt(C, loadHex(C, rpeColor(lift.rpe!))) }}>@{lift.rpe}</Text>
    </View>
  );
}

// prose fallback (mixed/odd entries inside a day card). For conditioning the
// prescription carries the effort-tier colour (the circuit's load-wave), mirroring
// the web FallbackRow; otherwise it stays chalk.
function FallbackRow({ lift, top, C }: { lift: ProgramLiftView; top: boolean; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: fs.caption, fontWeight: lift.intensity ? "600" : "400", color: lift.intensity ? txt(C, loadHex(C, lift.intensity)) : C.chalk, textAlign: "right", lineHeight: 18 }}>{lift.prescription}</Text>
    </View>
  );
}
