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
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { sessionsKey } from "@/lib/use-sessions";
import { fs, LIME, LIME_HEX, ASH, LINE, disp, mono, Mono, txt } from "@/lib/ui";

/**
 * "How did that feel?" — the post-workout self-report, asked once.
 *
 * It exists because the log alone can't tell two athletes apart: the same 10 km
 * in 40 minutes is a jog for one and a near-death experience for the other, and
 * an engine that treats them identically will keep prescribing the wrong next
 * session to the second one. Effort × duration is that session's internal load
 * (sRPE) — see core/session-feel.ts.
 *
 * ONE component, two homes, because the question has two natural moments:
 *  • `compact` — the FINISH screen, straight after the last set, which is when
 *    the answer is most accurate and the athlete is still at the screen.
 *  • panel — the Wrapped, for a session opened later that was never rated.
 * Whichever they answer first, the other reads it back (both are seeded from
 * the stored value), so nobody is asked twice.
 *
 * Mobile parity: apps/mobile/components/feel-prompt.tsx.
 */
export function FeelPrompt({
  sessionId,
  minutes,
  initialFeel = null,
  initialFatigue = null,
  baseline = null,
  compact = false,
  eyebrow,
}: {
  /** null for a guest / unsaved session — the taps are then read-only local. */
  sessionId: string | null;
  /** trusted training minutes; without them there is no load to compute. */
  minutes: number | null;
  initialFeel?: number | null;
  initialFatigue?: number | null;
  /** the athlete's own recent load baseline, for the "vs your usual" line. */
  baseline?: number | null;
  /** card chrome for the finish screen instead of the Wrapped's panel chrome. */
  compact?: boolean;
  eyebrow?: (label: string) => ReactNode;
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
    } catch {
      setFailed(true);
    }
  };

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
          <button
            key={l.value}
            onClick={() => onPick(l.value)}
            aria-pressed={on}
            aria-label={t(l.labelKey)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 2px",
              borderRadius: 14, cursor: "pointer",
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
          ? { position: "relative", background: "var(--color-card)", border: `1px solid ${LINE}`, borderRadius: 20, padding: 16, marginTop: 16 }
          : { position: "relative" }
      }
    >
      {eyebrow ? eyebrow(t("session.feel.q")) : <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".15em" }}>{t("session.feel.q")}</Mono>}
      <div style={{ ...disp, fontWeight: 900, fontSize: compact ? "clamp(18px, 4vw, 22px)" : "clamp(21px, 6vw, 28px)", letterSpacing: "-.02em", lineHeight: 1.15, marginTop: 10 }}>{t("session.feel.lead")}</div>
      {row(FEELS, feel, (v) => { setFeel(v); void save({ feel: v }); })}

      {feel != null && (
        <div style={{ marginTop: 18 }}>
          <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".08em" }}>{t("session.fatigue.q")}</Mono>
          {row(FATIGUES, fatigue, (v) => { setFatigue(v); void save({ fatigue: v }); })}
        </div>
      )}

      {load != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
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
