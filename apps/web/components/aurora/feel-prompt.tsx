"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FEELS,
  FATIGUES,
  feltSessionLoad,
  loadBand,
  LOAD_BAND_KEY,
  relativeEffort,
  feelReading,
  hoursAfterSession,
  readNoteKey,
  FEEL_READ_KEY,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { sessionsKey } from "@/lib/use-sessions";
import { fs, LIME, LIME_HEX, ASH, LINE, disp, mono, Mono, txt } from "@/lib/ui";

/**
 * "How did that feel?" — THE IMMEDIATE READ.
 *
 * The app asks about a session twice, on purpose. This is the first ask, taken
 * at the end of the session while the athlete is still standing next to the bar,
 * and it is the only one of the two that cannot be taken later:
 *
 *   EFFORT (`feel`) — how hard that was. Effort × duration is the session's
 *     internal load (sRPE), which is what lets the app tell two athletes apart
 *     who ran the same 10 km. See core/session-feel.ts.
 *   SPENTNESS (`fatigue`) — how wrecked you are RIGHT NOW. This is the acute
 *     disturbance at its peak, and it is the anchor the recovery read is
 *     measured against hours later: how far the answer falls between the two is
 *     this athlete's own recovery rate. See core/feel-timing.ts (recoveryCurve)
 *     and core/feel-schedule.ts for which read is due when.
 *
 * Ask it tomorrow instead and you get a memory of a feeling, filtered through a
 * night's sleep — which is why the second ask is a different question ("how are
 * you NOW") on the daily card rather than this one, repeated.
 *
 * ONE component, two homes:
 *  • `compact` — the FINISH screen, straight after the last set. The moment the
 *    schedule calls the immediate read.
 *  • panel — the Wrapped, for a session opened later that was never rated. The
 *    answer is still worth having (effort feeds every load model) and the card
 *    says plainly what a late answer is worth rather than scoring it in silence.
 * Both are seeded from the stored value, so nobody is asked twice.
 *
 * Mobile parity: apps/mobile/components/feel-prompt.tsx.
 */
