import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, AccessibilityInfo } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  buildIntervalPlan,
  intervalTotalSeconds,
  locateInterval,
  formatClock,
  type IntervalPhaseKind,
} from "@hybrid/core";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { F, PressScale as Pressable, TABULAR, fs, leading, space, trackFigure, tracking} from "../lib/ui";
import { AuroraScreen, APill, RADIUS } from "../components/aurora/kit";
import { AuroraIcon } from "../components/aurora/icons";

/**
 * Interval timer — a real work/rest stopwatch (the Figma "Workout" screen).
 * The pure sequencing/clock math lives in @hybrid/core (interval.ts); this owns
 * the tick. Configurable rounds/work/rest; play · pause · reset.
 */
export default function IntervalTimer() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const title = params.title || "Interval session";

  const [rounds, setRounds] = useState(3);
  const [workSec, setWorkSec] = useState(40);
  const [restSec, setRestSec] = useState(20);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const plan = useMemo(
    () => buildIntervalPlan({ rounds, workSec, restSec, prepSec: 10 }),
    [rounds, workSec, restSec],
  );
  const total = useMemo(() => intervalTotalSeconds(plan), [plan]);
  const pos = locateInterval(plan, elapsed);
  const phase = pos.done ? null : plan[pos.phaseIndex]!;
  const kind: IntervalPhaseKind | "done" = phase ? phase.kind : "done";

  // The tick: advance once per second while running; stop at the end.
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
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running, total]);

  const reset = () => {
    setRunning(false);
    setElapsed(0);
  };
  const editable = elapsed === 0 && !running;

  const kindColor = kind === "work" ? C.lime : kind === "rest" ? C.blue : kind === "prep" ? C.amber : C.red;
  const kindLabel = kind === "work" ? t("w.train.timer.work") : kind === "rest" ? t("w.train.timer.rest") : kind === "prep" ? t("w.train.timer.getReady") : t("w.train.timer.done");

  // Screen-reader announcer — speak the phase + round at each work/rest
  // boundary (the per-second clock is never announced; that would be unbearable
  // for a VoiceOver/TalkBack user). Mirrors the web aria-live region. The ref
  // dedupes so a given phase is announced once, not on every tick re-render.
  const lastAnnounce = useRef("");
  useEffect(() => {
    if (!running && !pos.done) return;
    const msg = pos.done
      ? t("w.train.timer.done")
      : phase && phase.round > 0
        ? `${kindLabel} – ${t("w.train.timer.round")} ${phase.round}/${phase.totalRounds}`
        : kindLabel;
    if (msg !== lastAnnounce.current) {
      lastAnnounce.current = msg;
      AccessibilityInfo.announceForAccessibility(msg);
    }
  }, [kind, phase?.round, phase?.totalRounds, pos.done, running, kindLabel]);
  const progress = total > 0 ? elapsed / total : 0;

  return (
    <AuroraScreen
      scroll={false}
      // The bordered lockup that named the running interval was a hero in
      // disguise: the name is the title, the prescription is the meta line.
      hero={{ rank: "title", title, meta: [`${rounds} rounds`, `${workSec}s / ${restSec}s`] }}
    >

      <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, textAlign: "center", marginTop: 16 }}>
        {pos.done ? "Done!" : "Go!"}
      </Text>

      {/* ring */}
      <View style={{ alignItems: "center", marginTop: 8 }}>
        <View style={{ width: 230, height: 230, borderRadius: 115, borderWidth: 12, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", width: 230, height: 230, borderRadius: 115, borderWidth: 12, borderColor: txt(C, kindColor), opacity: 0.25 }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, textTransform: "uppercase", letterSpacing: tracking(fs.caption, "caps"), color: txt(C, kindColor) }}>{kindLabel}</Text>
          <Text style={{ ...TABULAR, fontFamily: F.black, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: C.chalk }}>{formatClock(pos.remaining, true)}</Text>
          {!pos.done && phase && phase.round > 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Round {phase.round}/{phase.totalRounds}</Text>
          )}
        </View>
        {/* linear progress of whole session */}
        <View style={{ width: 230, height: 6, borderRadius: RADIUS.mark, backgroundColor: C.line, marginTop: 18, overflow: "hidden" }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: "100%", backgroundColor: C.lime }} />
        </View>
      </View>

      {/* controls */}
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "center", justifyContent: "center", marginTop: 22 }}>
        <Pressable onPress={reset} style={{ width: 56, height: 56, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>↺</Text>
        </Pressable>
        <Pressable
          onPress={() => (pos.done ? reset() : setRunning((r) => !r))}
          style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.onAccent }}>{running ? "❚❚" : pos.done ? "↺" : "▶"}</Text>
        </Pressable>
        <View style={{ width: 56 }} />
      </View>

      {/* config (only before start) */}
      {editable && (
        <View style={{ marginTop: 24, gap: space.ms }}>
          <Stepper label="Rounds" value={rounds} onChange={(d) => setRounds((v) => Math.max(1, Math.min(20, v + d)))} suffix="" />
          <Stepper label="Work" value={workSec} onChange={(d) => setWorkSec((v) => Math.max(5, Math.min(300, v + d * 5)))} suffix="s" step={5} />
          <Stepper label="Rest" value={restSec} onChange={(d) => setRestSec((v) => Math.max(0, Math.min(300, v + d * 5)))} suffix="s" step={5} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, textAlign: "center", marginTop: 4 }}>
            Total {formatClock(total)} – 10s lead-in
          </Text>
        </View>
      )}

      {!editable && pos.done && (
        <View style={{ marginTop: 24 }}>
          <APill label="Finish" onPress={() => router.back()} />
        </View>
      )}
    </AuroraScreen>
  );
}

function Stepper({ label, value, onChange, suffix, step = 1 }: { label: string; value: number; onChange: (dir: number) => void; suffix: string; step?: number }) {
  const { palette: C } = useTheme();
  const btn = (t: string, d: number) => (
    <Pressable onPress={() => onChange(d)} style={{ width: 44, height: 44, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: txt(C, C.lime) }}>{t}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        {btn("−", -1)}
        <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk, minWidth: 56, textAlign: "center" }}>{value}{suffix}{step > 1 ? "" : "×"}</Text>
        {btn("+", 1)}
      </View>
    </View>
  );
}
