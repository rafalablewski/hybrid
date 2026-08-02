import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
  percentMatrixView,
  outlierPrescription,
  dayMaxPct,
  loadTier,
  dayPulse,
  dayLeadWords,
  stepWords,
  rpeMeaning,
  springs,
  springToRN,
  durations,
  type GoalNode,
  type GoalPlan,
  type PlanProgram,
  type PlanWeekBar,
  type ProgramDayView,
  type ProgramLiftView,
  type ProgramSessionView,
  type InkTier,
  type LoadColor,
  type LiftKind,
} from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import MeasuredOutcome from "./measured-outcome";
import { useRevalidate } from "../lib/queries";
import { useLang } from "../lib/i18n";
import { usePlanMaxes, setPlanMax } from "../lib/plan-maxes";
import { useTheme, txt } from "../lib/theme";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { fs, F, serifIf } from "../lib/ui";
import { withAlpha } from "./aurora/kit";
import Sheet from "./aurora/sheet";
import PlanCoverScreen, { PlanDockPill } from "./plan-hero";

type Palette = ReturnType<typeof useTheme>["palette"];
const loadHex = (C: Palette, c: LoadColor): string => ({ blue: C.blue, lime: C.lime, amber: C.amber, red: C.red, ash: C.ash })[c];
// Quiet intra-card hairline — derived from the theme's line colour so it
// inverts with the light theme (a fixed 5% white disappeared on washi).
const hair = (C: Palette) => withAlpha(C.line, 0.6);
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

  const revalidate = useRevalidate();
  const enroll = async () => {
    setState("busy");
    const ok = await enrollPlan(goal.name, plan.id);
    setState(ok ? "done" : "error");
    // Enrolling changed the season — drop the cached macrocycle so Today and
    // Performance don't keep rendering "No season yet" off a pre-enrol read.
    if (ok) { revalidate.macrocycle(); onEnrolled?.(); }
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

      <MeasuredOutcome planId={plan.id} />

      {state === "error" && (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 4 }}>
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

// ── The quiet matrix ─────────────────────────────────────────────────────────
// The programme day view (mobile) — mirrors web `program-days.tsx` 1:1 off the
// SAME shared planProgramView + percentMatrixView. The redesign (see
// design/plan-schedule-table-redesign-ideas.html): days are an ACCORDION (one
// open at a time, closed rows carry a plain-words summary + the day's load
// PULSE), session/group headers collapse to single quiet rule lines, the %
// matrix pins its exercise column and fades its scrolled edge, intensity is
// INK WEIGHT (one accent on the day's top load — no per-column rainbow),
// loads shared by nobody drop out of the grid as full-width outlier rows, and
// every row presses into an exercise SHEET with the full prescription story.

const MX_NAME = 132;
const MX_COL = 62;
const HDR_H = 26;
const rowH = (l: ProgramLiftView) => (l.note ? 56 : 44);

// Ink tier → text style: the monochrome intensity ramp. `top` (the day's
// heaviest %) is the single accent; everything else is chalk at falling weight.
function tierStyle(tier: InkTier, C: Palette): { color: string; fontWeight: "400" | "500" | "700"; opacity: number } {
  if (tier === "top") return { color: txt(C, C.lime), fontWeight: "700", opacity: 1 };
  if (tier === "high") return { color: C.chalk, fontWeight: "700", opacity: 0.92 };
  if (tier === "mid") return { color: C.chalk, fontWeight: "500", opacity: 0.72 };
  return { color: C.chalk, fontWeight: "400", opacity: 0.55 };
}

// Group label for the merged header line — "Main — 3", "Accessories — 5".
function groupLabel(kind: LiftKind, n: number, hasPercent: boolean): string {
  if (kind === "run") return "Run";
  if (kind === "percent") return `Main — ${n}`;
  return `${hasPercent ? "Accessories" : "Strength"} — ${n}`;
}

/** What pressing a row opens: the lift plus where it lives. */
type SheetSel = { lift: ProgramLiftView; day: string; marker: string | null };

function ProgramDays({ days, week, peakNote, C, scheme }: { days: ProgramDayView[]; week: number; peakNote: string | null; C: Palette; scheme: "light" | "dark" }) {
  const [open, setOpen] = useState(0);
  const [sel, setSel] = useState<SheetSel | null>(null);
  // A new week starts the accordion over at its first day.
  useEffect(() => setOpen(0), [week]);
  const allProse = days.length > 0 && days.every((d) => d.sessions.every((s) => s.lifts.every(isProse)));

  if (allProse) {
    const card = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, overflow: "hidden" as const, marginBottom: 12 };
    return (
      <View style={card}>
        <WeekHeader title={`Week ${week}`} right={peakNote ? peakNote.toLowerCase() : null} C={C} scheme={scheme} />
        {days.map((day, di) => {
          const lifts = day.sessions.flatMap((s) => s.lifts);
          return (
            <View key={di} style={{ flexDirection: "row", paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: di > 0 ? 1 : 0, borderTopColor: hair(C) }}>
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
        <DayCard key={di} day={day} open={di === open} onToggle={() => setOpen(di === open ? -1 : di)} onLift={(lift, marker) => setSel({ lift, day: day.title, marker })} C={C} scheme={scheme} />
      ))}
      <ExerciseSheet sel={sel} onClose={() => setSel(null)} C={C} />
    </>
  );
}

// The all-prose week card's header (endurance weeks keep the one-card layout).
function WeekHeader({ title, right, C, scheme }: { title: string; right: string | null; C: Palette; scheme: "light" | "dark" }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
      <Text style={{ fontFamily: serifIf(scheme, F.bold), fontSize: 16, letterSpacing: -0.2, color: C.chalk, flexShrink: 1 }}>{title}</Text>
      {!!right && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{right}</Text>}
    </View>
  );
}

// The day's load shape — one hairline bar per prescription, the day-level echo
// of the week waveform. Semantic: every bar is a real step (dayPulse, core).
function Pulse({ day, C }: { day: ProgramDayView; C: Palette }) {
  const bars = dayPulse(day);
  if (!bars.length) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((b, i) => (
        <View key={i} style={{ width: 3, borderRadius: 1.5, height: Math.max(3, Math.round(b.h * 16)), backgroundColor: b.hot ? C.lime : withAlpha(C.chalk, 0.22) }} />
      ))}
    </View>
  );
}

