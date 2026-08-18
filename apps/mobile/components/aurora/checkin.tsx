import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import {
  CHECKIN_METRICS,
  CHECKIN_SCALE,
  checkinScaleFeeling,
  checkinMetricWordKey,
  checkinMetricPatch,
  type CheckinMetricKey,
  type ReadinessFeeling,
  answeredMetrics,
  localDayKey,
  checkinSteps,
  FEELS,
  type CheckinSessionRef,

  ALPHA, STATE_OPACITY } from "@hybrid/core";
import { createCheckin, fetchBillingStatus, fetchCheckins, patchSessionFeel } from "../../lib/api";
import { askPushOnce } from "../../lib/push";
import { useRevalidate } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { haptic } from "../../lib/haptics";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, tracking, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AStepRail, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import ReadinessFace from "./readiness-face";
import { useConfirm } from "./confirm";
import { withAlpha } from "./field";
import { Mark } from "./mark";

type Ratings = Record<CheckinMetricKey, number>;

const ACCENT: Record<ReadinessFeeling, keyof Palette> = { primed: "lime", good: "blue", flat: "amber", wrecked: "red" };
const feelingColor = (C: Palette, feeling: ReadinessFeeling) => txt(C, C[ACCENT[feeling]] as string);

/** AURORA Daily check-in (mobile) — a GUIDED, one-question-per-card flow. Steps
 *  1–4 walk Energy / Sleep / Soreness / Mood with a big reactive readiness face;
 *  the final card collects weight, adherence, a note + share-with-coach and
 *  submits. Same createCheckin flow as before. Mirrors the web wizard.
 *
 *  `embedded` drops the screen chrome (header + card shell) so the SAME wizard
 *  can run inline inside another card — Today's feeling card hosts it so the
 *  full check-in never leaves the homepage. `startStep` opens on a later
 *  question (Today's one-tap face already answers Energy, so it starts at
 *  Sleep) and becomes the floor the Back button can't go under.
 *
 *  `onDone` fires on a successful submit so the host can REFRESH. It must not
 *  dismiss: the host used to close the sheet the instant the POST returned, so
 *  the "Check-in logged" confirmation this flow renders was never once seen and
 *  finishing the check-in looked exactly like the app dropping it. `onClose` is
 *  the dismissal, and the athlete presses it. */
