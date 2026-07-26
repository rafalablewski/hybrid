import { useState, type ReactNode } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import {
  planProgramView,
  planCoverView,
  splitInputsTitle,
  inputEcho,
  rpeColor,
  workoutColor,
  sessionColor,
  isProseLift,
  liftKind,
  dayContentSummary,
  type GoalNode,
  type GoalPlan,
  type PlanProgram,
  type PlanWeekBar,
  type ProgramDayView,
  type ProgramLiftView,
  type ProgramSessionView,
  type ProgramStepView,
  type LoadColor,
  type LiftKind,
} from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import { useLang } from "../lib/i18n";
import { usePlanMaxes, setPlanMax } from "../lib/plan-maxes";
import { useTheme, txt } from "../lib/theme";
import { fs, F, serifIf } from "../lib/ui";
import { withAlpha } from "./aurora/kit";
import PlanCoverScreen, { PlanDockPill } from "./plan-hero";

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
 * blocks, endurance pace plans, …) through the shared planProgramView, in the
 * full-bleed cover redesign: PlanCoverScreen provides the collapsing cover, the
 * stats hem and the docked enroll pill; this component supplies the body — the
 * maxes LEDGER, the volume-WAVEFORM week rail (sticky under the collapsed bar),
 * and the programme day cards. Renders the SAME content as the web.
 */
export default function PercentProgram({
  goal,
  plan,
  program,
  back,
  alreadyEnrolled,
  onEnrolled,
  leaveSection,
}: {
  goal: GoalNode;
  plan: GoalPlan;
  program: PlanProgram;
  back: () => void;
  alreadyEnrolled?: boolean;
  onEnrolled?: () => void;
  leaveSection?: ReactNode;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const [week, setWeek] = useState(1);
  // Maxes persist on-device (shared with Today) — seed each input from the store;
  // `vals` holds only the transient text being typed.
  const storedMaxes = usePlanMaxes();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(alreadyEnrolled ? "done" : "idle");
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
  const cover = planCoverView(goal, plan, program);

  const enroll = async () => {
    setState("busy");
    const ok = await enrollPlan(goal.name, plan.id);
    setState(ok ? "done" : "error");
    if (ok) onEnrolled?.();
  };

  const multiWeek = view.weeks.length > 1;
  const inputsHead = splitInputsTitle(view.inputsTitle);

  return (
    <PlanCoverScreen
      goal={goal}
      plan={plan}
      program={program}
      back={back}
      top={
        <>
          {/* the LEDGER — maxes / paces as hairline rows, unit stated once */}
          <SecHead scheme={scheme} C={C} title={inputsHead.title} meta={inputsHead.meta} />
          <View style={{ borderTopWidth: 1, borderTopColor: C.line }}>
            {view.inputs.map((inp) => {
              const val = inputValue(inp.key);
              const n = parseFloat(val);
              const echo = inp.kind === "number" && Number.isFinite(n) && n > 0 ? inputEcho(program, inp.key, n) : null;
              return (
                <View key={inp.key} style={{ flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{inp.label}</Text>
                  {!!echo && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginLeft: "auto" }}>→ {echo}</Text>}
                  <TextInput
                    keyboardType={inp.kind === "number" ? "numeric" : "default"}
                    placeholder={inp.placeholder ?? "—"}
                    placeholderTextColor={withAlpha(C.ash, 0.6)}
                    accessibilityLabel={inp.label}
                    value={val}
                    onChangeText={(v) => (inp.kind === "number" ? onMaxChange(inp.key, v) : setVals((m) => ({ ...m, [inp.key]: v })))}
                    style={{ fontFamily: F.mono, minWidth: inp.kind === "number" ? 64 : 104, marginLeft: echo ? 0 : "auto", textAlign: "right", fontSize: fs.note, color: C.chalk, borderBottomWidth: 1.5, borderBottomColor: withAlpha(C.chalk, 0.25), paddingVertical: 2, fontVariant: ["tabular-nums"] }}
                  />
                </View>
              );
            })}
          </View>

          {/* schedule head — the week volume is the SectionHead's right meta */}
          {(multiWeek || !!view.weekVolume) && (
            <SecHead scheme={scheme} C={C} title="Schedule" meta={view.weekVolume ? `${view.weekVolume} ${t("w.train.plans.thisWeek")}` : view.peakNote ?? undefined} />
          )}
        </>
      }
      rail={multiWeek ? <WeekRail C={C} bars={cover.weekBars} weeks={view.weeks} week={view.week} setWeek={setWeek} wkLabel={t("w.train.plans.wkShort")} /> : undefined}
      dock={
        <PlanDockPill
          state={state}
          idleLabel={`${t("w.train.plans.enrollIn")} ${plan.name}`}
          busyLabel={t("w.train.plans.enrolling")}
          doneLabel={t("common.enrolled")}
          onPress={enroll}
        />
      }
    >
      <View style={{ marginTop: 14 }}>
        <ProgramDays days={view.days} week={view.week} peakNote={view.peakNote} C={C} scheme={scheme} />
      </View>

      <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 18, marginBottom: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>How it progresses</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 20 }}>{view.progression}</Text>
      </View>

      {state === "error" && (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 4 }}>
          {t("plans.enrollError")}
        </Text>
      )}
      {leaveSection}
    </PlanCoverScreen>
  );
}