/**
 * The accordion's expand/collapse — house motion: the body ARRIVES on the sheet
 * spring (springs.sheet via springToRN, the same physics the web rides through
 * --e-sheet) and LEAVES fast on an accelerating curve (durations.fast), per the
 * "things leave faster than they arrive" rule. Reduce Motion SUBSTITUTES a
 * cross-dissolve (durations.reduced): the height change is instant, opacity
 * still tells you something changed. Content stays mounted (measured via
 * onLayout so the height animation has a real target) but is clipped, untappable
 * and hidden from AT while closed.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const { palette: C } = useTheme();
  const reduced = useReducedMotion();
  const [h, setH] = useState(0);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      Animated.timing(anim, { toValue: open ? 1 : 0, duration: durations.reduced, easing: Easing.linear, useNativeDriver: false }).start();
      return;
    }
    if (open) Animated.spring(anim, { toValue: 1, ...springToRN(springs.sheet), useNativeDriver: false }).start();
    else Animated.timing(anim, { toValue: 0, duration: durations.fast, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reduced]);
  // Height rides the animation once measured; under Reduce Motion it snaps.
  const height = reduced ? (open ? undefined : 0) : h > 0 ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, h] }) : open ? undefined : 0;
  return (
    <Animated.View
      style={{ height, opacity: anim, overflow: "hidden" }}
      pointerEvents={open ? "auto" : "none"}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
    >
      <View onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))} style={{ borderTopWidth: 1, borderTopColor: hair(C) }}>
        {children}
      </View>
    </Animated.View>
  );
}

// One accordion day: a pressable summary row (title + plain-words summary,
// pulse + volume + chevron) that opens into the day's full tables.
function DayCard({ day, open, onToggle, onLift, C, scheme }: { day: ProgramDayView; open: boolean; onToggle: () => void; onLift: (l: ProgramLiftView, marker: string | null) => void; C: Palette; scheme: "light" | "dark" }) {
  const expandable = day.sessions.some((s) => s.lifts.length > 0);
  const words = dayLeadWords(day);
  const right = dayContentSummary(day);
  return (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, overflow: "hidden", marginBottom: 12 }}>
      <Pressable
        disabled={!expandable}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${day.title}${day.kindLabel ? ` — ${day.kindLabel}` : ""}${words ? `, ${words}` : ""}${right ? `, ${right}` : ""}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 13 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.bold), fontSize: 16, letterSpacing: -0.2, color: C.chalk }} numberOfLines={1}>
            {day.title}
            {!!day.kindLabel && <Text style={{ color: C.ash }}> — {day.kindLabel}</Text>}
          </Text>
          {!!words && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }} numberOfLines={1}>
              {words}
            </Text>
          )}
        </View>
        <Pulse day={day} C={C} />
        {!!right && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{right}</Text>}
        {expandable && (
          <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: open ? C.lime : withAlpha(C.chalk, 0.25), backgroundColor: open ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: 13, lineHeight: 15, color: open ? C.ink : C.ash }}>{open ? "−" : "+"}</Text>
          </View>
        )}
      </Pressable>
      {expandable && (
        <Collapse open={open}>
          {day.sessions.map((s, si) => (
            <SessionBlock key={si} s={s} si={si} count={day.sessions.length} day={day} C={C} onLift={onLift} />
          ))}
        </Collapse>
      )}
    </View>
  );
}

// The merged rule line (idea 01): ONE quiet row carries what used to be two
// tinted band strips — the session marker (its semantic colour kept) with the
// session volume on the right. No background wash.
function SessionRule({ marker, color, volume, top, C }: { marker: string; color: string; volume: string | null; top: boolean; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingHorizontal: 18, paddingTop: 9, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: hair(C), borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, color) }}>{marker}</Text>
      {!!volume && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{volume}</Text>}
    </View>
  );
}

function SessionBlock({ s, si, count, day, C, onLift }: { s: ProgramSessionView; si: number; count: number; day: ProgramDayView; C: Palette; onLift: (l: ProgramLiftView, marker: string | null) => void }) {
  const groups = groupByKind(s.lifts);
  const mixed = groups.length > 1;
  const hasPercent = groups.some((g) => g.kind === "percent");
  const dayMax = dayMaxPct(day);
  // A multi-session day gets one marker per session: the plan's time-of-day
  // (AM/MID/PM) when set, else a plain "Training N" from the ordinal — so an
  // untimed two/three-a-day is distinguished, not silently merged.
  const marker = s.label ?? (count > 1 ? `Training ${si + 1}` : null);
  const press = (l: ProgramLiftView) => onLift(l, marker);
  return (
    <View>
      {!!marker && <SessionRule marker={marker} color={loadHex(C, sessionColor(s.label, si))} volume={s.volume} top={si > 0} C={C} />}
      {groups.map((g, gi) => {
        const label = mixed ? groupLabel(g.kind, g.lifts.length, hasPercent) : null;
        const top = (gi > 0 || si > 0) && !marker;
        return (
          <View key={gi} style={{ borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
            {g.kind === "percent" ? (
              <QuietMatrix lifts={g.lifts} dayMax={dayMax} label={label} C={C} onPress={press} />
            ) : g.kind === "run" ? (
              <>
                {!!label && <GroupRule label={label} C={C} />}
                {g.lifts.map((l, i) => (
                  <ProseRow key={i} lift={l} top={i > 0} C={C} onPress={() => press(l)} />
                ))}
              </>
            ) : (
              <AccessoryRows lifts={g.lifts} label={label} C={C} onPress={press} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// A lone group label line (runs inside a mixed day).
function GroupRule({ label, C }: { label: string; C: Palette }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{label}</Text>
    </View>
  );
}

// The reps cell content — quiet notation (idea 06): the reps token leads, the
// set multiplier steps back to ash ("4+1 ×4"; a single set is just "4").
function RepsText({ reps, sets, style, C }: { reps: string; sets: number; style: { color: string; fontWeight: "400" | "500" | "700"; opacity: number }; C: Palette }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontVariant: ["tabular-nums"], ...style }}>
      {reps}
      {sets > 1 && <Text style={{ color: C.ash, fontWeight: "400" }}> ×{sets}</Text>}
    </Text>
  );
}

/**
 * The % matrix, rebuilt: the exercise column is PINNED (idea 05) while the load
 * lanes scroll beneath a soft edge fade; the merged header line (idea 01) puts
 * the group label in the pinned corner and the % labels over their lanes; cells
 * carry the ink ramp (idea 02); phantom-column outliers render as full-width
 * rows before/after the grid (idea 04). Every row presses into the sheet.
 */
