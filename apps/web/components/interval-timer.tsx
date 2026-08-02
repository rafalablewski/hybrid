"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { fs, space, buildIntervalPlan, intervalTotalSeconds, locateInterval, formatClock } from "@hybrid/core";
import { AuroraIcon } from "@/components/aurora/icons";
import { useTemplate } from "@/lib/use-template";
import { useLang } from "@/lib/i18n";

/**
 * Interval timer (web) — the web parity of the mobile interval timer, running
 * the identical @hybrid/core sequencing engine. Real work/rest countdown with
 * configurable rounds/work/rest and play · pause · reset.
 *
 * Works in BOTH templates: `embedded` (rendered inside the app-shell `<main>`,
 * reached from the sidebar / ⌘K) drops the full-screen chrome + back button;
 * standalone (the /timer route, e.g. from the landing page) keeps them. Radii
 * soften under Aurora and stay tighter under Classic, like the rest of the app.
 */
export default function IntervalTimerScreen({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { t } = useLang();
  const aurora = useTemplate().template === "aurora";
  const r = { card: aurora ? 18 : 12, field: aurora ? 14 : 10, ring: aurora ? 28 : 14 };
  const [rounds, setRounds] = useState(3);
  const [workSec, setWorkSec] = useState(40);
  const [restSec, setRestSec] = useState(20);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const plan = useMemo(() => buildIntervalPlan({ rounds, workSec, restSec, prepSec: 10 }), [rounds, workSec, restSec]);
  const total = useMemo(() => intervalTotalSeconds(plan), [plan]);
  const pos = locateInterval(plan, elapsed);
  const phase = pos.done ? null : plan[pos.phaseIndex]!;
  const kind = phase ? phase.kind : "done";

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= total) {
          setRunning(false);
          return total;
        }
        return e + 1;
      });
    }, 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [running, total]);

  const reset = () => { setRunning(false); setElapsed(0); };
  const editable = elapsed === 0 && !running;
  const kindColor = kind === "work" ? "var(--color-lime)" : kind === "rest" ? "var(--color-blue)" : kind === "prep" ? "var(--color-amber)" : "var(--color-violet)";
  const kindLabel = kind === "work" ? t("w.train.timer.work") : kind === "rest" ? t("w.train.timer.rest") : kind === "prep" ? t("w.train.timer.getReady") : t("w.train.timer.done");
  const progress = total > 0 ? elapsed / total : 0;
  const C = (v: string) => `var(--color-${v})`;

  const outer: CSSProperties = embedded
    ? { color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", flexDirection: "column", alignItems: "center" }
    : { minHeight: "100vh", background: C("ink"), color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 22px" };

  return (
    <div style={outer}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", gap: space.ms, alignItems: "center" }}>
          {!embedded && (
            <button className="pressable" onClick={() => router.push("/app")} aria-label={t("w.train.timer.back")} style={{ width: 44, height: 44, borderRadius: r.field, border: `1px solid ${C("line")}`, background: "var(--back-surface)", boxShadow: "var(--back-shadow)", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}>
              {aurora ? <AuroraIcon name="back" size={20} /> : <span style={{ fontSize: fs.heading }}>←</span>}
            </button>
          )}
          <div style={{ flex: 1, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: r.card, padding: "10px 14px", display: "flex", alignItems: "center", gap: space.ms }}>
            <AuroraIcon name="play" size={18} color={C("ash")} />
            <div>
              <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>{t("w.train.timer.intervalSession")}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{rounds} {t("w.train.timer.rounds")} – {workSec}s / {restSec}s</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontWeight: 900, fontSize: 28, marginTop: 18 }}>{pos.done ? t("w.train.timer.doneBang") : t("w.train.timer.go")}</div>

        {/* Screen-reader announcer: the big clock updates every second (announcing
            that would be unbearable), so instead this visually-hidden assertive
            region speaks ONLY the phase + round, which changes at work/rest
            boundaries — so a blind user hears "Work · Round 1/3", "Rest · …",
            "Done" as the timer progresses. Empty while idle so config edits
            aren't announced. */}
        <div
          aria-live="assertive"
          aria-atomic="true"
          style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}
        >
          {running || pos.done
            ? pos.done
              ? t("w.train.timer.done")
              : phase && phase.round > 0
                ? `${kindLabel} – ${t("w.train.timer.round")} ${phase.round}/${phase.totalRounds}`
                : kindLabel
            : ""}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 10 }}>
          <div style={{ position: "relative", width: 240, height: 240, borderRadius: "50%", border: `12px solid ${C("line")}`, display: "grid", placeItems: "center" }}>
            <div style={{ position: "absolute", inset: -12, borderRadius: "50%", border: `12px solid ${kindColor}`, opacity: 0.3 }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, textTransform: "uppercase", letterSpacing: 2, color: kindColor }}>{kindLabel}</div>
              <div style={{ fontWeight: 900, fontSize: 58 }}>{formatClock(pos.remaining)}</div>
              {!pos.done && phase && phase.round > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.train.timer.round")} {phase.round}/{phase.totalRounds}</div>
              )}
            </div>
          </div>
          <div style={{ width: 240, height: 6, borderRadius: 3, background: C("line"), marginTop: 18, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: C("lime") }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "center", marginTop: 22 }}>
          <button className="pressable" aria-label={t("common.reset")} onClick={reset} style={{ width: 56, height: 56, borderRadius: 28, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", fontSize: fs.title }}>↺</button>
          <button className="pressable" aria-label={running ? t("common.pause") : pos.done ? t("common.reset") : t("common.play")} onClick={() => (pos.done ? reset() : setRunning((r) => !r))} style={{ width: 78, height: 78, borderRadius: 39, background: C("lime"), color: "var(--on-accent)", border: "none", cursor: "pointer", fontWeight: 900, fontSize: 24 }}>
            {running ? "❚❚" : pos.done ? "↺" : "▶"}
          </button>
          <div style={{ width: 56 }} />
        </div>

        {editable && (
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: space.md }}>
            <Stepper label={t("w.train.timer.roundsLabel")} value={`${rounds}×`} onMinus={() => setRounds((v) => Math.max(1, v - 1))} onPlus={() => setRounds((v) => Math.min(20, v + 1))} />
            <Stepper label={t("w.train.timer.workLabel")} value={`${workSec}s`} onMinus={() => setWorkSec((v) => Math.max(5, v - 5))} onPlus={() => setWorkSec((v) => Math.min(300, v + 5))} />
            <Stepper label={t("w.train.timer.restLabel")} value={`${restSec}s`} onMinus={() => setRestSec((v) => Math.max(0, v - 5))} onPlus={() => setRestSec((v) => Math.min(300, v + 5))} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textAlign: "center", marginTop: 2 }}>{t("w.train.timer.total")} {formatClock(total)} {t("w.train.timer.leadIn")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const C = (v: string) => `var(--color-${v})`;
  const btn = (t: string, fn: () => void) => (
    <button className="pressable" onClick={fn} style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("lime"), cursor: "pointer", fontWeight: 900, fontSize: fs.heading }}>{t}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontWeight: 700, fontSize: fs.note }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: space.md }}>
        {btn("−", onMinus)}
        <div style={{ fontWeight: 900, fontSize: fs.heading, minWidth: 56, textAlign: "center" }}>{value}</div>
        {btn("+", onPlus)}
      </div>
    </div>
  );
}
