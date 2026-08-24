import { useMemo, useState } from "react";
import { View, Text, type DimensionValue } from "react-native";
import {
  QUESTIONNAIRE, questionnaireProgress, isAsked, MONTH_KEYS,
  factorLabelKey, factorAffectsKey, factorPercent,
  blockKindKey, resolveBlock, blockRamp, MUSCLE_GROUP_KEY,
  type Question, type QuestionnaireSection, type SectionProgress,
  type AthleteVolumeProfile, type LoggedSession, type MuscleGroup, type VolumeBlock, type VolumeLandmark,
  ALPHA,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useVolumeModel } from "../../lib/use-volume-model";
import { setQuestionnaire } from "../../lib/questionnaire";
import { logWeighIn } from "../../lib/weigh-in";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, HIT_SLOP, HIT_TARGET, MAX_FONT_SCALE, PressScale as Pressable, fs, leading, space, trackFigure, tracking, ty} from "../../lib/ui";
import { haptic } from "../../lib/haptics";
import { AuroraScreen, ACard, ADrawer, ASection, ANumberField, ABirthField, AStepper, ACheckMark, RADIUS, withAlpha } from "./kit";
import { LeadCard } from "./lead-rail";

/** The seven group names, from core — see volume-view.ts. A copy written from
 *  the group names prints a raw key for `posterior`, whose key is
 *  `musclePosteriorChain`. */
const MUSCLE_KEY: Record<string, string> = MUSCLE_GROUP_KEY;
const FIELDS = ["mv", "mev", "mavLow", "mavHigh", "mrv"] as const;
const FIELD_LABEL = ["MV", "MEV", "MAV LO", "MAV HI", "MRV"];
const pct = (v: number): DimensionValue => `${Math.round(v * 100)}%` as DimensionValue;

/** The progress track's thickness — the same hairline rule the Volume screen's
 *  completeness meter draws, so the two read as one measure of one thing. */
const METER_H = 3;
/** One mark of a 1–5 scale. Thicker than the meter because it is a CONTROL
 *  rather than a reading: it has to look pressable at a glance and clear the
 *  touch floor with its own row (the 44dp target is on the pressable). */
const SCALE_MARK_H = 6;

type Palette = ReturnType<typeof useTheme>["palette"];

/**
 * THE QUESTIONNAIRE.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 *
 * This screen was called "Volume model", and it was named after the machine. On
 * it, in one flat stack of four identical cards: a diff of landmark overrides, a
 * profile form built from six 30%-wide numeric boxes and three rows of pills, a
 * table of THIRTY-FIVE text inputs, and the periodization switches. About a
 * dozen of those controls are questions about a person and the rest are the
 * engine's internals, and nothing on the screen said which was which — same
 * card, same weight, same order. The athlete could not tell the question that
 * moves every number in the app (training age) from a field that adjusts one
 * muscle's floor.
 *
 * And one of the questions did not work. `sanitizeVolumeProfile` never named
 * `sex`, so the toggle was tapped, stored, discarded on the way to storage and
 * read back as blank — the control never even lit, and every female athlete
 * stayed scored against the published men's bar. A form whose answers vanish is
 * not a form.
 *
 * ── WHAT IT IS NOW ─────────────────────────────────────────────────────────
 *
 * FOUR SECTIONS THAT NAME THEMSELVES BY WHAT THEY ASK ABOUT — your body, your
 * training, your recovery, your fuel (core `questionnaire.ts`, which both
 * clients read and which no un-consumed question can enter). One question per
 * block, its own control, at the size of a thing you are meant to answer.
 *
 * THE PROSE APPEARS ONLY WHERE IT IS STILL NEEDED. An unanswered question
 * carries the line saying what answering it buys; the moment it is answered the
 * line goes and the answer stands alone. That is the whole reason twelve
 * questions and twelve justifications fit on one screen without becoming a wall
 * — the wall dissolves as you fill it in.
 *
 * NOTHING PRETENDS TO BE ANSWERED. An unanswered number shows no figure at all,
 * because a seeded 80 kg presented as the athlete's own is a fabricated
 * measurement that the model then explains itself with. A measured answer says
 * it was measured, in the accent, and stays overridable where the engine allows
 * it.
 *
 * THE PAYOFF IS ON THE SAME SCREEN. "What your answers changed" lists the
 * multipliers with the value that earned each one, so the form is visibly a
 * cause and not a survey.
 *
 * THE MACHINE IS BEHIND A DISCLOSURE. The thirty-five landmark fields, the two
 * model switches and the block are still here, entire — one tap down, under a
 * head that says they are the model rather than the person.
 */
