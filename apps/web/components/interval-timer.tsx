"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildIntervalPlan, intervalTotalSeconds, locateInterval, formatClock } from "@hybrid/core";
import { AuroraIcon } from "@/components/aurora/icons";

/**
 * Interval timer (web) — the web parity of the mobile interval timer, running
 * the identical @hybrid/core sequencing engine. Real work/rest countdown with
 * configurable rounds/work/rest and play · pause · reset.
 */
export default function IntervalTimerScreen() {
  const router = useRouter();
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
  const kindLabel = kind === "work" ? "Work" : kind === "rest" ? "Rest" : kind === "prep" ? "Get ready" : "Done";
  const progress = total > 0 ? elapsed / total : 0;
  const C = (v: string) => `var(--color-${v})`;

  return (
    <div style={{ minHeight: "100vh", background: C("ink"), color: C("chalk"), fontFamily: "var(--font-display)", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 22px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => router.push("/app")} style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center" }}>
            <AuroraIcon name="back" size={20} />
          </button>
          <div style={{ flex: 1, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 18, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <AuroraIcon name="play" size={18} color={C("ash")} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Interval session</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash") }}>{rounds} rounds · {workSec}s / {restSec}s</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontWeight: 900, fontSize: 28, marginTop: 18 }}>{pos.done ? "Done!" : "Go!"}</div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 10 }}>
          <div style={{ position: "relative", width: 240, height: 240, borderRadius: "50%", border: `12px solid ${C("line")}`, display: "grid", placeItems: "center" }}>
            <div style={{ position: "absolute", inset: -12, borderRadius: "50%", border: `12px solid ${kindColor}`, opacity: 0.3 }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: 2, color: kindColor }}>{kindLabel}</div>
              <div style={{ fontWeight: 900, fontSize: 58 }}>{formatClock(pos.remaining)}</div>
              {!pos.done && phase && phase.round > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>Round {phase.round}/{phase.totalRounds}</div>
              )}
            </div>
          </div>
          <div style={{ width: 240, height: 6, borderRadius: 3, background: C("line"), marginTop: 18, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: C("lime") }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "center", marginTop: 22 }}>
          <button onClick={reset} style={{ width: 56, height: 56, borderRadius: 28, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", fontSize: 18 }}>↺</button>
          <button onClick={() => (pos.done ? reset() : setRunning((r) => !r))} style={{ width: 78, height: 78, borderRadius: 39, background: C("lime"), color: C("ink"), border: "none", cursor: "pointer", fontWeight: 900, fontSize: 24 }}>
            {running ? "❚❚" : pos.done ? "↺" : "▶"}
          </button>
          <div style={{ width: 56 }} />
        </div>

        {editable && (
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 12 }}>
            <Stepper label="Rounds" value={`${rounds}×`} onMinus={() => setRounds((v) => Math.max(1, v - 1))} onPlus={() => setRounds((v) => Math.min(20, v + 1))} />
            <Stepper label="Work" value={`${workSec}s`} onMinus={() => setWorkSec((v) => Math.max(5, v - 5))} onPlus={() => setWorkSec((v) => Math.min(300, v + 5))} />
            <Stepper label="Rest" value={`${restSec}s`} onMinus={() => setRestSec((v) => Math.max(0, v - 5))} onPlus={() => setRestSec((v) => Math.min(300, v + 5))} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), textAlign: "center", marginTop: 2 }}>Total {formatClock(total)} · 10s lead-in</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const C = (v: string) => `var(--color-${v})`;
  const btn = (t: string, fn: () => void) => (
    <button onClick={fn} style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("lime"), cursor: "pointer", fontWeight: 900, fontSize: 20 }}>{t}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {btn("−", onMinus)}
        <div style={{ fontWeight: 900, fontSize: 20, minWidth: 56, textAlign: "center" }}>{value}</div>
        {btn("+", onPlus)}
      </div>
    </div>
  );
}