/** The Explore SectionHead vocabulary — display-face title left, mono meta
 *  right. Shared by the ledger and schedule heads on this screen. */
function SecHead({ C, scheme, title, meta }: { C: Palette; scheme: "light" | "dark"; title: string; meta?: string | null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 22, marginBottom: 10 }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk, flexShrink: 1 }}>{title}</Text>
      {!!meta && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash, textAlign: "right", flexShrink: 1 }}>{meta}</Text>}
    </View>
  );
}

/**
 * The WAVEFORM week rail — one slim column per week whose bar height is that
 * week's real volume, so the plan's wave and taper read as shape before they're
 * read as numbers. Selection is the only accent. Full-bleed (the caller's rail
 * slot runs edge-to-edge); docks under the collapsed cover.
 */
function WeekRail({ C, bars, weeks, week, setWeek, wkLabel }: { C: Palette; bars: PlanWeekBar[]; weeks: number[]; week: number; setWeek: (w: number) => void; wkLabel: string }) {
  const byWeek = new Map(bars.map((b) => [b.week, b.value]));
  const max = Math.max(1, ...bars.map((b) => b.value));
  const hasBars = bars.length > 0;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 9, gap: 2 }}>
      {weeks.map((w) => {
        const on = w === week;
        const v = byWeek.get(w) ?? 0;
        return (
          <Pressable key={w} onPress={() => setWeek(w)} accessibilityRole="button" accessibilityState={{ selected: on }} hitSlop={4} style={{ width: 46, alignItems: "center", gap: 6, paddingVertical: 3 }}>
            {hasBars ? (
              <View style={{ width: 16, height: 34, justifyContent: "flex-end" }}>
                <View style={{ width: 16, height: Math.max(5, Math.round((v / max) * 34)), borderRadius: 3, backgroundColor: on ? C.lime : withAlpha(C.chalk, 0.16) }} />
              </View>
            ) : (
              <View style={{ width: 22, height: 2, borderRadius: 2, backgroundColor: on ? C.lime : withAlpha(C.chalk, 0.16), marginTop: 16 }} />
            )}
            <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: on ? txt(C, C.lime) : C.ash }}>
              {wkLabel} {w}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// The HYBRID plan day view (mobile) — mirrors web `program-days.tsx` 1:1 off the
// SAME shared planProgramView. Layout is chosen from CONTENT: an all-prose week
// (pure running) → ONE week card of Day rows; anything with gym work → one card
// per day, and a hybrid day splits into a RUN block (prose) + a STRENGTH block
// (the Sets×Reps/RPE or %-ramp table).
function ProgramDays({ days, week, peakNote, C, scheme }: { days: ProgramDayView[]; week: number; peakNote: string | null; C: Palette; scheme: "light" | "dark" }) {
  const card = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, overflow: "hidden" as const, marginBottom: 12 };
  const allProse = days.length > 0 && days.every((d) => d.sessions.every((s) => s.lifts.every(isProse)));

  if (allProse) {
    return (
      <View style={card}>
        <DayHeader title={`Week ${week}`} right={peakNote ? peakNote.toLowerCase() : null} C={C} scheme={scheme} />
        {days.map((day, di) => {
          const lifts = day.sessions.flatMap((s) => s.lifts);
          return (
            <View key={di} style={{ flexDirection: "row", paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: di > 0 ? 1 : 0, borderTopColor: HAIR }}>
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
          <DayHeader title={day.title} kindLabel={day.kindLabel} right={dayContentSummary(day)} C={C} scheme={scheme} />
          {day.sessions.map((s, si) => (
            <SessionBlock key={si} s={s} si={si} count={day.sessions.length} C={C} />
          ))}
        </View>
      ))}
    </>
  );
}

// The programme card's header — the day as a display-face TITLE (not a mono
// kicker), the lift count as quiet right-side meta: SectionHead vocabulary.
function DayHeader({ title, kindLabel, right, C, scheme }: { title: string; kindLabel?: string | null; right: string | null; C: Palette; scheme: "light" | "dark" }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: HAIR }}>
      <Text style={{ fontFamily: serifIf(scheme, F.bold), fontSize: 16, letterSpacing: -0.2, color: C.chalk, flexShrink: 1 }}>
        {title}
        {!!kindLabel && <Text style={{ color: C.ash }}> — {kindLabel}</Text>}
      </Text>
      {!!right && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{right}</Text>}
    </View>
  );
}

