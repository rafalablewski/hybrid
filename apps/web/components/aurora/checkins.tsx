"use client";

import { accentText } from "@/lib/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import {
  fs,
  space,
  CHECKIN_METRICS,
  CHECKIN_SCALE,
  checkinScaleFeeling,
  checkinMetricWordKey,
  checkinMetricPatch,
  answeredMetrics,
  localDayKey,
  checkinSteps,
  FEELS,
  READINESS_FACE,
  type CheckinMetricKey,
  type CheckinSessionRef,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useCheckins } from "@/lib/use-checkins";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import { HeroScreen } from "./hero";
import ReadinessFace from "./readiness-face";

type Ratings = Record<CheckinMetricKey, number>;

/** AURORA Daily check-in (web) — a GUIDED, one-question-per-card flow. Steps 1–4
 *  walk Energy / Sleep / Soreness / Mood with a big reactive readiness face; the
 *  final card collects weight, adherence, a note + share-with-coach and submits.
 *  Same /api/checkins POST as before — only the input UX changed.
 *  Mirrors the mobile AuroraCheckin wizard.
 *
 *  `embedded` drops the screen chrome (title + card shell) so the SAME wizard can
 *  run inline inside another card — Today's feeling card hosts it so the full
 *  check-in never leaves the homepage. `startStep` opens on a later question
 *  (Today's one-tap face already answers Energy, so it starts at Sleep) and
 *  becomes the floor the Back button can't go under.
 *
 *  `onDone` fires on a successful submit so the host can REFRESH. It must not
 *  dismiss: the host used to close the sheet the instant the POST returned, so
 *  the "Check-in logged" confirmation this flow renders was never once seen and
 *  finishing the check-in looked exactly like the app dropping it. `onClose` is
 *  the dismissal, and the athlete presses it. */