function QuietMatrix({ lifts, dayMax, label, C, onPress }: { lifts: ProgramLiftView[]; dayMax: number | null; label: string | null; C: Palette; onPress: (l: ProgramLiftView) => void }) {
  const { cols, rows, before, after } = percentMatrixView(lifts);
  const [fade, setFade] = useState(false);
  const viewW = useRef(0);
  const contentW = useRef(0);
  const sync = () => setFade(contentW.current > viewW.current + 1);
  return (
    <View>
      {before.map((l, i) => (
        <OutlierRow key={`b${i}`} lift={l} top={i > 0} C={C} onPress={() => onPress(l)} />
      ))}
      <View style={{ flexDirection: "row", borderTopWidth: before.length ? 1 : 0, borderTopColor: hair(C) }}>
        {/* pinned exercise column — names never divorce their reps */}
        <View style={{ width: MX_NAME }}>
          <View style={{ height: HDR_H, justifyContent: "center", paddingLeft: 18, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
            {!!label && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash }} numberOfLines={1}>
                {label}
              </Text>
            )}
          </View>
          {rows.map((l, i) => (
            <Pressable key={i} onPress={() => onPress(l)} accessibilityRole="button" accessibilityLabel={`${l.name} — details`} style={{ height: rowH(l), justifyContent: "center", paddingLeft: 18, paddingRight: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: hair(C) }}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>
                {l.name}
              </Text>
              {!!l.note && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }} numberOfLines={1}>
                  {l.note}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
        {/* the load lanes — scroll under a soft fade, never a hard cut */}
        <View style={{ flex: 1 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={(e) => { viewW.current = e.nativeEvent.layout.width; sync(); }}
            onContentSizeChange={(w) => { contentW.current = w; sync(); }}
            onScroll={(e) => { const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent; setFade(contentSize.width > layoutMeasurement.width + 1 && contentOffset.x < contentSize.width - layoutMeasurement.width - 4); }}
            scrollEventThrottle={32}
          >
            <View>
              <View style={{ flexDirection: "row", height: HDR_H, alignItems: "center", borderBottomWidth: 1, borderBottomColor: hair(C) }}>
                {cols.map((c) => (
                  <Text key={c.load} style={{ width: MX_COL, fontFamily: F.mono, fontSize: 10, textAlign: "center", color: C.ash }}>
                    {c.load}
                  </Text>
                ))}
              </View>
              {rows.map((l, i) => {
                const byLoad = new Map((l.steps ?? []).map((st) => [st.load, st]));
                return (
                  <Pressable key={i} onPress={() => onPress(l)} style={{ flexDirection: "row", height: rowH(l), alignItems: "center", borderTopWidth: i > 0 ? 1 : 0, borderTopColor: hair(C) }}>
                    {cols.map((c) => {
                      const st = byLoad.get(c.load);
                      // An empty cell is SILENT — absence is the information.
                      return (
                        <View key={c.load} style={{ width: MX_COL, alignItems: "center" }}>
                          {st ? <RepsText reps={st.reps} sets={st.sets} style={tierStyle(loadTier(st.pct, dayMax), C)} C={C} /> : null}
                        </View>
                      );
                    })}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {fade && (
            <LinearGradient colors={[withAlpha(C.ink2, 0), C.ink2]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 28 }} />
          )}
        </View>
      </View>
      {after.map((l, i) => (
        <OutlierRow key={`a${i}`} lift={l} top C={C} onPress={() => onPress(l)} />
      ))}
    </View>
  );
}

// A grid outlier (idea 04) — loads nobody shares get a full-width line, not an
// empty lane: name left, the whole prescription in words right.
function OutlierRow({ lift, top, C, onPress }: { lift: ProgramLiftView; top: boolean; C: Palette; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>{lift.name}</Text>
        {!!lift.note && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }} numberOfLines={1}>{lift.note}</Text>}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right" }}>{outlierPrescription(lift)}</Text>
    </Pressable>
  );
}

// Accessory / strength rows — the merged header line (idea 01) carries the
// group label AND the column labels in one row, aligned over their columns.
function AccessoryRows({ lifts, label, C, onPress }: { lifts: ProgramLiftView[]; label: string | null; C: Palette; onPress: (l: ProgramLiftView) => void }) {
  const hasRpe = lifts.some((l) => l.rpe != null);
  return (
    <View>
      {(label || hasRpe) && (
        <View style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: 18, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
          <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash }} numberOfLines={1}>
            {label ?? ""}
          </Text>
          {hasRpe && (
            <>
              <Text style={{ width: 70, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>Sets×Reps</Text>
              <Text style={{ width: 54, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>RPE</Text>
            </>
          )}
        </View>
      )}
      {lifts.map((l, i) =>
        l.rpe != null ? <HeatRow key={i} lift={l} top={i > 0} C={C} onPress={() => onPress(l)} /> : <FallbackRow key={i} lift={l} top={i > 0} C={C} onPress={() => onPress(l)} />,
      )}
    </View>
  );
}

// a prose workout line (a run / cross-train) inside a day card
function ProseRow({ lift, top, C, onPress }: { lift: ProgramLiftView; top: boolean; C: Palette; onPress: () => void }) {
  const rest = /rest/i.test(lift.name);
  const detail = lift.prescription && lift.note ? `${lift.prescription} (${lift.note})` : lift.prescription || lift.note || null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, marginRight: 7, backgroundColor: loadHex(C, liftColor(lift)) }} />
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: rest ? C.ash : C.chalk }}>{lift.name}</Text>
      </View>
      {!!detail && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3, lineHeight: 17, marginLeft: 14 }}>{detail}</Text>}
    </Pressable>
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

// bodybuilding — Sets×Reps + RPE heat (RPE keeps its semantic heat colour).
function HeatRow({ lift, top, C, onPress }: { lift: ProgramLiftView; top: boolean; C: Palette; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ width: 70, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, textAlign: "right", marginRight: 10, fontVariant: ["tabular-nums"] }}>{lift.setsReps ?? "—"}</Text>
      <Text style={{ width: 54, textAlign: "right", fontFamily: F.mono, fontSize: fs.body, color: txt(C, loadHex(C, rpeColor(lift.rpe!))) }}>@{lift.rpe}</Text>
    </Pressable>
  );
}

