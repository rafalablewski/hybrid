import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput, ScrollView, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  planProgramView,
  splitInputsTitle,
  inputEcho,
  rpeColor,
  workoutColor,
  isProseLift,
  liftKind,
  dayContentSummary,
  percentMatrixView,
  outlierPrescription,
  dayMaxPct,
  loadTier,
  dayLeadWords,
  stepWords,
  rpeMeaning,
  springs,
  springToRN,
  durations,
  type GoalNode,
  type GoalPlan,
  type PlanProgram,
  type ProgramDayView,
  type ProgramLiftView,
  type ProgramSessionView,
  type InkTier,
  type LoadColor,
  type LiftKind,
  ALPHA, FEEDBACK } from "@hybrid/core";
import { enrollPlan } from "../lib/api";
import MeasuredOutcome from "./measured-outcome";
import { useRevalidate } from "../lib/queries";
import { useLang } from "../lib/i18n";
import { usePlanMaxes, setPlanMax } from "../lib/plan-maxes";
import { useTheme, txt, accentColor } from "../lib/theme";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { leading, fs, F, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE , tracking} from "../lib/ui";
import { ACard, cardStack, withAlpha, ASection, DockRail, DockChip } from "./aurora/kit";
import Sheet from "./aurora/sheet";
import PlanCoverScreen, { PlanDockPill, COVER_GUTTER } from "./plan-hero";

type Palette = ReturnType<typeof useTheme>["palette"];
// Was a fifth copy of one lookup — see lib/theme accentColor.
const loadHex = accentColor;
// Quiet intra-card hairline — derived from the theme's line colour, not a
// fixed 5% white.
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
 * maxes LEDGER, the week rail (sticky under the collapsed bar) and the
 * programme day cards.
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
  const { palette: C } = useTheme();
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
          <ASection title={inputsHead.title} meta={inputsHead.meta} />
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
                    style={{ fontFamily: F.mono, minWidth: inp.kind === "number" ? 64 : 104, marginLeft: echo ? 0 : "auto", textAlign: "right", fontSize: fs.note, color: C.chalk, borderBottomWidth: 1.5, borderBottomColor: withAlpha(C.chalk, ALPHA.edge), paddingVertical: 2, fontVariant: ["tabular-nums"] }}
                  />
                </View>
              );
            })}
          </View>

          {/* schedule head — the week volume is the SectionHead's right meta */}
          {(multiWeek || !!view.weekVolume) && (
            <ASection title="Schedule" meta={view.weekVolume ? `${view.weekVolume} ${t("w.train.plans.thisWeek")}` : view.peakNote ?? undefined} />
          )}
        </>
      }
      rail={multiWeek ? <WeekRail weeks={view.weeks} week={view.week} setWeek={setWeek} wkLabel={t("w.train.plans.wkShort")} railLabel={t("w.train.plans.chooseWeek")} /> : undefined}
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
      <View style={{ marginTop: 16 }}>
        <ProgramDays days={view.days} week={view.week} peakNote={view.peakNote} C={C} />
      </View>

      {/* ACard + cardStack. This spelled the kit's box out by hand with the
          radius as a literal 28 and the run gap as a literal 12 — both are
          tokens (RADIUS.card, cardStack), and neither copy could ever mount
          the glass. See card-surface.test.ts. */}
      <ACard style={cardStack}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>How it progresses</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: leading(fs.body) }}>{view.progression}</Text>
      </ACard>

      <MeasuredOutcome planId={plan.id} />

      {state === "error" && (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: FEEDBACK.error.text, marginTop: 4 }}>
          {t("plans.enrollError")}
        </Text>
      )}
      {leaveSection}
    </PlanCoverScreen>
  );
}

