"use client";

import { useCallback, useEffect, useState } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import {
  fs,
  space,
  CHECKIN_METRICS,
  CHECKIN_SCALE,
  CHECKIN_STEP_COUNT,
  checkinScaleFeeling,
  checkinScaleWordKey,
  type CheckinMetricKey,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import ReadinessFace from "./readiness-face";

type Checkin = {
  id: string; weekOf: string; bodyMassKg: number | null;
  energy: number | null; sleep: number | null; soreness: number | null; mood: number | null;
  adherencePct: number | null; note: string | null; coachReply: string | null; repliedAt: string | null; createdAt: string;
  sharedWithCoach?: boolean;
};

type Ratings = Record<CheckinMetricKey, number>;

/** AURORA Daily check-in (web) — a GUIDED, one-question-per-card flow. Steps 1–4
 *  walk Energy / Sleep / Soreness / Mood with a big reactive readiness face; the
 *  final card collects weight, adherence, a note + share-with-coach and submits.
 *  Same /api/checkins POST + history as before — only the input UX changed.
 *  Mirrors the mobile AuroraCheckin wizard. */
export default function AuroraCheckins() {
  const revalidate = useRevalidate();
  const { t } = useLang();
  const isPaid = useSession().entitlement === "paid";
  const [history, setHistory] = useState<Checkin[]>([]);
  const [step, setStep] = useState(0); // 0..3 metrics, 4 = details
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ratings, setRatings] = useState<Ratings>({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
  const [extras, setExtras] = useState({ bodyMassKg: "", adherencePct: "", note: "", sharedWithCoach: false });
  const C = (v: string) => `var(--color-${v})`;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checkins");
      setHistory(res.ok ? ((await res.json()) as { checkins?: Checkin[] }).checkins ?? [] : []);
    } catch { setHistory([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

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
          energy: ratings.energy, sleep: ratings.sleep, soreness: ratings.soreness, mood: ratings.mood,
          adherencePct: extras.adherencePct ? parseInt(extras.adherencePct, 10) : null,
          note: extras.note || null,
          sharedWithCoach: isPaid && extras.sharedWithCoach,
        }),
      });
      if (res.status === 401) { setError(t("w.recovery.checkins.errSignIn")); setSaving(false); return; }
      if (!res.ok) { setError(`${t("w.recovery.checkins.errSubmit")} (HTTP ${res.status}).`); setSaving(false); return; }
      setDone(true);
      await load();
      revalidate.recovery();
    } catch { setError(t("w.recovery.checkins.errNetwork")); }
    setSaving(false);
  };

  const restart = () => {
    setDone(false); setStep(0); setError("");
    setRatings({ energy: 3, sleep: 3, soreness: 3, mood: 3 });
    setExtras({ bodyMassKg: "", adherencePct: "", note: "", sharedWithCoach: false });
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 } as const;
  const numField = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, width: "100%", boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "13px 14px", outline: "none" };
  const btnGhost = { flex: "0 0 auto", padding: "14px 22px", borderRadius: 999, border: `1px solid ${C("line")}`, background: "transparent", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, cursor: "pointer" } as const;
  const btnPrimary = { flex: 1, padding: 15, borderRadius: 999, border: "none", background: C("lime"), color: "var(--on-accent)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle, cursor: "pointer" } as const;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
        <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.recovery.checkins.title")}</h1>
        <span style={{ marginLeft: "auto" }}><AuroraIcon name="heart" size={24} color={C("red")} /></span>
      </div>

      <div style={{ ...card, marginTop: 18 }}>
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
              {CHECKIN_METRICS.map((m) => (
                <div key={m.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 4px" }}>
                  <ReadinessFace feeling={checkinScaleFeeling(ratings[m.key])} size={26} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash") }}>{t(m.labelKey)}</span>
                </div>
              ))}
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
              <button onClick={() => setStep((s) => s - 1)} style={btnGhost}>{t("w.recovery.checkins.prev")}</button>
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
                      <button key={n} onClick={() => setRatings((s) => ({ ...s, [m.key]: n }))}
                        aria-label={`${t(m.labelKey)}: ${n}`} aria-pressed={sel}
                        style={{ flex: 1, aspectRatio: "1", borderRadius: 16, display: "grid", placeItems: "center", cursor: "pointer", background: sel ? `color-mix(in srgb, ${C("lime")} 10%, transparent)` : C("ink"), border: `1px solid ${sel ? C("lime") : C("line")}`, boxShadow: sel ? `0 0 0 3px color-mix(in srgb, ${C("lime")} 14%, transparent)` : "none" }}>
                        <ReadinessFace feeling={checkinScaleFeeling(n)} size={24} />
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: space.ms, width: "100%", marginTop: 24 }}>
                  {step > 0 && <button onClick={() => setStep((s) => s - 1)} style={btnGhost}>{t("w.recovery.checkins.prev")}</button>}
                  <button onClick={() => setStep((s) => s + 1)} style={btnPrimary}>{t("w.recovery.checkins.next")}</button>
                </div>
              </div>
            );
          })()
        )}
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), margin: "18px 0 10px" }}>{t("w.recovery.checkins.history")}</div>
      {history.length === 0 ? (
        <div style={{ fontSize: fs.body, color: C("ash") }}>{t("w.recovery.checkins.historyEmpty")}</div>
      ) : (
        history.map((c) => (
          <div key={c.id} style={{ ...card, padding: 18, marginBottom: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: fs.note }}>{new Date(c.weekOf).toLocaleDateString()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
                {c.sharedWithCoach && <span style={{ background: `color-mix(in srgb, ${C("lime")} 14%, transparent)`, color: "var(--lime-text)", borderRadius: 999, padding: "2px 10px", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase" }}>{t("w.recovery.checkins.shared")}</span>}
                {c.adherencePct != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{c.adherencePct}% {t("w.recovery.checkins.adherence")}</span>}
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 6 }}>
              {t("w.recovery.checkins.energyLc")} {c.energy ?? "—"} – {t("w.recovery.checkins.sleepLc")} {c.sleep ?? "—"} – {t("w.recovery.checkins.sorenessLc")} {c.soreness ?? "—"} – {t("w.recovery.checkins.moodLc")} {c.mood ?? "—"}{c.bodyMassKg != null ? ` – ${c.bodyMassKg}kg` : ""}
            </div>
            {c.note && <div style={{ fontSize: fs.bodyLg, lineHeight: 1.5, marginTop: 6 }}>{c.note}</div>}
            {c.coachReply && (
              <div style={{ marginTop: 10, paddingLeft: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.recovery.checkins.coach")}</div>
                <div style={{ fontSize: fs.bodyLg, lineHeight: 1.5, marginTop: 4 }}>{c.coachReply}</div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