export default function AuroraQuestionnaire() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const prefs = useLoggerPrefs();
  const { measuredKeys, profile, resolved, baseline, setProfile } = useVolumeModel(sessions);

  const progress = useMemo(
    () => questionnaireProgress(profile, measuredKeys as Set<string>),
    [profile, measuredKeys],
  );
  // Which section is expanded. One at a time, and the FIRST INCOMPLETE ONE on
  // arrival — the screen opens where the work is rather than at the top of a
  // form the athlete has already filled in.
  const [open, setOpen] = useState<QuestionnaireSection["id"] | null>(
    () => questionnaireProgress(profile, measuredKeys as Set<string>).nextSection ?? "body",
  );
  const [advanced, setAdvanced] = useState(false);

  const answered = progress.sections.reduce((n, s) => n + s.answered, 0);
  const total = progress.sections.reduce((n, s) => n + s.total, 0);

  /**
   * SAVE AN ANSWER — to the profile, or to the body log where the answer is a
   * measurement.
   *
   * Body mass is the one question whose answer has a DATE. Writing it as a
   * standing profile field is what let a figure typed once at setup outrank
   * every subsequent weigh-in for the life of the account, so this row appends
   * to the body log instead — the same store the scale form writes, debounced
   * so a drag from 80 to 74 leaves one reading rather than the trail of numbers
   * it crossed (lib/weigh-in.ts). The local copy is set too, so the control
   * answers the thumb immediately; the log supersedes it the moment it lands.
   */
  const answer = (patch: Partial<AthleteVolumeProfile>) => {
    for (const [key, value] of Object.entries(patch)) {
      const q = QUESTIONNAIRE.flatMap((s) => s.questions).find((x) => x.key === key);
      if (q?.logged && typeof value === "number") logWeighIn(value);
    }
    setProfile(patch);
  };

  return (
    <AuroraScreen
      refreshing={refreshing}
      onRefresh={refetch}
      hero={{ rank: "title", title: t("w.quiz.title"), meta: [t("w.quiz.sub")] }}
    >
      <Standing C={C} t={t} score={progress.score} answered={answered} total={total} next={progress.next} />

      {QUESTIONNAIRE.map((section) => (
        <SectionCard
          key={section.id}
          C={C}
          t={t}
          section={section}
          state={progress.sections.find((s) => s.id === section.id)!}
          profile={profile}
          measuredKeys={measuredKeys}
          open={open === section.id}
          onToggle={() => { haptic.selection(); setOpen((o) => (o === section.id ? null : section.id)); }}
          onAnswer={answer}
        />
      ))}

      <Changed C={C} t={t} factors={resolved.factors} />

      {/* ── THE MACHINE, one tap down ──────────────────────────────────────
          Everything below this line is the model rather than the person: the
          per-muscle landmark table, the adaptive switch, the block. It is the
          same set of controls the old screen put at the same weight as "how old
          are you", and demoting it is most of what makes the questions legible. */}
      <ACard solid style={{ marginTop: space.lg }}>
        <Pressable
          onPress={() => { haptic.selection(); setAdvanced((v) => !v); }}
          accessibilityRole="button"
          accessibilityState={{ expanded: advanced }}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.quiz.machine.title")}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash, marginTop: space.xxs }}>
              {t("w.quiz.machine.blurb")}
            </Text>
          </View>
          {/* Bare ＋/− with no ring: this GROWS in place, it does not leave. */}
          <Text style={{ fontFamily: F.mono, fontSize: fs.headline, color: C.ash }}>{advanced ? "−" : "＋"}</Text>
        </Pressable>
        <ADrawer open={advanced}>
          <TheModel C={C} t={t} prefs={prefs} resolved={resolved} baseline={baseline} />
        </ADrawer>
      </ACard>
    </AuroraScreen>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE STANDING — how much of you the model has.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One figure, one track, one sentence.
 *
 * The figure is the SHARE OF THE ESTIMATE that rests on answers we have, not
 * the share of boxes ticked — training age is worth nine times what stress is,
 * and a bar that counted boxes would tell an athlete who answered the two
 * cheapest questions that they were a fifth of the way there. `answered of
 * total` is printed beside it precisely because the weighted figure is not a
 * count and should not be mistaken for one.
 */
function Standing({ C, t, score, answered, total, next }: {
  C: Palette; t: (k: string) => string; score: number; answered: number; total: number;
  /** The heaviest question still unanswered — the sentence's subject. */
  next: Question | null;
}) {
  return (
    <ACard solid style={{ marginTop: space.lg }}>
      {/* THE SENTENCE IS THE HERO, NOT THE SCORE.
          This card led with the completeness figure at fs.stat — 46dp of `0%`
          as the first thing on a screen about yourself. That is a CHORE METER:
          it grades the athlete on arrival, in the app's own units, for the
          crime of being new. And it is the machine's anxiety rather than the
          athlete's question — nobody opens this wanting to know their
          percentage; they open it wanting to know what the app thinks they are
          and what it would do with one more answer.
          So the lead is what the model still needs, said as a sentence with a
          subject a person recognises ("Next — body mass"). The figure keeps
          its place beside the track it belongs to, at reading size, where it
          annotates progress instead of pronouncing on it. */}
      <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk, lineHeight: leading(fs.headline, "snug") }}>
        {next ? t("w.quiz.leadNext").replace("{q}", t(next.labelKey)) : t("w.quiz.leadDone")}
      </Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash, marginTop: space.sm }}>
        {t(next ? "w.quiz.knownWhy" : "w.quiz.knownComplete")}
      </Text>

      <View style={{ height: METER_H, borderRadius: RADIUS.pill, backgroundColor: C.ink, marginTop: space.lg, overflow: "hidden" }}>
        <View style={{ width: pct(score), height: "100%", backgroundColor: C.lime }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, marginTop: space.sm }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: C.ash }}
        >
          {`${Math.round(score * 100)}% ${t("w.quiz.known")}`}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{`${answered}/${total}`}</Text>
      </View>
    </ACard>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * A SECTION — the unit the athlete answers in.
 * ──────────────────────────────────────────────────────────────────────────── */