export default function AuroraCheckins({ embedded = false, startStep = 0, sessions = [], onDone, onClose }: {
  embedded?: boolean;
  startStep?: number;
  /** The day's sessions — one effort question each. Empty on a rest day, which
   *  makes the flow exactly the four daily questions it has always been. */
  sessions?: CheckinSessionRef[];
  onDone?: () => void;
  onClose?: () => void;
} = {}) {
  const revalidate = useRevalidate();
  const { t } = useLang();
  const isPaid = useSession().entitlement === "paid";
  // The first question this instance owns — also the Back floor, so an embedded
  // flow can't reverse into a step its host already answered.
  // The flow is the four daily questions, then one effort question per session
  // the athlete trained that day, then details — see core/checkin-flow.ts.
  const steps = useMemo(() => checkinSteps(sessions), [sessions]);
  const minStep = Math.min(Math.max(Math.trunc(startStep) || 0, 0), steps.length - 1);
  const [step, setStep] = useState(minStep); // 0..3 metrics, 4 = details
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
  // muted and an Edit button instead of a Submit.
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
  const C = (v: string) => `var(--color-${v})`;

  // Prefill from TODAY's check-in so the guided flow REFINES the quick one-tap
  // readiness (or a prior full check-in) instead of resetting to neutral — the
  // server upserts the same day, so what's shown here is what gets updated. A
  // fresh "New check-in" (restart) is exempt: it re-arms the neutral defaults.
  //
  // Read from the SHARED cache rather than a private fetch: this component used
  // to issue its own GET and compare days with `new Date().toDateString()`,
  // giving the same screen two different definitions of "today". One cache, one
  // day-key helper.
  const checkins = useCheckins().data;
  // HAS THE STORED CHECK-IN LANDED YET? Until it has, this component knows
  // nothing about the day and must not pretend otherwise. It used to render
  // immediately off empty state: an athlete whose day was 4/4 opened the sheet
  // onto "Today's read — 0 / 4 answered", four dashes and a Submit button,
  // which flipped to the saved read-back a moment later when the fetch landed.
  // A blank form is not a neutral placeholder — it is a wrong answer.
  const hydrated = checkins !== undefined;
  const todayRow = useMemo(() => {
    if (!checkins) return null;
    const today = localDayKey(Date.now());
    return checkins.find((x) => x?.weekOf && localDayKey(x.weekOf) === today) ?? null;
  }, [checkins]);
  // What the server holds — DERIVED from the cache, not state synced to it from
  // an effect. As state it lagged the render that first saw the cache by a
  // frame, and that one frame drew the live form with a Submit button over a
  // check-in that was already complete. An empty set is the honest answer for a
  // day with no row, and it keeps `locked` false.
  const storedMetrics = useMemo<Set<CheckinMetricKey>>(
    () => new Set(todayRow ? answeredMetrics(todayRow) : []),
    [todayRow],
  );
  const shareSeeded = useRef(false);
  useEffect(() => {
    const c = todayRow;
    if (!c) return;
    setRatings((s) => ({
      energy: c.energy ?? s.energy,
      sleep: c.sleep ?? s.sleep,
      soreness: c.soreness ?? s.soreness,
      mood: c.mood ?? s.mood,
    }));
    // A stored value IS an answer — but only the ones actually stored.
    setAnswered((s) => {
      const next = new Set(s);
      for (const k of answeredMetrics(c)) next.add(k);
      return next;
    });
    // SEEDED ONCE, unlike the ratings above. This effect re-runs on every cache
    // change (it has to — the sheet opens before the readiness tap's refetch
    // lands, and that refetch is what tells it Energy is answered), but this is
    // a control the athlete may be mid-way through toggling.
    if (!shareSeeded.current) {
      shareSeeded.current = true;
      setSharedWithCoach((v) => v || !!c.sharedWithCoach);
    }
  }, [todayRow]);

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
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/checkins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekOf: new Date().toISOString(),
          // ONLY what this flow actually holds. A metric the athlete walked
          // past is OMITTED, not sent as null: omitted leaves whatever is
          // stored alone, which matters because this flow usually opens
          // mid-day on a row that already has answers in it. Nothing is
          // invented either — the server writes null for a genuinely new day.
          ...checkinMetricPatch(ratings, answered),
          sharedWithCoach: isPaid && sharedWithCoach,
        }),
      });
      if (res.status === 401) { setError(t("w.recovery.checkins.errSignIn")); setSaving(false); return; }
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
        const mins = Math.ceil((body.retryAfterMs ?? 0) / 60000);
        setError(`${t("w.recovery.checkins.cooldownBody")} ${Math.floor(mins / 60)}h ${mins % 60}m.`);
        setSaving(false); return;
      }
      if (!res.ok) { setError(`${t("w.recovery.checkins.errSubmit")} (HTTP ${res.status}).`); setSaving(false); return; }

      // Effort answers go where every engine already reads them: each session's
      // own `feel`. Best effort and in parallel — a failed effort write must not
      // discard the daily check-in that already succeeded.
      await Promise.all(
        [...effortAnswered].map((id) =>
          fetch(`/api/sessions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feel: efforts[id] }),
          }).catch(() => null),
        ),
      );
      if (effortAnswered.size) revalidate.sessions();

      setDone(true);
      setUpdated(isUpdate);
      // The write landed: nothing local is outstanding any more, and re-opening
      // the flow from here on reads back rather than re-asking.
      setDirty(false);
      setSubmittedOnce(true);
      setEditing(false);
      revalidate.recovery();
      // The check-in row itself is cached now (checkinsKey) and drives today's
      // feeling card + the prescription's readiness nudge — so the write has to
      // drop it, or the athlete's own answer is the thing that looks stale.
      revalidate.checkins();
      onDone?.();
    } catch { setError(t("w.recovery.checkins.errNetwork")); }
    setSaving(false);
  };

  const restart = () => {
    setDone(false); setStep(minStep); setError("");
    setRatings({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
    setAnswered(new Set());
    setEfforts({});
    setEffortAnswered(new Set());
    setSharedWithCoach(false);
    // A blank re-run is an EDIT of the same day (the server upserts), so it
    // opens live rather than in read-back mode.
    setEditing(true); setUpdated(false); setDirty(false);
  };

  // Embedded, the wizard is already inside a host card — drop the second shell
  // so it reads as one surface, not a card boxed in a card.
  const card = embedded
    ? { background: "transparent", border: "none", borderRadius: 0, boxShadow: "none", padding: 0 } as const
    : { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
  const btnGhost = { flex: "0 0 auto", padding: "16px 20px", borderRadius: 999, border: `1px solid ${C("line")}`, background: "transparent", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, cursor: "pointer" } as const;
  const btnPrimary = { flex: 1, padding: 16, borderRadius: 999, border: "none", background: C("lime"), color: "var(--on-accent)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle, cursor: "pointer" } as const;
  /** A 1–5 / effort tile. LOCKED it is a read-back, not a control: the lime
   *  selection drops to a neutral outline and the unpicked options fade back,
   *  so the row shows what was answered instead of inviting another answer. */
  const tile = (sel: boolean) => ({
    flex: 1, aspectRatio: "1", borderRadius: 16, display: "grid", placeItems: "center",
    cursor: locked ? "default" : "pointer",
    background: sel ? (locked ? `color-mix(in srgb, ${C("ash")} 14%, transparent)` : `color-mix(in srgb, ${C("lime")} 10%, transparent)`) : C("ink"),
    border: `1px solid ${sel ? (locked ? C("ash") : C("lime")) : C("line")}`,
    boxShadow: sel && !locked ? `0 0 0 3px color-mix(in srgb, ${C("lime")} 14%, transparent)` : "none",
    opacity: locked && !sel ? 0.35 : 1,
  } as const);

  return (
    <HeroScreen hero={{ rank: "title", title: t("w.recovery.checkins.title") }}>
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
          <span style={{ marginLeft: "auto" }}><AuroraIcon name="heart" size={24} color={C("red")} /></span>
        </div>
      )}

      <div style={{ ...card, marginTop: embedded ? 0 : 16 }}>
        {/* PROGRESS = ANSWERS, NOT POSITION. This filled every bar up to the
            current step, so walking to the end without tapping anything drew a
            complete bar over a check-in that held one answer — the screen
            asserting "done" while the review card underneath showed dashes.
            A bar is solid when its question is answered, faint while you're on
            it, and empty otherwise. */}
        <div style={{ display: "flex", gap: 6 }} aria-hidden>
          {steps.map((st, i) => (
            <span
              key={i}
              style={{
                flex: 1, height: 5, borderRadius: 999,
                background: done || isAnswered(st)
                  ? C("lime")
                  : i === step
                    ? `color-mix(in srgb, ${C("lime")} 34%, ${C("line")})`
                    : C("line"),
              }}
            />
          ))}
        </div>

        {/* SAVED / EDITING — the state banner. Locked, it says the answers are
            stored and offers the one control that changes that; editing, it
            says the flow is live again so the muted tiles coming back to full
            colour is explained rather than merely observed. */}
        {(locked || (editing && !done)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, padding: "12px 12px", borderRadius: 16, background: locked ? `color-mix(in srgb, var(--lime-text) 7%, transparent)` : "transparent", border: `1px solid ${locked ? "color-mix(in srgb, var(--lime-text) 24%, transparent)" : C("line")}` }}>
            <AuroraIcon name={locked ? "check-circle" : "edit"} size={20} color={locked ? "var(--lime-text)" : C("ash")} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: fs.body }}>{t(locked ? "w.recovery.checkins.savedTitle" : "w.recovery.checkins.edit")}</span>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 2 }}>{t(locked ? "w.recovery.checkins.savedSub" : "w.recovery.checkins.editingSub")}</span>
            </span>
          </div>
        )}

        {!hydrated ? (
          // Holding, not guessing. One quiet line rather than a form that would
          // have to correct itself the moment the day's check-in arrives.
          <div style={{ display: "grid", placeItems: "center", minHeight: 220, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
            {t("w.recovery.checkins.loading")}
          </div>
        ) : done ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "20px 6px 8px" }}>
            <AuroraIcon name="check-circle" size={54} color={C("lime")} />
            {/* "Updated" rather than "logged" when the day already had a
                check-in — an edit is not a second check-in, and calling it one
                would suggest the first is still sitting there somewhere. */}
            <div style={{ fontWeight: 900, fontSize: fs.heading, marginTop: 16 }}>{t(updated ? "w.recovery.checkins.updatedTitle" : "w.recovery.checkins.loggedTitle")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8, lineHeight: 1.5, maxWidth: 300 }}>
              {t(!allAnswered ? "w.recovery.checkins.loggedPartialSub" : updated ? "w.recovery.checkins.updatedSub" : "w.recovery.checkins.loggedSub")}
            </div>
            {/* What actually landed. The count is the same one the Today card
                shows, so the two can't tell different stories about the same
                check-in. */}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: allAnswered ? "var(--lime-text)" : C("ash2"), marginTop: 10 }}>
              {answeredCount} / {questions.length} {t("w.home.today.answered")}
            </div>
            <div style={{ display: "flex", gap: space.ms, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
              {/* Still blank? Go straight back to the first one — the day is
                  upserted, so answering more is an edit, not a second check-in. */}
              {!allAnswered && (
                <button className="pressable"
                  onClick={() => { setDone(false); setStep(Math.max(minStep, steps.findIndex((st) => st.kind !== "details" && !isAnswered(st)))); }}
                  style={{ ...btnPrimary, flex: "none", padding: "12px 24px" }}
                >
                  {t("w.recovery.checkins.answerRest")}
                </button>
              )}
              {/* Embedded, the host is a sheet the athlete now dismisses
                  themselves — it no longer vanishes out from under the
                  confirmation. */}
              {embedded && onClose ? (
                <button className="pressable" onClick={onClose} style={allAnswered ? { ...btnPrimary, flex: "none", padding: "12px 24px" } : { ...btnGhost, padding: "12px 24px" }}>
                  {t("w.recovery.checkins.doneClose")}
                </button>
              ) : (
                <button className="pressable" onClick={restart} style={allAnswered ? { ...btnPrimary, flex: "none", padding: "12px 24px" } : { ...btnGhost, padding: "12px 24px" }}>
                  {t("w.recovery.checkins.newCheckin")}
                </button>
              )}
            </div>
          </div>
        ) : isDetails ? (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginTop: 16 }}>
              {t("w.recovery.checkins.step")} {steps.length} / {steps.length} — {t("w.recovery.checkins.detailsStep")}
            </div>
            <div style={{ fontWeight: 900, fontSize: fs.title, marginTop: 8 }}>{t("w.recovery.checkins.reviewTitle")}</div>
            {/* summary of the four picked faces */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
              {CHECKIN_METRICS.map((m) => {
                // An unanswered metric shows a dash, not a neutral face — a face
                // would claim a reading that was never given. The dash is a
                // BUTTON back to that question, because a review that can only
                // report the gap leaves the athlete to guess how to close it.
                const on = answered.has(m.key);
                const to = stepOf(m.key);
                return (
                  <button className="pressable"
                    key={m.key}
                    onClick={() => !locked && to >= 0 && setStep(to)}
                    disabled={locked}
                    aria-label={`${t(m.labelKey)} – ${on ? t(checkinMetricWordKey(m.key, ratings[m.key])) : t("w.recovery.checkins.notAnswered")}`}
                    // LOCKED, THE REVIEW IS A REPORT, NOT A CONTROL. Left at full
                    // colour and still tapping through to its question, it read as
                    // "edit any of this whenever" — which is exactly what the Edit
                    // button is for. Muted here, restored the moment Edit is pressed.
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: C("ink"), border: `1px ${on ? "solid" : "dashed"} ${C("line")}`, borderRadius: 16, padding: "12px 4px", opacity: locked ? 0.45 : on ? 1 : 0.6, cursor: locked ? "default" : "pointer", color: C("chalk"), font: "inherit" }}
                  >
                    {on ? (
                      <ReadinessFace feeling={checkinScaleFeeling(ratings[m.key])} size={26} />
                    ) : (
                      <span aria-hidden style={{ display: "grid", placeItems: "center", width: 26, height: 26, fontFamily: "var(--font-mono)", fontSize: 16, color: C("ash") }}>–</span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash") }}>{t(m.labelKey)}</span>
                  </button>
                );
              })}
            </div>
            {/* Say what the dashes are for. Without this the review reads as a
                verdict on a check-in that is already over. */}
            {!allAnswered && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 10 }}>
                {answeredCount} / {questions.length} {t("w.home.today.answered")} – {t("w.recovery.checkins.reviewMissing")}
              </div>
            )}

            <button className="pressable" onClick={() => isPaid && toggleShare()} disabled={!isPaid || locked}
              style={{ display: "flex", alignItems: "center", gap: space.md, width: "100%", textAlign: "left", marginTop: 16, padding: 16, borderRadius: 16, background: sharedWithCoach && isPaid ? `color-mix(in srgb, ${C("lime")} 10%, transparent)` : "transparent", border: `1px solid ${sharedWithCoach && isPaid ? C("lime") : C("line")}`, cursor: isPaid && !locked ? "pointer" : "default", opacity: !isPaid ? 0.6 : locked ? 0.55 : 1, color: C("chalk") }}>
              <AuroraIcon name={sharedWithCoach && isPaid ? "check" : "lock"} size={20} color={sharedWithCoach && isPaid ? C("lime") : C("ash")} />
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: fs.body, display: "block" }}>{t("w.recovery.checkins.shareCoach")}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), display: "block", marginTop: 2 }}>{isPaid ? t("w.recovery.checkins.shareCoachOn") : t("w.recovery.checkins.shareCoachOff")}</span>
              </span>
            </button>

            {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: accentText("red"), marginTop: 8 }}>{error}</div>}
            {/* THE SUBMIT IS GONE WHEN THERE IS NOTHING TO SUBMIT. Leaving it
                under a stored check-in was the whole confusion: a button that
                says "Submit check-in" over answers that were already submitted
                reads as work still outstanding. Locked, the card offers Done
                (or nothing but Back) and the banner's Edit is the way back in. */}
            <div style={{ display: "flex", gap: space.ms, marginTop: 16 }}>
              {!locked && step > minStep && <button className="pressable" onClick={() => setStep((s) => s - 1)} style={btnGhost}>{t("w.recovery.checkins.prev")}</button>}
              {locked ? (
                <>
                  {/* EDIT LIVES HERE AND ONLY HERE — beside Done, where the
                      athlete already is when they decide the read is wrong. */}
                  <button className="pressable" onClick={() => setEditing(true)} style={{ ...btnGhost, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <AuroraIcon name="edit" size={16} color={C("ash")} /> {t("w.recovery.checkins.edit")}
                  </button>
                  {onClose && <button className="pressable" onClick={onClose} style={btnPrimary}>{t("w.recovery.checkins.doneClose")}</button>}
                </>
              ) : (
                <button className="pressable" onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                  {saving ? t("w.recovery.checkins.submitting") : t(editing || storedAll ? "w.recovery.checkins.saveChanges" : "w.recovery.checkins.submit")}
                </button>
              )}
            </div>
          </>
        ) : current?.kind === "effort" ? (
          (() => {
            // HOW HARD WAS THAT — the one question that is genuinely per
            // session rather than per day. Same card, same 1–5 row; the words
            // are the effort scale (Easy … All out) because it is not asking
            // how you are, it is asking what the session cost.
            const sess = current.session;
            const val = efforts[sess.id];
            const touched = effortAnswered.has(sess.id);
            const def = FEELS.find((f) => f.value === val);
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginTop: 16, alignSelf: "flex-start" }}>
                  {t("w.recovery.checkins.step")} {step + 1} / {steps.length} — {t("w.recovery.checkins.effort")}
                </div>
                <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.15, marginTop: 16, maxWidth: 300 }}>{t("w.recovery.checkins.qEffort")}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8, maxWidth: 280, overflowWrap: "anywhere" }}>{sess.title}</div>
                <div style={{ fontWeight: 800, fontSize: fs.title, marginTop: 20, minHeight: 28, color: def ? `var(--${def.tone}-text)` : C("ash") }}>
                  {touched && def ? t(def.labelKey) : t("w.recovery.checkins.notAnswered")}
                </div>
                <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 16 }}>
                  {FEELS.map((f) => {
                    const sel = touched && val === f.value;
                    return (
                      <button className="pressable" key={f.value} onClick={() => answerEffort(sess.id, f.value)} disabled={locked}
                        aria-label={`${sess.title}: ${t(f.labelKey)}`} aria-pressed={sel}
                        style={{ ...tile(sel), fontSize: 22, ...(sel && !locked ? { background: `color-mix(in srgb, var(--${f.tone}-text) 12%, transparent)`, border: `1px solid var(--${f.tone}-text)`, boxShadow: "none" } : null) }}>
                        {f.emoji}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: space.ms, width: "100%", marginTop: 24 }}>
                  {step > minStep && <button className="pressable" onClick={() => setStep((v) => v - 1)} style={btnGhost}>{t("w.recovery.checkins.prev")}</button>}
                  <button className="pressable" onClick={() => setStep((v) => v + 1)} style={touched ? btnPrimary : { ...btnGhost, flex: 1 }}>
                    {touched ? t("w.recovery.checkins.next") : t("w.recovery.checkins.skip")}
                  </button>
                </div>
              </div>
            );
          })()
        ) : (
          (() => {
            const m = current?.kind === "metric" ? CHECKIN_METRICS.find((x) => x.key === current.key) : null;
            if (!m) return null;
            const val = ratings[m.key];
            // WHY THE REVIEW WAS FULL OF DASHES. `ratings` defaults to a neutral
            // 3, and this card used to render that default as a SELECTED tile
            // under a confident word — so an athlete who pressed Next was told,
            // twice, that they had answered. Nothing was stored (correctly: a
            // default is not a report), and the summary two cards later showed a
            // dash for every question they thought they had just answered.
            // The effort card already got this right; this now matches it.
            const touched = answered.has(m.key);
            const feel = checkinScaleFeeling(val);
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginTop: 16, alignSelf: "flex-start" }}>
                  {t("w.recovery.checkins.step")} {step + 1} / {steps.length} — {t(m.labelKey)}
                </div>
                <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.15, marginTop: 16, maxWidth: 300 }}>{t(m.questionKey)}</div>
                {/* Untouched, the face is a placeholder, not a reading — dimmed,
                    and captioned "Not answered" rather than "Okay". */}
                <div style={{ margin: "24px 0 4px", opacity: touched ? 1 : 0.3 }}><ReadinessFace feeling={feel} size={84} /></div>
                <div className="word" style={{ fontWeight: 800, fontSize: fs.title, minHeight: 28, color: touched ? `var(--${READINESS_FACE[feel].accent}-text)` : C("ash") }}>
                  {touched ? t(checkinMetricWordKey(m.key, val)) : t("w.recovery.checkins.notAnswered")}
                </div>

                <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 24 }}>
                  {CHECKIN_SCALE.map((n) => {
                    const sel = touched && val === n;
                    return (
                      <button className="pressable" key={n} onClick={() => answer(m.key, n)} disabled={locked}
                        aria-label={`${t(m.labelKey)}: ${t(checkinMetricWordKey(m.key, n))}`} aria-pressed={sel}
                        style={tile(sel)}>
                        <ReadinessFace feeling={checkinScaleFeeling(n)} size={24} />
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: space.ms, width: "100%", marginTop: 24 }}>
                  {step > minStep && <button className="pressable" onClick={() => setStep((s) => s - 1)} style={btnGhost}>{t("w.recovery.checkins.prev")}</button>}
                  {/* Moving on without answering is called Skip. It was called
                      Next, which is how a skipped question came to feel like an
                      answered one. */}
                  <button className="pressable" onClick={() => setStep((s) => s + 1)} style={touched ? btnPrimary : { ...btnGhost, flex: 1 }}>
                    {touched ? t("w.recovery.checkins.next") : t("w.recovery.checkins.skip")}
                  </button>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
    </HeroScreen>
  );
}