export function FeelPrompt({
  sessionId,
  minutes,
  initialFeel = null,
  initialFatigue = null,
  baseline = null,
  sessionEnd = null,
  compact = false,
  eyebrow,
  onAnswered,
}: {
  /** null for a guest / unsaved session — the taps are then read-only local. */
  sessionId: string | null;
  /** trusted training minutes; without them there is no load to compute. */
  minutes: number | null;
  initialFeel?: number | null;
  initialFatigue?: number | null;
  /** the athlete's own recent load baseline, for the "vs your usual" line. */
  baseline?: number | null;
  /** when the session ENDED — the lag from here to the tap is what makes two
   *  identical fatigue answers comparable (feel-timing.ts). */
  sessionEnd?: string | null;
  /** card chrome for the finish screen instead of the Wrapped's panel chrome. */
  compact?: boolean;
  eyebrow?: (label: string) => ReactNode;
  /** Fired after a tap is SAVED, so a host that is waiting on the answer (the
   *  import sheet's rate step) can stop offering to skip it. */
  onAnswered?: () => void;
}) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [feel, setFeel] = useState<number | null>(initialFeel);
  const [fatigue, setFatigue] = useState<number | null>(initialFatigue);
  const [failed, setFailed] = useState(false);

  // Optimistic: the taps land instantly and the write follows. A failed save
  // says so rather than silently pretending the answer was recorded.
  const save = async (patch: { feel?: number; fatigue?: number }) => {
    if (!sessionId) return;
    setFailed(false);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(String(res.status));
      void qc.invalidateQueries({ queryKey: sessionsKey });
      onAnswered?.();
    } catch {
      setFailed(true);
    }
  };

  // The lag is measured at the moment of the tap, which is exactly what the
  // server stamps into `feelLoggedAt` — so what the athlete is shown here and
  // what the recovery model later reads are the same number.
  const reading = fatigue != null ? feelReading(fatigue, hoursAfterSession(sessionEnd, Date.now())) : null;
  const load = feltSessionLoad(feel, minutes);
  const rel = load != null ? relativeEffort(load, baseline) : null;

  const row = (
    levels: readonly { value: number; labelKey: string; emoji: string }[],
    picked: number | null,
    onPick: (v: number) => void,
  ) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${levels.length}, 1fr)`, gap: 6, marginTop: 10 }}>
      {levels.map((l) => {
        const on = picked === l.value;
        return (
          <button className="pressable"
            key={l.value}
            onClick={() => onPick(l.value)}
            aria-pressed={on}
            aria-label={t(l.labelKey)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 2px",
              borderRadius: 16, cursor: "pointer",
              border: `1px solid ${on ? LIME_HEX : LINE}`,
              background: on ? `color-mix(in srgb, ${LIME} 16%, transparent)` : compact ? "var(--color-ink2)" : "#0e0f0d",
            }}
          >
            <span aria-hidden style={{ fontSize: 22, lineHeight: 1, filter: on ? "none" : "grayscale(.55)" }}>{l.emoji}</span>
            <span style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: on ? txt(LIME) : txt(ASH) }}>{t(l.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      style={
        compact
          ? { position: "relative", background: "var(--color-card)", border: `1px solid ${LINE}`, borderRadius: 28, padding: 16, marginTop: 16 }
          : { position: "relative" }
      }
    >
      {eyebrow ? eyebrow(t("session.feel.q")) : <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }}>{t("session.feel.q")}</Mono>}
      <div style={{ ...disp, fontWeight: 900, fontSize: compact ? "clamp(18px, 4vw, 22px)" : "clamp(21px, 6vw, 28px)", letterSpacing: "-.02em", lineHeight: 1.15, marginTop: 10 }}>{t("session.feel.lead")}</div>
      {row(FEELS, feel, (v) => { setFeel(v); void save({ feel: v }); })}

      {feel != null && (
        <div style={{ marginTop: 16 }}>
          <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".08em" }}>{t("session.fatigue.q")}</Mono>
          {row(FATIGUES, fatigue, (v) => { setFatigue(v); void save({ fatigue: v }); })}
          {/* WHAT THIS ANSWER IS WORTH. "Wrecked" ten minutes after a hard
              session describes the session; the same tap ten hours later
              describes a recovery problem. The app now reads them differently,
              so it says which one this is rather than scoring in silence. */}
          {reading && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }} c={reading.read === "nextDay" || reading.read === "sameDay" ? LIME_HEX : undefined}>
                {t(FEEL_READ_KEY[reading.read])}
              </Mono>
              <Mono s={{ flex: 1, minWidth: 180, fontSize: fs.caption, lineHeight: 1.5 }}>{t(readNoteKey(reading.read, reading.fatigue))}</Mono>
            </div>
          )}
          {/* WHY THERE IS A SECOND ASK. An athlete who is told nothing assumes
              the app forgot they already answered. Say what the second read is
              for, once, at the moment the first one lands. */}
          {reading?.read === "immediate" && (
            <Mono s={{ fontSize: fs.caption, lineHeight: 1.5, marginTop: 10, display: "block" }}>{t("session.feel.nextRead")}</Mono>
          )}
        </div>
      )}

      {load != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
          <div style={{ ...disp, fontWeight: 900, fontSize: 30, color: txt(LIME), fontVariantNumeric: "tabular-nums" }}>{load}</div>
          <Mono s={{ flex: 1, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }}>{t("session.feel.load")}</Mono>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: fs.caption }}>{t(LOAD_BAND_KEY[loadBand(load)])}</div>
            {rel && (
              <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 3 }} c={rel.pct >= 0 ? LIME_HEX : undefined}>
                {rel.pct >= 0 ? "+" : "−"}{Math.abs(rel.pct)}% {t("session.feel.vsUsual")}
              </Mono>
            )}
          </div>
        </div>
      )}

      <Mono s={{ fontSize: fs.caption, lineHeight: 1.5, marginTop: 12, display: "block" }}>
        {failed ? t("session.feel.retry") : feel != null ? t("session.feel.why") : ""}
      </Mono>
    </div>
  );
}