function SectionCard({ C, t, section, state, profile, measuredKeys, open, onToggle, onAnswer }: {
  C: Palette;
  t: (k: string) => string;
  section: QuestionnaireSection;
  state: SectionProgress;
  profile: AthleteVolumeProfile;
  measuredKeys: Set<keyof AthleteVolumeProfile>;
  open: boolean;
  onToggle: () => void;
  onAnswer: (patch: Partial<AthleteVolumeProfile>) => void;
}) {
  return (
    <ACard solid style={{ marginTop: space.lg }}>
      {/* THE HEAD IS THE CONTROL. Tapping the title opens the section — there is
          no separate chevron affordance to hunt for, and the tick is a STATE
          rather than a button, which is why it sits on the far side. */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t(section.titleKey)}, ${state.answered}/${state.total}`}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t(section.titleKey)}</Text>
          {!open && (
            <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: space.xxs }}>
              {t(section.blurbKey)}
            </Text>
          )}
        </View>
        {state.complete ? (
          <ACheckMark on size={20} />
        ) : (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{`${state.answered}/${state.total}`}</Text>
        )}
      </Pressable>

      <ADrawer open={open}>
        <View style={{ paddingTop: space.lg, gap: space.xxl }}>
          {section.questions.map((x) => (
            <QuestionBlock
              key={x.key}
              C={C}
              t={t}
              q={x}
              value={profile[x.key as keyof AthleteVolumeProfile]}
              measured={measuredKeys.has(x.key as keyof AthleteVolumeProfile)}
              profile={profile}
              onAnswer={onAnswer}
            />
          ))}
        </View>
      </ADrawer>
    </ACard>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * ONE QUESTION.
 * ──────────────────────────────────────────────────────────────────────────── */

function QuestionBlock({ C, t, q, value, measured, profile, onAnswer }: {
  C: Palette;
  t: (k: string) => string;
  q: Question;
  value: unknown;
  measured: boolean;
  /** The birth control writes two fields and reads them back, so it needs the
   *  profile rather than the single resolved value the row is labelled with. */
  profile: AthleteVolumeProfile;
  onAnswer: (patch: Partial<AthleteVolumeProfile>) => void;
}) {
  const answered = value !== undefined && value !== null && value !== "";
  const set = (v: unknown) => onAnswer({ [q.key]: v } as Partial<AthleteVolumeProfile>);
  // A measured answer is the app's, not the athlete's, so it is drawn in the
  // accent and says so. It stays EDITABLE wherever the engine lets a typed
  // value win (`withMeasured`); the two `measuredOnly` questions have no typed
  // form at all and render as readings.
  const tone = measured ? txt(C, C.lime) : C.chalk;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ flex: 1, fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "label"), color: C.ash }}
        >
          {t(q.labelKey)}
        </Text>
        {measured && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), color: txt(C, C.lime) }}>
            {t("w.quiz.measured")}
          </Text>
        )}
        {answered && !measured && !q.measuredOnly && (
          <Pressable
            onPress={() => {
              haptic.selection();
              // A date is two fields; clearing one and leaving the other would
              // make a half-answer look answered on every surface that counts.
              if (q.kind === "birth") onAnswer({ birthYear: undefined, birthMonth: undefined });
              else set(undefined);
            }}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`${t("w.quiz.clear")} ${t(q.labelKey)}`}
          >
            <Text style={ty(C, "kicker")}>
              {t("w.quiz.clear")}
            </Text>
          </Pressable>
        )}
      </View>

      {q.measuredOnly ? (
        <Reading C={C} t={t} q={q} value={value} />
      ) : q.kind === "birth" ? (
        <BirthAnswer t={t} profile={profile} onAnswer={onAnswer} />
      ) : q.kind === "choice" ? (
        <Choices C={C} t={t} q={q} value={value as string | undefined} onPick={set} />
      ) : q.kind === "scale" ? (
        <Scale C={C} t={t} q={q} value={value as number | undefined} onPick={set} tone={tone} />
      ) : (
        <NumberAnswer C={C} t={t} q={q} value={value as number | undefined} onPick={set} tone={tone} />
      )}

      {/* THE JUSTIFICATION, AND ONLY WHILE IT IS STILL NEEDED. Twelve questions
          each carrying a permanent sentence is a wall; the same twelve with the
          sentence retiring on answer is a form that gets shorter as you work. */}
      {!answered && (
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash, marginTop: space.md }}>
          {t(q.whyKey)}
        </Text>
      )}
    </View>
  );
}

/** A pill row for a small named set. NOT `ASegment`: a segmented control has no
 *  empty state — it would light one option on an unanswered question and report
 *  an answer nobody gave. */
function Choices({ C, t, q, value, onPick }: {
  C: Palette; t: (k: string) => string; q: Question; value: string | undefined; onPick: (v: string | undefined) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {(q.choices ?? []).map((c) => {
        const on = value === c.value;
        return (
          <Pressable
            key={c.value}
            onPress={() => { haptic.selection(); onPick(on ? undefined : c.value); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{
              minHeight: HIT_TARGET, justifyContent: "center", paddingHorizontal: space.lg,
              borderRadius: RADIUS.pill, borderWidth: 1,
              borderColor: on ? C.lime : C.line,
              backgroundColor: on ? withAlpha(C.lime, ALPHA.fill) : "transparent",
            }}
          >
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ fontFamily: on ? F.bold : F.reg, fontSize: fs.body, color: on ? txt(C, C.lime) : C.ash }}
            >
              {t(c.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A 1–5, drawn as five marks with both ends named.
 *
 * Not a slider and not a number field. Five discrete marks is what the scale
 * actually is — the engine indexes a five-entry table with it — and naming the
 * ends is the difference between a rating and a guess: stress runs 1 = calm to
 * 5 = very stressed, which is the opposite direction to sleep, and an unnamed
 * pair of scales stacked on one card is a coin flip for half the people reading
 * it.
 */
function Scale({ C, t, q, value, onPick, tone }: {
  C: Palette; t: (k: string) => string; q: Question; value: number | undefined; onPick: (v: number | undefined) => void; tone: string;
}) {
  const marks = [1, 2, 3, 4, 5];
  return (
    <View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: space.sm }}>
        {marks.map((m) => {
          const on = value != null && m <= value;
          const exact = value === m;
          return (
            <Pressable
              key={m}
              onPress={() => { haptic.selection(); onPick(exact ? undefined : m); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: exact }}
              accessibilityLabel={`${t(q.labelKey)} ${m}`}
              style={{ flex: 1, minHeight: HIT_TARGET, justifyContent: "center" }}
            >
              <View
                style={{
                  height: SCALE_MARK_H, borderRadius: RADIUS.pill,
                  backgroundColor: on ? tone : C.ink,
                  borderWidth: exact ? 1 : 0, borderColor: exact ? C.lime : "transparent",
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, marginTop: space.xs }}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{t(q.lowKey!)}</Text>
        {value != null && (
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: tone }}>{`${value}/5`}</Text>
        )}
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{t(q.highKey!)}</Text>
      </View>
    </View>
  );
}

/**
 * A quantity — one control, whether or not it has been answered.
 *
 * THE FIELD IS ALWAYS HERE; ONLY THE VALUE IS ABSENT. Unanswered it reads as a
 * dash and the first drag or press gives the answer, from the seed. Answered it
 * is the same control with a figure in it. Nothing is added to the row and
 * nothing is taken away when the state changes, so the athlete never has to
 * find a different affordance depending on what they have already done.
 *
 * THIS REPLACED AN "ANSWER" BUTTON, and that button was a mistake worth naming
 * because the reasoning behind it was half right. A number the athlete has not
 * given must not be DISPLAYED as though they gave it — a seeded 80 kg shown as
 * their body mass is a fabricated measurement, and the model goes on to explain
 * their own recovery ceiling with it. True. But that is a constraint on the
 * VALUE, and it was paid for by gating the CONTROL: every unanswered number
 * cost one tap to reveal a field that could have been there all along, on a
 * screen whose entire purpose is to be answered. Twelve questions, twelve
 * tolls.
 *
 * The old screen used a 30%-wide `TextInput` with `defaultValue`, which is
 * uncontrolled: once the value changed underneath it (a hydrate from the
 * account, a measured fill), the box went on displaying the number it mounted
 * with.
 */
function NumberAnswer({ C, t, q, value, onPick, tone }: {
  C: Palette; t: (k: string) => string; q: Question; value: number | undefined; onPick: (v: number | undefined) => void; tone: string;
}) {
  return (
    <View style={{ opacity: tone === C.chalk ? 1 : 0.92 }}>
      <ANumberField
        value={value}
        // Where the control STARTS when it is first touched — never displayed
        // until then. See the `unset` prop in the kit.
        seed={q.seed ?? q.min ?? 0}
        min={q.min!}
        max={q.max!}
        step={q.step ?? 1}
        suffix={q.unitKey ? t(q.unitKey) : undefined}
        a11y={t(q.labelKey)}
        onChange={onPick}
      />
    </View>
  );
}

/**
 * WHEN WERE YOU BORN — the kit's control, the same one the setup wizard's
 * fifth step draws. It used to be a second copy of that control living here;
 * they agreed only for as long as both were edited together, which is the
 * shape every bug this branch fixed already had.
 *
 * The month is what makes the age EXACT. Asking an age and computing the year
 * was the first fix and it was still a derivation — `currentYear − age` holds
 * only once the birthday has passed, an error the same size as the recovery
 * factor's own yearly step. Someone born in December is a year younger than
 * that arithmetic thinks for eleven months of every year.
 *
 * The year answers alone: a profile with a year and no month keeps the honest
 * ±1 reading (`effectiveAgeYears`), which is what a partial answer supports.
 */
function BirthAnswer({ t, profile, onAnswer }: {
  t: (k: string) => string;
  profile: AthleteVolumeProfile;
  onAnswer: (patch: Partial<AthleteVolumeProfile>) => void;
}) {
  return (
    <ABirthField
      year={profile.birthYear}
      month={profile.birthMonth}
      months={MONTH_KEYS.map(t)}
      a11y={t("w.quiz.field.birthYear")}
      onChange={({ year, month }) => onAnswer({ birthYear: year, birthMonth: month })}
    />
  );
}

/** A figure the app measured and the athlete cannot type over — shown, with
 *  where it came from, because it moved their ceiling and this is the page that
 *  says what moved it. */
function Reading({ C, t, q, value }: { C: Palette; t: (k: string) => string; q: Question; value: unknown }) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : null;
  const dp = String(q.step ?? 1).split(".")[1]?.length ?? 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ fontFamily: F.black, fontSize: fs.headline, color: n == null ? C.ash : txt(C, C.lime), lineHeight: leading(fs.headline, "flush"), letterSpacing: trackFigure(fs.headline) }}
      >
        {n == null ? "—" : n.toFixed(dp)}
      </Text>
      {q.unitKey && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t(q.unitKey)}</Text>
      )}
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * WHAT YOUR ANSWERS CHANGED.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The multipliers, with the value that earned each one.
 *
 * This is the argument for the whole screen and it belongs ON the screen: a form
 * that asks twelve questions and shows its effect two taps away on another
 * surface is asking for trust. Here, "advanced" and "+15% both ends" sit on one
 * row, so answering is visibly a cause.
 */
function Changed({ C, t, factors }: {
  C: Palette; t: (k: string) => string; factors: { key: string; affects: string; multiplier: number; value: string }[];
}) {
  const real = factors.filter((f) => f.multiplier !== 1);
  return (
    <ACard solid style={{ marginTop: space.lg }}>
      <ASection lead title={t("w.quiz.changed.title")} />
      {real.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>
          {t("w.quiz.changed.none")}
        </Text>
      ) : (
        <View style={{ gap: space.md }}>
          {real.map((f) => (
            <View key={f.key} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>
                  {t(factorLabelKey(f.key as never))}
                </Text>
                <Text style={{ ...ty(C, "kicker"), marginTop: space.xxs  }}>
                  {`${f.value} — ${t(factorAffectsKey(f.affects as never))}`}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: F.monoBold, fontSize: fs.bodyLg,
                  color: f.multiplier > 1 ? txt(C, C.lime) : C.chalk,
                }}
              >
                {factorPercent(f.multiplier)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ACard>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE MODEL — the machine, behind the disclosure.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The landmark table, the two switches and the block.
 *
 * Unchanged in what it can do and moved in what it claims to be. The one real
 * edit is that the per-muscle fields are `AStepper` rows rather than
 * thirty-five 40dp-wide `TextInput`s: those were below the touch floor, keyboard
 * only, and — being `defaultValue` — stopped reflecting the model the moment it
 * changed underneath them, which on a screen whose whole job is to show what an
 * edit did was the worst place in the app for a stale figure.
 */
function TheModel({ C, t, prefs, resolved, baseline }: {
  C: Palette;
  t: (k: string) => string;
  prefs: ReturnType<typeof useLoggerPrefs>;
  resolved: { landmarks: Record<MuscleGroup, VolumeLandmark> };
  /** The SAME resolution without the athlete's own edits — what makes an edit
   *  legible. A typed landmark rewrites every band, prescription and verdict on
   *  the Volume screen, and without a baseline to diff against there is no way
   *  to tell an edit apart from the model's own estimate. */
  baseline: { landmarks: Record<MuscleGroup, VolumeLandmark> };
}) {
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const block = resolveBlock(prefs.volumeBlock);
  const ramp = blockRamp(block, resolved.landmarks);
  const current = ramp.find((c) => c.current) ?? ramp[0];
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const prose = { fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash } as const;

  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, v: number) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m], [k]: Math.max(0, Math.round(v)) } };
    setLoggerPref("landmarkOverrides", next);
  };
  const clearMuscle = (m: MuscleGroup) => {
    const next = { ...prefs.landmarkOverrides };
    delete next[m];
    setLoggerPref("landmarkOverrides", next);
  };

  return (
    <View style={{ paddingTop: space.lg }}>
      {/* ── LANDMARKS ─────────────────────────────────────────────────────── */}
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "label"), color: C.ash }}>
        {t("w.analyze.model.landmarks")}
      </Text>
      <Text style={{ ...prose, marginTop: space.sm }}>{t("w.analyze.model.landmarksSub")}</Text>
      <View style={{ marginTop: space.md }}>
        {(Object.keys(resolved.landmarks) as MuscleGroup[]).map((m) => {
          const on = muscle === m;
          const edited = !!prefs.landmarkOverrides[m] && Object.keys(prefs.landmarkOverrides[m]!).length > 0;
          const l = resolved.landmarks[m];
          return (
            <View key={m}>
              <Pressable
                onPress={() => { haptic.selection(); setMuscle(on ? null : m); }}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: HIT_TARGET }}
              >
                <Text style={{ flex: 1, fontFamily: on ? F.bold : F.reg, fontSize: fs.body, color: edited ? txt(C, C.lime) : C.chalk }}>
                  {ml(m)}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{`${l.mev}–${l.mrv}`}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{on ? "−" : "＋"}</Text>
              </Pressable>
              <ADrawer open={on}>
                <View style={{ gap: space.sm, paddingBottom: space.md }}>
                  {FIELDS.map((k, i) => {
                    // WHAT THE EDIT DID, on the row that did it. Computed from
                    // the two RESOLUTIONS rather than from the override map, so
                    // it reports the EFFECT of an edit and not merely that one
                    // exists — an override equal to the estimate is not a change.
                    const was = baseline.landmarks[m][k];
                    return (
                      <View key={k}>
                        <AStepper
                          label={FIELD_LABEL[i]}
                          value={l[k]}
                          min={0}
                          max={60}
                          onChange={(v) => editField(m, k, v)}
                        />
                        {l[k] !== was && (
                          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: -space.xxs }}>
                            {`${t("w.analyze.model.estimate")} ${was}`}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                  {edited && (
                    <Pressable
                      onPress={() => { haptic.selection(); clearMuscle(m); }}
                      accessibilityRole="button"
                      style={{ alignSelf: "flex-start", minHeight: HIT_TARGET, justifyContent: "center" }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.vol.resetDefaults")}</Text>
                    </Pressable>
                  )}
                </View>
              </ADrawer>
            </View>
          );
        })}
      </View>

      {/* ── HOW IT BEHAVES ────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: C.line }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "label"), color: C.ash }}>
          {t("w.analyze.model.behaviour")}
        </Text>

        <SwitchRow
          C={C}
          label={t("w.analyze.vol.adaptive")}
          on={prefs.adaptiveLandmarks}
          onLabel={t(prefs.adaptiveLandmarks ? "common.on" : "common.off")}
          onPress={() => setLoggerPref("adaptiveLandmarks", !prefs.adaptiveLandmarks)}
        />
        <Text style={{ ...prose, marginTop: space.sm }}>{t("w.analyze.vol.adaptiveWhy")}</Text>

        <SwitchRow
          C={C}
          label={t("w.analyze.vol.thisBlock")}
          on={prefs.periodizeVolume}
          onLabel={t("w.analyze.vol.periodize")}
          onPress={() => setLoggerPref("periodizeVolume", !prefs.periodizeVolume)}
          style={{ marginTop: space.lg }}
        />
        {!prefs.periodizeVolume ? (
          <Text style={{ ...prose, marginTop: space.sm }}>{t("w.analyze.vol.periodizeWhy")}</Text>
        ) : (
          <View style={{ gap: space.ms, marginTop: space.md }}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.chalk }}>
              {t("w.analyze.vol.weekPre")}{block.week}{t("w.analyze.vol.weekOf")}{block.weeks}
              <Text style={{ color: C.ash }}>{" — "}</Text>
              <Text style={{ color: txt(C, current?.kind === "deload" ? C.blue : C.lime) }}>{current ? t(blockKindKey(current.kind)) : ""}</Text>
            </Text>
            <AStepper label={t("w.analyze.vol.currentWeek")} value={block.week} min={1} max={block.weeks} onChange={(v) => setBlockPref(prefs.volumeBlock, { week: v })} />
            <AStepper label={t("w.analyze.vol.blockLength")} value={block.weeks} suffix={t("w.analyze.vol.weeksShort")} min={1} max={16} onChange={(v) => setBlockPref(prefs.volumeBlock, { weeks: v })} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.analyze.vol.lastLoadWeek")}</Text>
              <View style={{ flexDirection: "row", gap: space.xs }}>
                {(["mav", "overreach"] as const).map((k) => (
                  <Pill key={k} C={C} on={block.peakAt === k} label={t(k === "mav" ? "w.analyze.vol.peakMav" : "w.analyze.vol.peakOverreach")} onPress={() => setBlockPref(prefs.volumeBlock, { peakAt: k })} />
                ))}
              </View>
            </View>
            <SwitchRow
              C={C}
              label={t("w.analyze.vol.deloadLast")}
              on={!!block.deloadLast}
              onLabel={t(block.deloadLast ? "w.analyze.vol.done" : "w.analyze.vol.deloadLast")}
              onPress={() => setBlockPref(prefs.volumeBlock, { deloadLast: !block.deloadLast })}
            />
          </View>
        )}
      </View>

      {/* ── START AGAIN ───────────────────────────────────────────────────── */}
      <Pressable
        onPress={() => { haptic.selection(); setQuestionnaire({}); setLoggerPref("landmarkOverrides", {}); }}
        accessibilityRole="button"
        style={{ alignSelf: "flex-start", minHeight: HIT_TARGET, justifyContent: "center", marginTop: space.xl }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.quiz.reset")}</Text>
      </Pressable>
    </View>
  );
}

const setBlockPref = (block: VolumeBlock, patch: Partial<VolumeBlock>) =>
  setLoggerPref("volumeBlock", resolveBlock({ ...resolveBlock(block), ...patch }));

function SwitchRow({ C, label, on, onLabel, onPress, style }: {
  C: Palette; label: string; on: boolean; onLabel: string; onPress: () => void; style?: object;
}) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md }, style]}>
      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{label}</Text>
      <Pill C={C} on={on} label={onLabel} onPress={onPress} role="switch" />
    </View>
  );
}

/** The one pill this screen's machine half uses. */
function Pill({ C, on, label, onPress, role = "radio" }: {
  C: Palette; on: boolean; label: string; onPress: () => void; role?: "radio" | "switch";
}) {
  return (
    <Pressable
      onPress={() => { haptic.selection(); onPress(); }}
      accessibilityRole={role}
      accessibilityState={role === "switch" ? { checked: on } : { selected: on }}
      style={{
        minHeight: HIT_TARGET, justifyContent: "center", paddingHorizontal: space.md,
        borderRadius: RADIUS.pill, borderWidth: 1,
        borderColor: on ? C.lime : C.line,
        backgroundColor: on ? withAlpha(C.lime, ALPHA.fill) : "transparent",
      }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash }}>{label}</Text>
    </Pressable>
  );
}

/** Re-exported for the volume screen's "about you" door, so the two surfaces
 *  cannot disagree about which questions exist. */
export const ASKED_QUESTIONS = QUESTIONNAIRE.flatMap((s) => s.questions.filter(isAsked));

/**
 * ABOUT YOU — the card on Profile, and the questionnaire's permanent home.
 *
 * ── WHY PROFILE, AND NOT AN ANALYSIS TAB ───────────────────────────────────
 *
 * The questionnaire had two doors, both of them deep inside Performance: one in
 * a sheet reached through a drawer on the Volume card, one at the foot of the
 * monthly story. Both are places you arrive at having already gone looking. A
 * screen that holds a person's body, training age and recovery is not something
 * anyone should have to hunt for — and when they do go looking, they look where
 * their name and their photo are. Profile is where identity lives.
 *
 * It is deliberately placed BESIDE `LearnedLead` — under it until the You tab's
 * leads became a rail — and the pairing is the point: what the app WORKED OUT
 * about you, and what you TOLD it. Two halves of one question, answered by two
 * different authorities, adjacent. Both draw through the shared `LeadCard`, so
 * the pair cannot disagree about the shape of a claim.
 *
 * The card leads with the gap rather than the score. "Next: body mass" is a
 * thing a person can act on; a percentage on its own is a grade.
 */
export function AboutYouLead({ sessions, onOpen, inline }: { sessions: LoggedSession[]; onOpen: () => void;
  /** Rendered inside the You tab's LeadRail — see LearnedLead's note. */
  inline?: boolean }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { measuredKeys, profile } = useVolumeModel(sessions);
  const progress = useMemo(
    () => questionnaireProgress(profile, measuredKeys as Set<string>),
    [profile, measuredKeys],
  );
  const answered = progress.sections.reduce((n, s) => n + s.answered, 0);
  const total = progress.sections.reduce((n, s) => n + s.total, 0);
  const headline = progress.next ? t(progress.next.labelKey) : t("w.quiz.leadDone");

  return (
    <LeadCard
      inline={inline}
      kicker={t("w.quiz.title")}
      title={progress.complete ? t("w.quiz.leadDone") : t("w.quiz.leadNext").replace("{q}", headline)}
      figure={`${Math.round(progress.score * 100)}%`}
      unit={t("w.quiz.leadUnit")}
      meta={t("w.quiz.leadMeta").replace("{n}", String(answered)).replace("{m}", String(total))}
      onPress={onOpen}
      a11yLabel={[t("w.quiz.title"), headline, `${answered}/${total}`].filter(Boolean).join(" – ")}
    />
  );
}