export default function AuroraCheckin({ embedded = false, startStep = 0, sessions = [], onDone, onClose }: {
  embedded?: boolean;
  startStep?: number;
  /** The day's sessions — one effort question each. Empty on a rest day, which
   *  makes the flow exactly the four daily questions it has always been. */
  sessions?: CheckinSessionRef[];
  onDone?: () => void;
  onClose?: () => void;
} = {}) {
  const { notify } = useConfirm();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const revalidate = useRevalidate();
  const [saving, setSaving] = useState(false);
  const [paid, setPaid] = useState(false);
  // The first question this instance owns — also the Back floor, so an embedded
  // flow can't reverse into a step its host already answered.
  // The flow is the four daily questions, then one effort question per session
  // the athlete trained that day, then details — see core/checkin-flow.ts.
  const steps = useMemo(() => checkinSteps(sessions), [sessions]);
  const minStep = Math.min(Math.max(Math.trunc(startStep) || 0, 0), steps.length - 1);
  const [step, setStep] = useState(minStep); // 0..3 metrics, 4 = details
  const [done, setDone] = useState(false);
  // ── SAVED vs UNSAVED ───────────────────────────────────────────────────────
  // Re-opening a day that is already fully answered used to look exactly like a
  // form that had never been sent: live scale tiles under a "Submit check-in"
  // button. The athlete could not tell whether their answers had landed, and
  // pressing Submit was the only way to find out.
  //
  // So the flow now knows the difference between "answered" and "answered AND
  // stored". `storedMetrics` is what the SERVER holds (from the prefill below);
  // `dirty` is anything the athlete has changed since the last successful
  // write. Together they decide `locked` — read-back mode, with the options
  // muted and an Edit button instead of a Submit. Mirrors the web wizard.
  const [storedMetrics, setStoredMetrics] = useState<Set<CheckinMetricKey>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [editing, setEditing] = useState(false);
  /** The confirmation card just shown is for an EDIT, not a first log. */
  const [updated, setUpdated] = useState(false);
  // The face each step SHOWS. Neutral until the athlete touches it — which is
  // not the same as an answer, hence `answered` below.
  const [ratings, setRatings] = useState<Ratings>({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
  // Which metrics the athlete has ACTUALLY answered, here or earlier today.
  // Everything else is submitted as null: a question walked past without a tap
  // must not be stored as a middling 3 that the recovery models then read as a
  // measurement. See core/checkin-flow.ts.
  const [answered, setAnswered] = useState<Set<CheckinMetricKey>>(new Set());
  const answer = (k: CheckinMetricKey, v: number) => {
    setRatings((s) => ({ ...s, [k]: v }));
    setAnswered((s) => (s.has(k) ? s : new Set(s).add(k)));
    setDirty(true);
  };
  // Per-session effort — "how hard was THAT", which is a different question
  // from "how are you", is per session rather than per day, and is what the
  // effort model, fatigue, ACWR and injury risk have always read off
  // Session.feel. Seeded from whatever is already recorded.
  const [efforts, setEfforts] = useState<Record<string, number>>(() =>
    Object.fromEntries(sessions.filter((x) => typeof x.feel === "number").map((x) => [x.id, x.feel as number])),
  );
  const [effortAnswered, setEffortAnswered] = useState<Set<string>>(
    () => new Set(sessions.filter((x) => typeof x.feel === "number").map((x) => x.id)),
  );
  const answerEffort = (id: string, v: number) => {
    setEfforts((s) => ({ ...s, [id]: v }));
    setEffortAnswered((s) => (s.has(id) ? s : new Set(s).add(id)));
    setDirty(true);
  };
  // The ONLY thing the details card still collects besides the answers. The
  // weight / adherence / note fields are gone: weight has a real home in the
  // body log (one canonical weigh-in, not a second one buried in a check-in),
  // adherence is something the app can count off the plan rather than ask for,
  // and three blank optional boxes under a finished check-in made the card look
  // unfinished when it wasn't.
  const [sharedWithCoach, setSharedWithCoach] = useState(false);
  const toggleShare = () => { setSharedWithCoach((v) => !v); setDirty(true); };
  // HAS THE STORED CHECK-IN LANDED YET? Until it has, this component knows
  // nothing about the day and must not pretend otherwise. It used to render
  // immediately off empty state: an athlete whose day was 4/4 opened the sheet
  // onto "Today's read — 0 / 4 answered", four dashes and a Submit button, which
  // flipped to the saved read-back a moment later when the fetch landed. A blank
  // form is not a neutral placeholder — it is a wrong answer.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { fetchBillingStatus().then((b) => setPaid(b?.entitlement === "paid")).catch(() => {}); }, []);

  // Prefill from TODAY's check-in so the guided flow REFINES the quick one-tap
  // readiness (or a prior full check-in) instead of resetting to neutral — the
  // server upserts the same day, so what's shown here is what gets updated. A
  // fresh "New check-in" (restart) is exempt: it re-arms the neutral defaults.
  useEffect(() => {
    let alive = true;
    fetchCheckins()
      .then((list) => {
        if (!alive) return;
        // One day-key helper, shared with every other surface — this used to
        // roll its own `toDateString()` comparison.
        const today = localDayKey(Date.now());
        const c = list.find((x) => x?.weekOf && localDayKey(x.weekOf) === today);
        // What the server holds, tracked even when it holds nothing — an empty
        // set is the honest answer for a day with no row, and it keeps `locked`
        // false.
        setStoredMetrics(c ? new Set(answeredMetrics(c)) : new Set());
        if (!c) return;
        // A stored value IS an answer — but only the ones actually stored.
        setAnswered((prev) => {
          const next = new Set(prev);
          for (const k of answeredMetrics(c)) next.add(k);
          return next;
        });
        setRatings((s) => ({
          energy: c.energy ?? s.energy,
          sleep: c.sleep ?? s.sleep,
          soreness: c.soreness ?? s.soreness,
          mood: c.mood ?? s.mood,
        }));
        setSharedWithCoach((v) => v || !!c.sharedWithCoach);
      })
      .catch(() => {})
      // Hydrated either way: a failed read is still a finished read, and holding
      // the card forever would be worse than opening on what we have.
      .finally(() => { if (alive) setHydrated(true); });
    return () => { alive = false; };
  }, []);

  const current = steps[step];
  const isDetails = current?.kind === "details";

  // Whether THIS run has an answer for a step — the local sets, not the stored
  // row, so the progress bar and the review reflect what the athlete has
  // actually done rather than how far they have scrolled.
  const isAnswered = (st: (typeof steps)[number]) =>
    st.kind === "metric" ? answered.has(st.key) : st.kind === "effort" ? effortAnswered.has(st.session.id) : false;
  const questions = steps.filter((st) => st.kind !== "details");
  const answeredCount = questions.filter(isAnswered).length;
  const allAnswered = answeredCount === questions.length;
  /** The step index a metric lives at — the review's dashes jump back to it. */
  const stepOf = (key: CheckinMetricKey) => steps.findIndex((st) => st.kind === "metric" && st.key === key);

  // Every question answered AND on the server: the metrics from the stored row,
  // the efforts from each session's own stored `feel`. A submit this run counts
  // too — the refetch that would prove it lands a beat later, and the flow must
  // not call a just-written check-in unsaved in the meantime.
  const storedAll = questions.every((st) =>
    st.kind === "metric" ? storedMetrics.has(st.key) : st.kind === "effort" ? typeof st.session.feel === "number" : true,
  );
  const savedAll = allAnswered && !dirty && (storedAll || submittedOnce);
  /** READ-BACK MODE: the day is complete and stored, and the athlete hasn't
   *  asked to change it. Answers stay legible; the CONTROLS go quiet and the
   *  Submit button is replaced by Edit, so a saved check-in can never be
   *  mistaken for an unsent one. */
  const locked = hydrated && savedAll && !editing && !done;

  const submit = async () => {
    // Whether this write CHANGES a check-in that already existed — the
    // confirmation says "updated" rather than "logged" so an edit doesn't read
    // as a second, duplicate check-in.
    const isUpdate = editing || storedAll;
    setSaving(true);
    const r = await createCheckin({
      weekOf: new Date().toISOString(),
      // ONLY what this flow actually holds. A metric the athlete walked past is
      // OMITTED, not sent as null: omitted leaves whatever is stored alone,
      // which matters because this flow usually opens mid-day on a row that
      // already has answers in it. Nothing is invented either — the server
      // writes null for a genuinely new day.
      ...checkinMetricPatch(ratings, answered),
      sharedWithCoach: paid ? sharedWithCoach : false,
    });
    setSaving(false);
    if (!r.ok) {
      if (r.cooldownMs != null) {
        const mins = Math.ceil(r.cooldownMs / 60000);
        notify(t("w.recovery.checkins.cooldownTitle"), `${t("w.recovery.checkins.cooldownBody")} ${Math.floor(mins / 60)}h ${mins % 60}m.`);
      } else {
        notify(t("w.recovery.checkins.errSubmit"), t("w.recovery.checkins.errSaveBody"));
      }
      return;
    }
    // Effort answers go where every engine already reads them: each session's
    // own `feel`. Best effort and in parallel — a failed effort write must not
    // discard the daily check-in that already succeeded.
    if (effortAnswered.size) {
      await Promise.all([...effortAnswered].map((id) => patchSessionFeel(id, { feel: efforts[id]! }).catch(() => false)));
      revalidate.sessions();
    }

    setDone(true);
    setUpdated(isUpdate);
    // The write landed: nothing local is outstanding any more, and re-opening
    // the flow from here on reads back rather than re-asking.
    setDirty(false);
    setSubmittedOnce(true);
    setStoredMetrics(new Set(answered));
    setEditing(false);
    revalidate.recovery();
    // The check-in row itself is cached now (qk.checkins) and drives today's
    // feeling card + the prescription's readiness nudge — so the write has to
    // drop it, or the athlete's own answer is the thing that looks stale.
    revalidate.checkins();
    // THE ONE PLACE THE APP ASKS FOR NOTIFICATION PERMISSION BY ITSELF, and the
    // moment is the argument for it: the athlete has just done the exact thing
    // the morning nudge exists to bring them back for, so "shall I remind you
    // tomorrow?" is a question they can answer. Asked once ever, and only if iOS
    // has never asked (lib/push.ts askPushOnce) — a prompt at launch would spend
    // the single permission on somebody who hasn't seen a readiness read yet.
    askPushOnce().catch(() => {});
    onDone?.();
  };

  const restart = () => {
    setDone(false); setStep(minStep);
    setRatings({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
    setAnswered(new Set());
    setEfforts({});
    setEffortAnswered(new Set());
    setSharedWithCoach(false);
    // A blank re-run is an EDIT of the same day (the server upserts), so it
    // opens live rather than in read-back mode.
    setEditing(true); setUpdated(false); setDirty(false);
  };

  /** A 1–5 / effort tile. LOCKED it is a read-back, not a control: the lime
   *  selection drops to a neutral outline and the unpicked options fade back, so
   *  the row shows what was answered instead of inviting another answer. */
  const tile = (sel: boolean) => ({
    flex: 1, aspectRatio: 1, borderRadius: RADIUS.field, alignItems: "center" as const, justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: sel ? (locked ? C.ash : C.lime) : C.line,
    backgroundColor: sel ? (locked ? withAlpha(C.ash, ALPHA.solid) : withAlpha(C.lime, ALPHA.fill)) : C.ink,
    opacity: locked && !sel ? STATE_OPACITY.disabled : 1,
  });

  /* THE STEP-BACK. It was a hand-rolled outline pill, and it declared no height
     at all — paddingHorizontal and nothing else. On screen it looked right only
     because the APill beside it stretched the row; rendered on its own it
     collapsed under the 44dp touch floor. `APill variant="outline"` is the same
     drawing with the floor, the press feedback and the accessibility contract
     attached, and it can no longer disagree with the pill it sits next to about
     how tall a button is. */
  const backBtn = (
    <APill label={t("w.recovery.checkins.prev")} variant="outline" onPress={() => setStep((s) => s - 1)} />
  );

  const wizardBody = (
    <>
      {/* PROGRESS = ANSWERS, NOT POSITION. This filled every bar up to the
          current step, so walking to the end without tapping anything drew a
          complete bar over a check-in that held one answer — the screen
          asserting "done" while the review card underneath showed dashes. A bar
          is solid when its question is answered, faint while you're on it, and
          empty otherwise.
          THAT RULE IS THE PART THAT IS LOCAL. The DRAWING is the kit's
          `AStepRail` now, shared with the other two wizards, and the rule
          survives as the marks this screen hands it — which is where a rule
          about THIS screen's meaning belongs. The rail also gained a travelling
          fill and a `progressbar` role it never declared. */}
      <AStepRail marks={steps.map((st, i) => (done || isAnswered(st) ? "done" : i === step ? "current" : "empty"))} />

      {/* SAVED / EDITING — the state banner. Locked, it says the answers are
          stored and offers the one control that changes that; editing, it says
          the flow is live again so the muted tiles coming back to full colour is
          explained rather than merely observed. */}
      {locked || (editing && !done) ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, paddingHorizontal: 12, paddingVertical: 12, borderRadius: RADIUS.field, backgroundColor: locked ? withAlpha(C.lime, ALPHA.wash) : "transparent", borderWidth: 1, borderColor: locked ? withAlpha(C.lime, ALPHA.edge) : C.line }}>
          <AuroraIcon name={locked ? "check-circle" : "edit"} size={20} color={locked ? txt(C, C.lime) : C.ash} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{t(locked ? "w.recovery.checkins.savedTitle" : "w.recovery.checkins.edit")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t(locked ? "w.recovery.checkins.savedSub" : "w.recovery.checkins.editingSub")}</Text>
          </View>
        </View>
      ) : null}

      {!hydrated ? (
        // Holding, not guessing. One quiet line rather than a form that would
        // have to correct itself the moment the day's check-in arrives.
        <View style={{ alignItems: "center", justifyContent: "center", minHeight: 220 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.checkins.loading")}</Text>
        </View>
      ) : done ? (
        <View style={{ alignItems: "center", paddingVertical: 16 }}>
          <AuroraIcon name="check-circle" size={54} color={txt(C, C.lime)} />
          {/* "Updated" rather than "logged" when the day already had a
              check-in — an edit is not a second check-in, and calling it one
              would suggest the first is still sitting there somewhere. */}
          <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, marginTop: 16 }}>{t(updated ? "w.recovery.checkins.updatedTitle" : "w.recovery.checkins.loggedTitle")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: leading(fs.caption), maxWidth: 280 }}>
            {t(!allAnswered ? "w.recovery.checkins.loggedPartialSub" : updated ? "w.recovery.checkins.updatedSub" : "w.recovery.checkins.loggedSub")}
          </Text>
          {/* What actually landed. The count is the same one the Today card
              shows, so the two can't tell different stories about the same
              check-in. */}
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: allAnswered ? txt(C, C.lime) : C.ash, marginTop: 10 }}>
            {answeredCount} / {questions.length} {t("w.home.today.answered")}
          </Text>
          <View style={{ flexDirection: "row", gap: space.ms, marginTop: 20 }}>
            {/* Still blank? Go straight back to the first one — the day is
                upserted, so answering more is an edit, not a second check-in. */}
            {!allAnswered ? (
              <APill
                label={t("w.recovery.checkins.answerRest")}
                onPress={() => { setDone(false); setStep(Math.max(minStep, steps.findIndex((st) => st.kind !== "details" && !isAnswered(st)))); }}
                style={{ paddingHorizontal: 20, paddingVertical: 16 }}
              />
            ) : null}
            {/* Embedded, the host is a sheet the athlete now dismisses
                themselves — it no longer vanishes out from under the
                confirmation. */}
            {embedded && onClose ? (
              <APill label={t("w.recovery.checkins.doneClose")} onPress={onClose} style={{ paddingHorizontal: 28, paddingVertical: 16 }} />
            ) : (
              <APill label={t("w.recovery.checkins.newCheckin")} onPress={restart} style={{ paddingHorizontal: 28, paddingVertical: 16 }} />
            )}
          </View>
        </View>
      ) : isDetails ? (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash, marginTop: 16 }}>
            {t("w.recovery.checkins.step")} {steps.length} / {steps.length} — {t("w.recovery.checkins.detailsStep")}
          </Text>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk, marginTop: 8 }}>{t("w.recovery.checkins.reviewTitle")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {CHECKIN_METRICS.map((m) => {
              // An unanswered metric shows a dash, not a neutral face — a face
              // would claim a reading that was never given. The dash is a
              // BUTTON back to that question, because a review that can only
              // report the gap leaves the athlete to guess how to close it.
              const on = answered.has(m.key);
              const to = stepOf(m.key);
              return (
                <Pressable
                  key={m.key}
                  onPress={() => !locked && to >= 0 && setStep(to)}
                  disabled={locked}
                  accessibilityRole="button"
                  accessibilityLabel={`${t(m.labelKey)} – ${on ? t(checkinMetricWordKey(m.key, ratings[m.key])) : t("w.recovery.checkins.notAnswered")}`}
                  // LOCKED, THE REVIEW IS A REPORT, NOT A CONTROL. Left at full
                  // colour and still tapping through to its question, it read as
                  // "edit any of this whenever" — which is exactly what the Edit
                  // button is for. Muted here, restored the moment Edit is pressed.
                  style={{ flex: 1, alignItems: "center", gap: 6, backgroundColor: C.ink, borderWidth: 1, borderStyle: on ? "solid" : "dashed", borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, opacity: locked ? 0.45 : on ? 1 : 0.6 }}
                >
                  {on ? (
                    <ReadinessFace feeling={checkinScaleFeeling(ratings[m.key])} scale={0.76} />
                  ) : (
                    <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash }}>–</Text>
                  )}
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>{t(m.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
          {/* Say what the dashes are for. Without this the review reads as a
              verdict on a check-in that is already over. */}
          {!allAnswered ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>
              {answeredCount} / {questions.length} {t("w.home.today.answered")} – {t("w.recovery.checkins.reviewMissing")}
            </Text>
          ) : null}

          <Pressable
            onPress={() => { if (!paid) return; haptic.selection(); toggleShare(); }}
            disabled={!paid || locked}
            accessibilityRole="checkbox"
            accessibilityLabel={t("w.recovery.checkins.shareCoach")}
            accessibilityState={{ checked: !!(sharedWithCoach && paid), disabled: !paid || locked }}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 16, padding: 16, borderRadius: RADIUS.field, borderWidth: 1, borderColor: sharedWithCoach && paid ? C.lime : C.line, backgroundColor: sharedWithCoach && paid ? withAlpha(C.lime, ALPHA.fill) : "transparent", opacity: !paid ? 0.6 : locked ? STATE_OPACITY.disabled : 1 }}
          >
            {sharedWithCoach && paid ? <AuroraIcon name="check" size={22} color={txt(C, C.lime)} /> : <AuroraIcon name="lock" size={20} color={C.ash} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.checkins.shareCoach")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{paid ? t("w.recovery.checkins.shareCoachOnShort") : t("w.recovery.checkins.shareCoachOffShort")}</Text>
            </View>
          </Pressable>

          {/* THE SUBMIT IS GONE WHEN THERE IS NOTHING TO SUBMIT. Leaving it
              under a stored check-in was the whole confusion: a button that says
              "Submit check-in" over answers that were already submitted reads as
              work still outstanding. Locked, the card offers Done (or nothing
              but Back) and the banner's Edit is the way back in. */}
          <View style={{ flexDirection: "row", gap: space.ms, marginTop: 16 }}>
            {!locked && step > minStep ? backBtn : null}
            {locked ? (
              <>
                {/* EDIT LIVES HERE AND ONLY HERE — beside Done, where the
                    athlete already is when they decide the read is wrong. */}
                <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={t("w.recovery.checkins.edit")}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line }}>
                  <AuroraIcon name="edit" size={16} color={C.ash} />
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.checkins.edit")}</Text>
                </Pressable>
                {onClose ? <APill label={t("w.recovery.checkins.doneClose")} onPress={onClose} style={{ flex: 1 }} /> : null}
              </>
            ) : (
              <APill
                label={t(editing || storedAll ? "w.recovery.checkins.saveChanges" : "w.recovery.checkins.submit")}
                savingLabel={t("w.recovery.checkins.submitting")}
                state={saving ? "saving" : "idle"}
                onPress={submit}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </>
      ) : current?.kind === "effort" ? (
        (() => {
          // HOW HARD WAS THAT — the one question that is genuinely per session
          // rather than per day. Same card, same 1–5 row; the words are the
          // effort scale (Easy … All out) because it is not asking how you are,
          // it is asking what the session cost.
          const sess = current.session;
          const val = efforts[sess.id];
          const touched = effortAnswered.has(sess.id);
          const def = FEELS.find((f) => f.value === val);
          return (
            <View style={{ alignItems: "center" }}>
              <Text style={{ alignSelf: "flex-start", fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash, marginTop: 16 }}>
                {t("w.recovery.checkins.step")} {step + 1} / {steps.length} — {t("w.recovery.checkins.effort")}
              </Text>
              <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking.display, color: C.chalk, textAlign: "center", marginTop: 16, maxWidth: 280 }}>{t("w.recovery.checkins.qEffort")}</Text>
              <Text numberOfLines={2} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 8, maxWidth: 260 }}>{sess.title}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: fs.title, marginTop: 20, color: def && touched ? txt(C, C[def.tone as "lime"] ?? C.chalk) : C.ash }}>
                {touched && def ? t(def.labelKey) : t("w.recovery.checkins.notAnswered")}
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 16, alignSelf: "stretch" }}>
                {FEELS.map((f) => {
                  const sel = touched && val === f.value;
                  return (
                    <Pressable key={f.value} onPress={() => answerEffort(sess.id, f.value)} disabled={locked}
                      accessibilityRole="radio" accessibilityLabel={`${sess.title}: ${t(f.labelKey)}`} accessibilityState={{ selected: sel, disabled: locked }}
                      style={tile(sel)}>
                      <Mark mark={f.mark} size={fs.headline} color={sel ? txt(C, C[f.tone as "lime"] ?? C.chalk) as string : C.ash} />
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: "row", gap: space.ms, marginTop: 24, alignSelf: "stretch" }}>
                {step > minStep ? backBtn : null}
                {touched ? (
                  <APill label={t("w.recovery.checkins.next")} onPress={() => setStep((s) => s + 1)} style={{ flex: 1 }} />
                ) : (
                  <SkipBtn label={t("w.recovery.checkins.skip")} onPress={() => setStep((s) => s + 1)} />
                )}
              </View>
            </View>
          );
        })()
      ) : (
        (() => {
          const m = current?.kind === "metric" ? CHECKIN_METRICS.find((x) => x.key === current.key) : null;
          if (!m) return null;
          const val = ratings[m.key];
          const feeling = checkinScaleFeeling(val);
          // WHY THE REVIEW WAS FULL OF DASHES. `ratings` defaults to a neutral
          // 3, and this card used to render that default as a SELECTED tile
          // under a confident word — so an athlete who pressed Next was told,
          // twice, that they had answered. Nothing was stored (correctly: a
          // default is not a report), and the summary two cards later showed a
          // dash for every question they thought they had just answered. The
          // effort card already got this right; this now matches it.
          const touched = answered.has(m.key);
          return (
            <View style={{ alignItems: "center" }}>
              <Text style={{ alignSelf: "flex-start", fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash, marginTop: 16 }}>
                {t("w.recovery.checkins.step")} {step + 1} / {steps.length} — {t(m.labelKey)}
              </Text>
              <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking.display, color: C.chalk, textAlign: "center", marginTop: 16, maxWidth: 280 }}>{t(m.questionKey)}</Text>
              {/* Untouched, the face is a placeholder, not a reading — dimmed,
                  and captioned "Not answered" rather than "Okay". */}
              <View style={{ marginTop: 24, marginBottom: 4, opacity: touched ? 1 : 0.3 }}><ReadinessFace feeling={feeling} scale={2.5} /></View>
              <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: touched ? feelingColor(C, feeling) : C.ash }}>
                {touched ? t(checkinMetricWordKey(m.key, val)) : t("w.recovery.checkins.notAnswered")}
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 24, alignSelf: "stretch" }}>
                {CHECKIN_SCALE.map((n) => {
                  const sel = touched && val === n;
                  return (
                    <Pressable key={n} onPress={() => answer(m.key, n)} disabled={locked}
                      accessibilityRole="radio" accessibilityLabel={`${t(m.labelKey)}: ${t(checkinMetricWordKey(m.key, n))}`} accessibilityState={{ selected: sel, disabled: locked }}
                      style={tile(sel)}>
                      <ReadinessFace feeling={checkinScaleFeeling(n)} scale={0.7} />
                    </Pressable>
                  );
                })}
              </View>

              {/* Moving on without answering is called Skip. It was called Next,
                  which is how a skipped question came to feel like an answered
                  one. */}
              <View style={{ flexDirection: "row", gap: space.ms, marginTop: 24, alignSelf: "stretch" }}>
                {step > minStep ? backBtn : null}
                {touched ? (
                  <APill label={t("w.recovery.checkins.next")} onPress={() => setStep((s) => s + 1)} style={{ flex: 1 }} />
                ) : (
                  <SkipBtn label={t("w.recovery.checkins.skip")} onPress={() => setStep((s) => s + 1)} />
                )}
              </View>
            </View>
          );
        })()
      )}
    </>
  );

  // Embedded, the wizard already sits inside a host card — render it bare so it
  // reads as one surface, not a card boxed in a card.
  const wizard = embedded ? <View>{wizardBody}</View> : <ACard style={{ marginTop: 16 }}>{wizardBody}</ACard>;

  const body = (
    <>
      {wizard}
    </>
  );

  if (embedded) return body;
  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.recovery.checkins.title") }}>
      {body}
    </AuroraScreen>
  );
}

/** The advance button when the question is UNANSWERED — a quiet outline rather
 *  than the lime pill, so skipping never looks like committing. It was a
 *  hand-drawn copy of that outline (the note here used to cite the web wizard's
 *  ghost Skip as its source; that client is retired, and this row is the live
 *  standard). It is `APill variant="outline"` now, so the skip and the commit
 *  beside it are one button drawn twice rather than two buttons. */
function SkipBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return <APill label={label} variant="outline" onPress={onPress} style={{ flex: 1 }} />;
}