/**
 * The week rail — one chip per week, sticky under the collapsed cover.
 *
 * It used to be a WAVEFORM: each chip carried a bar whose height was that
 * week's volume. The bars are gone. They were decoration dressed as data — the
 * week's real volume is already stated in words beside the Schedule head, the
 * heights were normalised against the plan's own peak (so the same wave read
 * differently for every plan and compared to nothing), and being the one
 * hand-rolled rail on a surface that has a shared primitive is exactly how the
 * four dock rails drifted apart the first time. With the bars gone this is
 * plainly what it always was — a MODE rail, one week selected, the panel below
 * changing — so it rides the kit's DockRail/DockChip and cannot drift again.
 * The gutter is COVER_GUTTER, not GUTTER: the rail slot is full-bleed and
 * unpadded, and a resting chip lines up with the cover scaffold's column (16),
 * not with the app's (12).
 */
function WeekRail({ weeks, week, setWeek, wkLabel, railLabel }: { weeks: number[]; week: number; setWeek: (w: number) => void; wkLabel: string; railLabel: string }) {
  return (
    <DockRail label={railLabel} gutter={COVER_GUTTER}>
      {weeks.map((w) => (
        <DockChip key={w} role="mode" label={`${wkLabel} ${w}`} selected={w === week} onPress={() => setWeek(w)} />
      ))}
    </DockRail>
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
//
// The FACE, not a `fontWeight`. The ramp asked for four weights — 700/700/500/
// 400 — from a family that holds exactly one: `F.mono` IS JetBrainsMono
// _400Regular, registered under its own name (lib/ui.tsx). So the two heavy
// tiers were asking for a weight the family cannot serve, which iOS resolves
// out of the family and Android fakes. There are two mono faces, and the ramp
// already has a second, finer channel — OPACITY — which is what actually
// separated `mid` from `low` all along. So: the two heavy tiers take the bold
// FACE, the two light ones the regular, and opacity keeps doing the rest.
type TierStyle = { color: string; fontFamily: string; opacity: number };
function tierStyle(tier: InkTier, C: Palette): TierStyle {
  if (tier === "top") return { color: txt(C, C.lime), fontFamily: F.monoBold, opacity: 1 };
  if (tier === "high") return { color: C.chalk, fontFamily: F.monoBold, opacity: 0.92 };
  if (tier === "mid") return { color: C.chalk, fontFamily: F.mono, opacity: 0.72 };
  return { color: C.chalk, fontFamily: F.mono, opacity: 0.55 };
}

// Group label for the merged header line — "Main — 3", "Accessories — 5".
function groupLabel(kind: LiftKind, n: number, hasPercent: boolean): string {
  if (kind === "run") return "Run";
  if (kind === "percent") return `Main — ${n}`;
  return `${hasPercent ? "Accessories" : "Strength"} — ${n}`;
}

/** What pressing a row opens: the lift plus where it lives. */
type SheetSel = { lift: ProgramLiftView; day: string; marker: string | null };

function ProgramDays({ days, week, peakNote, C }: { days: ProgramDayView[]; week: number; peakNote: string | null; C: Palette }) {
  const [open, setOpen] = useState(0);
  const [sel, setSel] = useState<SheetSel | null>(null);
  // A new week starts the accordion over at its first day.
  useEffect(() => setOpen(0), [week]);
  const allProse = days.length > 0 && days.every((d) => d.sessions.every((s) => s.lifts.every(isProse)));

  if (allProse) {
    return (
      /* A ROW-LIST CARD: the rows run to the card's own edges and carry their
         own 16 inset plus the hairlines between them, so this one takes
         `padding: 0` and keeps the clip. That pad is the only thing about it
         that was ever bespoke — the fill, the hairline, the radius and the
         run gap were all the kit's, written out. */
      <ACard style={[cardStack, { padding: 0, overflow: "hidden" }]}>
        <WeekHeader title={`Week ${week}`} right={peakNote ? peakNote.toLowerCase() : null} C={C} />
        {days.map((day, di) => {
          const lifts = day.sessions.flatMap((s) => s.lifts);
          return (
            <View key={di} style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: di > 0 ? 1 : 0, borderTopColor: hair(C) }}>
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
      </ACard>
    );
  }

  return (
    <>
      {days.map((day, di) => (
        <DayCard key={di} day={day} open={di === open} onToggle={() => setOpen(di === open ? -1 : di)} onLift={(lift, marker) => setSel({ lift, day: day.title, marker })} C={C} />
      ))}
      <ExerciseSheet sel={sel} onClose={() => setSel(null)} C={C} />
    </>
  );
}

// The all-prose week card's header (endurance weeks keep the one-card layout).
function WeekHeader({ title, right, C }: { title: string; right: string | null; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, letterSpacing: tracking.display, color: C.chalk, flexShrink: 1 }}>{title}</Text>
      {!!right && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{right}</Text>}
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
// volume + chevron) that opens into the day's full tables. The row used to
// carry a PULSE too — a strip of hairline bars, the day-level echo of the week
// waveform. It went with the waveform: the summary row already says what the
// day is in words and how much of it there is as a figure, and a sparkline
// nobody can read a number off is the third thing competing for the same row.
function DayCard({ day, open, onToggle, onLift, C }: { day: ProgramDayView; open: boolean; onToggle: () => void; onLift: (l: ProgramLiftView, marker: string | null) => void; C: Palette }) {
  const expandable = day.sessions.some((s) => s.lifts.length > 0);
  const words = dayLeadWords(day);
  const right = dayContentSummary(day);
  return (
    /* ACard, not APressCard: what presses here is the HEADER ROW, which
       collapses back to a header when the day is open — the card itself is
       not a tap target, and making it one would put the whole expanded day's
       tables inside the press. Same row-list treatment as the week card
       above: `padding: 0`, because every row already insets itself by 16. */
    <ACard style={[cardStack, { padding: 0, overflow: "hidden" }]}>
      <Pressable
        disabled={!expandable}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${day.title}${day.kindLabel ? ` — ${day.kindLabel}` : ""}${words ? `, ${words}` : ""}${right ? `, ${right}` : ""}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.subtitle, letterSpacing: tracking.display, color: C.chalk }} numberOfLines={1}>
            {day.title}
            {!!day.kindLabel && <Text style={{ color: C.ash }}> — {day.kindLabel}</Text>}
          </Text>
          {!!words && (
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }} numberOfLines={1}>
              {words}
            </Text>
          )}
        </View>
        {!!right && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{right}</Text>}
        {expandable && (
          <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: open ? C.lime : withAlpha(C.chalk, ALPHA.edge), backgroundColor: open ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, lineHeight: leading(fs.body, "tight"), color: open ? C.ink : C.ash }}>{open ? "−" : "+"}</Text>
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
    </ACard>
  );
}