// prose fallback (mixed/odd entries inside a day card). For conditioning the
// prescription carries the effort-tier colour (the circuit's load-wave); otherwise
// it stays chalk.
function FallbackRow({ lift, top, C, onPress }: { lift: ProgramLiftView; top: boolean; C: Palette; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: fs.caption, fontWeight: lift.intensity ? "600" : "400", color: lift.intensity ? txt(C, loadHex(C, lift.intensity)) : C.chalk, textAlign: "right", lineHeight: 18 }}>{lift.prescription}</Text>
    </Pressable>
  );
}

/**
 * The exercise sheet (idea 09) — every row's full story at reading size: each
 * load as % and kilograms with its volume in words, the author's note given
 * room, the 1RM it's computed from, and RPE explained. Density moves off the
 * table's surface, not out of the product.
 */
function ExerciseSheet({ sel, onClose, C }: { sel: SheetSel | null; onClose: () => void; C: Palette }) {
  // Keep the last selection through the sheet's exit animation.
  const last = useRef<SheetSel | null>(null);
  if (sel) last.current = sel;
  const v = sel ?? last.current;
  if (!v) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;
  const { lift, day, marker } = v;
  const where = marker ? `${day} — ${marker}` : day;
  const sub = lift.nl > 0 ? `${where} — ${lift.nl} lifts` : where;
  const steps = lift.steps ?? [];
  const row = { flexDirection: "row" as const, alignItems: "baseline" as const, gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: hair(C) };
  return (
    <Sheet visible={!!sel} onClose={onClose} title={lift.name} sub={sub}>
      <View style={{ marginTop: 6 }}>
        {!!lift.note && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: 18, marginBottom: 10 }}>{lift.note}</Text>}
        {steps.map((st, i) => (
          <View key={i} style={{ ...row, borderTopWidth: i > 0 ? 1 : 0 }}>
            <Text style={{ width: 48, fontFamily: F.mono, fontSize: fs.note, fontWeight: "700", color: txt(C, loadHex(C, st.color)) }}>{st.load}</Text>
            <Text style={{ width: 68, fontFamily: F.mono, fontSize: fs.note, color: C.chalk, fontVariant: ["tabular-nums"] }}>{st.kg ?? ""}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right" }}>{stepWords(st)}</Text>
          </View>
        ))}
        {!!lift.oneRm && (
          <View style={{ ...row, borderTopColor: withAlpha(C.chalk, 0.12) }}>
            <Text style={{ width: 48, fontFamily: F.mono, fontSize: fs.note, color: C.ash }}>1RM</Text>
            <Text style={{ width: 68, fontFamily: F.mono, fontSize: fs.note, color: C.chalk, fontVariant: ["tabular-nums"] }}>{lift.oneRm}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right" }}>from your maxes</Text>
          </View>
        )}
        {steps.length === 0 && !!lift.setsReps && (
          <View style={{ ...row, borderTopWidth: 0 }}>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Sets × reps</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, fontVariant: ["tabular-nums"] }}>{lift.setsReps}</Text>
          </View>
        )}
        {steps.length === 0 && lift.weight != null && !!lift.weight && (
          <View style={row}>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Working weight</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, fontVariant: ["tabular-nums"] }}>{lift.weight}</Text>
          </View>
        )}
        {lift.rpe != null && (
          <View style={row}>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Effort</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: txt(C, loadHex(C, rpeColor(lift.rpe))) }}>
              @{lift.rpe}
              <Text style={{ color: C.ash }}> — {rpeMeaning(lift.rpe)}</Text>
            </Text>
          </View>
        )}
        {steps.length === 0 && lift.setsReps == null && !!lift.prescription && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, lineHeight: 20 }}>{lift.prescription}</Text>
        )}
      </View>
    </Sheet>
  );
}
