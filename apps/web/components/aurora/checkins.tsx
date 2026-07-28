"use client";

import { useEffect, useState } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import {
  fs,
  space,
  CHECKIN_METRICS,
  CHECKIN_SCALE,
  CHECKIN_STEP_COUNT,
  checkinScaleFeeling,
  checkinScaleWordKey,
  answeredMetrics,
  localDayKey,
  type CheckinMetricKey,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useCheckins } from "@/lib/use-checkins";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
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
 *  becomes the floor the Back button can't go under. `onDone` fires on a
 *  successful submit so the host can collapse + refresh. */
export default function AuroraCheckins({ embedded = false, startStep = 0, onDone }: { embedded?: boolean; startStep?: number; onDone?: () => void } = {}) {
  const revalidate = useRevalidate();
  const { t } = useLang();
  const isPaid = useSession().entitlement === "paid";
  // The first question this instance owns — also the Back floor, so an embedded
  // flow can't reverse into a step its host already answered.
  const minStep = Math.min(Math.max(Math.trunc(startStep) || 0, 0), CHECKIN_METRICS.length);
  const [step, setStep] = useState(minStep); // 0..3 metrics, 4 = details
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
  };
  const [extras, setExtras] = useState({ bodyMassKg: "", adherencePct: "", note: "", sharedWithCoach: false });
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
  useEffect(() => {
    if (!checkins) return;
    const today = localDayKey(Date.now());
    const c = checkins.find((x) => x?.weekOf && localDayKey(x.weekOf) === today);
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
  }, [checkins]);

  const detailsStep = CHECKIN_METRICS.length; // index 4
  const isDetails = step === detailsStep;

  const submit = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/checkins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekOf: new Date().toISOString(),
          bodyMassKg: extras.bodyMassKg ? parseFloat(extras.bodyMassKg) : null,
          // Unanswered metrics go as null. The API stores null, every reader
          // treats it as unknown, and nothing downstream mistakes a default for
          // a report.
          energy: answered.has("energy") ? ratings.energy : null,
          sleep: answered.has("sleep") ? ratings.sleep : null,
          soreness: answered.has("soreness") ? ratings.soreness : null,
          mood: answered.has("mood") ? ratings.mood : null,
          adherencePct: extras.adherencePct ? parseInt(extras.adherencePct, 10) : null,
          note: extras.note || null,
          sharedWithCoach: isPaid && extras.sharedWithCoach,
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
      setDone(true);
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
    setExtras({ bodyMassKg: "", adherencePct: "", note: "", sharedWithCoach: false });
  };

  // Embedded, the wizard is already inside a host card — drop the second shell
  // so it reads as one surface, not a card boxed in a card.
  const card = embedded
    ? { background: "transparent", border: "none", borderRadius: 0, boxShadow: "none", padding: 0 } as const
    : { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 22 } as const;
  const numField = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, width: "100%", boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "13px 14px", outline: "none" };
  const btnGhost = { flex: "0 0 auto", padding: "14px 22px", borderRadius: 999, border: `1px solid ${C("line")}`, background: "transparent", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, cursor: "pointer" } as const;
  const btnPrimary = { flex: 1, padding: 15, borderRadius: 999, border: "none", background: C("lime"), color: "var(--on-accent)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle, cursor: "pointer" } as const;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
          <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.recovery.checkins.title")}</h1>
          <span style={{ marginLeft: "auto" }}><AuroraIcon name="heart" size={24} color={C("red")} /></span>
        </div>
      )}

      <div style={{ ...card, marginTop: embedded ? 0 : 18 }}>
        {/* progress */}
        <div style={{ display: "flex", gap: 6 }} aria-hidden>
          {Array.from({ length: CHECKIN_STEP_COUNT }).map((_, i) => (
            <span key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: done || i <= step ? C("lime") : C("line") }} />
          ))}
        </div>

        {done ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "22px 6px 8px" }}>
            <AuroraIcon name="check-circle" size={54} color={C("lime")} />
            <div style={{ fontWeight: 900, fontSize: fs.heading, marginTop: 14 }}>{t("w.recovery.checkins.loggedTitle")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8, lineHeight: 1.5, maxWidth: 300 }}>{t("w.recovery.checkins.loggedSub")}</div>
            <button onClick={restart} style={{ ...btnPrimary, flex: "none", marginTop: 20, padding: "13px 26px" }}>{t("w.recovery.checkins.newCheckin")}</button>
          </div>
        ) : isDetails ? (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".14em", color: C("ash"), marginTop: 18 }}>
              {t("w.recovery.checkins.step")} {CHECKIN_STEP_COUNT} / {CHECKIN_STEP_COUNT} — {t("w.recovery.checkins.detailsStep")}
            </div>
            <div style={{ fontWeight: 900, fontSize: fs.title, marginTop: 8 }}>{t("w.recovery.checkins.reviewTitle")}</div>
            {/* summary of the four picked faces */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
              {CHECKIN_METRICS.map((m) => {
                // An unanswered metric shows a dash, not a neutral face — a face
                // would claim a reading that was never given.
                const on = answered.has(m.key);
                return (
                  <div key={m.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 4px", opacity: on ? 1 : 0.5 }}>
                    {on ? (
                      <ReadinessFace feeling={checkinScaleFeeling(ratings[m.key])} size={26} />
                    ) : (
                      <span aria-hidden style={{ display: "grid", placeItems: "center", width: 26, height: 26, fontFamily: "var(--font-mono)", fontSize: 16, color: C("ash") }}>–</span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash") }}>{t(m.labelKey)}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash2"), margin: "16px 0 8px" }}>{t("w.recovery.checkins.detailsOptional")}</div>
            <div style={{ display: "flex", gap: space.ms }}>
              <input value={extras.bodyMassKg} onChange={(e) => setExtras((s) => ({ ...s, bodyMassKg: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.checkins.weightKg")} style={numField} />
              <input value={extras.adherencePct} onChange={(e) => setExtras((s) => ({ ...s, adherencePct: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.checkins.adherencePct")} style={numField} />
            </div>
            <textarea value={extras.note} onChange={(e) => setExtras((s) => ({ ...s, note: e.target.value }))} placeholder={t("w.recovery.checkins.notePlaceholder")} rows={3} style={{ ...numField, resize: "vertical", marginTop: 12 }} />

            <button onClick={() => isPaid && setExtras((s) => ({ ...s, sharedWithCoach: !s.sharedWithCoach }))} disabled={!isPaid}
              style={{ display: "flex", alignItems: "center", gap: space.md, width: "100%", textAlign: "left", marginTop: 14, padding: 14, borderRadius: 14, background: extras.sharedWithCoach && isPaid ? `color-mix(in srgb, ${C("lime")} 10%, transparent)` : "transparent", border: `1px solid ${extras.sharedWithCoach && isPaid ? C("lime") : C("line")}`, cursor: isPaid ? "pointer" : "default", opacity: isPaid ? 1 : 0.6, color: C("chalk") }}>
              <AuroraIcon name={extras.sharedWithCoach && isPaid ? "check" : "lock"} size={20} color={extras.sharedWithCoach && isPaid ? C("lime") : C("ash")} />
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: fs.body, display: "block" }}>{t("w.recovery.checkins.shareCoach")}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), display: "block", marginTop: 2 }}>{isPaid ? t("w.recovery.checkins.shareCoachOn") : t("w.recovery.checkins.shareCoachOff")}</span>
              </span>
            </button>

            {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 8 }}>{error}</div>}
            <div style={{ display: "flex", gap: space.ms, marginTop: 16 }}>
              {step > minStep && <button onClick={() => setStep((s) => s - 1)} style={btnGhost}>{t("w.recovery.checkins.prev")}</button>}
              <button onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? t("w.recovery.checkins.submitting") : t("w.recovery.checkins.submit")}</button>
            </div>
          </>
        ) : (
          (() => {
            const m = CHECKIN_METRICS[step];
            if (!m) return null;
            const val = ratings[m.key];
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".14em", color: C("ash"), marginTop: 18, alignSelf: "flex-start" }}>
                  {t("w.recovery.checkins.step")} {step + 1} / {CHECKIN_STEP_COUNT} — {t(m.labelKey)}
                </div>
                <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.15, marginTop: 14, maxWidth: 300 }}>{t(m.questionKey)}</div>
                <div style={{ margin: "22px 0 4px" }}><ReadinessFace feeling={checkinScaleFeeling(val)} size={84} /></div>
                <div className="word" style={{ fontWeight: 800, fontSize: fs.title, color: `var(--${checkinScaleFeeling(val) === "primed" ? "lime" : checkinScaleFeeling(val) === "good" ? "blue" : checkinScaleFeeling(val) === "flat" ? "amber" : "red"}-text)` }}>{t(checkinScaleWordKey(val))}</div>

                <div style={{ display: "flex", gap: 9, width: "100%", marginTop: 22 }}>
                  {CHECKIN_SCALE.map((n) => {
                    const sel = val === n;
                    return (
                      <button key={n} onClick={() => answer(m.key, n)}
                        aria-label={`${t(m.labelKey)}: ${n}`} aria-pressed={sel}
                        style={{ flex: 1, aspectRatio: "1", borderRadius: 16, display: "grid", placeItems: "center", cursor: "pointer", background: sel ? `color-mix(in srgb, ${C("lime")} 10%, transparent)` : C("ink"), border: `1px solid ${sel ? C("lime") : C("line")}`, boxShadow: sel ? `0 0 0 3px color-mix(in srgb, ${C("lime")} 14%, transparent)` : "none" }}>
                        <ReadinessFace feeling={checkinScaleFeeling(n)} size={24} />
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: space.ms, width: "100%", marginTop: 24 }}>
                  {step > minStep && <button onClick={() => setStep((s) => s - 1)} style={btnGhost}>{t("w.recovery.checkins.prev")}</button>}
                  <button onClick={() => setStep((s) => s + 1)} style={btnPrimary}>{t("w.recovery.checkins.next")}</button>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