// The merged rule line (idea 01): ONE quiet row carries what used to be two
// tinted band strips — the session marker (its semantic colour kept) with the
// session volume on the right. No background wash.
// The marker is the block's NAME, so it reads as a heading in chalk. It used to
// cycle through three hues (core sessionColor, now retired): colour encoding
// identity, beside a label that already said which session it was.
function SessionRule({ marker, volume, top, C }: { marker: string; volume: string | null; top: boolean; C: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: hair(C), borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.chalk }}>{marker}</Text>
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
      {!!marker && <SessionRule marker={marker} volume={s.volume} top={si > 0} C={C} />}
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
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{label}</Text>
    </View>
  );
}

// The reps cell content — quiet notation (idea 06): the reps token leads, the
// set multiplier steps back to ash ("4+1 ×4"; a single set is just "4").
function RepsText({ reps, sets, style, C }: { reps: string; sets: number; style: TierStyle; C: Palette }) {
  return (
    // No base `fontFamily` here: `style` is a TierStyle and always carries the
    // tier's own face, so declaring one would only be the thing the spread
    // overwrites. The nested ×N run names F.mono for itself.
    <Text style={{ fontSize: fs.caption, fontVariant: ["tabular-nums"], ...style }}>
      {reps}
      {sets > 1 && <Text style={{ fontFamily: F.mono, color: C.ash }}> ×{sets}</Text>}
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
          <View style={{ height: HDR_H, justifyContent: "center", paddingLeft: 16, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
            {!!label && (
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }} numberOfLines={1}>
                {label}
              </Text>
            )}
          </View>
          {rows.map((l, i) => (
            <Pressable key={i} onPress={() => onPress(l)} accessibilityRole="button" accessibilityLabel={`${l.name} — details`} style={{ height: rowH(l), justifyContent: "center", paddingLeft: 16, paddingRight: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: hair(C) }}>
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>
                {l.name}
              </Text>
              {!!l.note && (
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }} numberOfLines={1}>
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
                  <Text key={c.load} style={{ width: MX_COL, fontFamily: F.mono, fontSize: fs.nano, textAlign: "center", color: C.ash }}>
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>{lift.name}</Text>
        {!!lift.note && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }} numberOfLines={1}>{lift.note}</Text>}
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
        <View style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: hair(C) }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }} numberOfLines={1}>
            {label ?? ""}
          </Text>
          {hasRpe && (
            <>
              <Text style={{ width: 70, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: tracking.label }}>Sets×Reps</Text>
              <Text style={{ width: 54, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "right", textTransform: "uppercase", letterSpacing: tracking.label }}>RPE</Text>
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, marginRight: 8, backgroundColor: loadHex(C, liftColor(lift)) }} />
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: rest ? C.ash : C.chalk }}>{lift.name}</Text>
      </View>
      {!!detail && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3, lineHeight: leading(fs.caption), marginLeft: 16 }}>{detail}</Text>}
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
        <View style={{ width: 7, height: 7, borderRadius: 3.5, marginRight: 8, backgroundColor: loadHex(C, lift ? liftColor(lift) : "ash") }} />
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: rest ? C.ash : C.chalk }}>{name}</Text>
      </View>
      {!!detail && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3, lineHeight: leading(fs.caption), marginLeft: 16 }}>{detail}</Text>}
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${lift.name} — details`} style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: top ? 1 : 0, borderTopColor: hair(C) }}>
      <NameCell lift={lift} C={C} />
      <Text style={{ flex: 1.1, fontFamily: lift.intensity ? F.monoBold : F.mono, fontSize: fs.caption, color: lift.intensity ? txt(C, loadHex(C, lift.intensity)) : C.chalk, textAlign: "right", lineHeight: leading(fs.caption) }}>{lift.prescription}</Text>
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
  const row = { flexDirection: "row" as const, alignItems: "baseline" as const, gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: hair(C) };
  return (
    <Sheet visible={!!sel} onClose={onClose} title={lift.name} sub={sub}>
      <View style={{ marginTop: 6 }}>
        {!!lift.note && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption), marginBottom: 10 }}>{lift.note}</Text>}
        {steps.map((st, i) => (
          <View key={i} style={{ ...row, borderTopWidth: i > 0 ? 1 : 0 }}>
            <Text style={{ width: 48, fontFamily: F.monoBold, fontSize: fs.note, color: txt(C, loadHex(C, st.color)) }}>{st.load}</Text>
            <Text style={{ width: 68, fontFamily: F.mono, fontSize: fs.note, color: C.chalk, fontVariant: ["tabular-nums"] }}>{st.kg ?? ""}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "right" }}>{stepWords(st)}</Text>
          </View>
        ))}
        {!!lift.oneRm && (
          <View style={{ ...row, borderTopColor: withAlpha(C.chalk, ALPHA.fill) }}>
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
          <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, lineHeight: leading(fs.note, "snug") }}>{lift.prescription}</Text>
        )}
      </View>
    </Sheet>
  );
}