function Band({ label, color, topBorder, C }: { label: string; color: string; topBorder: boolean; C: Palette }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: HAIR, borderTopWidth: topBorder ? 1 : 0, borderTopColor: HAIR, backgroundColor: tint(color, 0.04) }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, color) }}>{label}</Text>
    </View>
  );
}

function ColHeader({ C }: { C: Palette }) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 18, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: HAIR }}>
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
      {!!marker && <Band label={s.volume ? `${marker} — ${s.volume}` : marker} color={loadHex(C, sessionColor(s.label, si))} topBorder={si > 0} C={C} />}
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
    <View style={{ paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
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
// %, bodyweight last); reps drop into the matching cell. The column IS the
// intensity (each keeps its tier colour); an empty cell is SILENT — absence is
// the information, it needs no glyph. Horizontal-scrolls when there are many
// distinct loads.
const MX_NAME = 132;
const MX_COL = 64;
function PercentMatrix({ lifts, C }: { lifts: ProgramLiftView[]; C: Palette }) {
  const colMap = new Map<string, ProgramStepView>();
  for (const l of lifts) for (const st of l.steps ?? []) if (!colMap.has(st.load)) colMap.set(st.load, st);
  const cols = [...colMap.values()].sort((a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={{ flexDirection: "row", paddingHorizontal: 18, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: HAIR }}>
          <Text style={{ width: MX_NAME, fontFamily: F.mono, fontSize: fs.nano, color: "#5a5e56", textTransform: "uppercase", letterSpacing: 1 }}>Exercise</Text>
          {cols.map((c) => (
            <Text key={c.load} style={{ width: MX_COL, fontFamily: F.mono, fontSize: 10, fontWeight: "700", textAlign: "center", color: txt(C, loadHex(C, c.color)) }}>{c.load}</Text>
          ))}
        </View>
        {lifts.map((l, i) => {
          const byLoad = new Map((l.steps ?? []).map((st) => [st.load, st]));
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: HAIR }}>
              <View style={{ width: MX_NAME, paddingRight: 8 }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{l.name}</Text>
                {!!l.note && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{l.note}</Text>}
              </View>
              {cols.map((c) => {
                const st = byLoad.get(c.load);
                return (
                  <Text key={c.load} style={{ width: MX_COL, fontFamily: F.mono, fontSize: fs.caption, textAlign: "center", color: txt(C, loadHex(C, c.color)) }}>
                    {st ? st.detail : ""}
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
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: HAIR }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: fs.caption, fontWeight: lift.intensity ? "600" : "400", color: lift.intensity ? txt(C, loadHex(C, lift.intensity)) : C.chalk, textAlign: "right", lineHeight: 18 }}>{lift.prescription}</Text>
    </View>
  );
}
