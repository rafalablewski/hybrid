"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, space,
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  newPrsInSession,
  newCardioPrsInSession,
  sessionVolume,
  blockBestE1rm,
  fmtTonnage,
  fmtWeight,
  type WeightUnit,
  type PrHit,
  type CardioPrHit,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import WorkoutBlocks, { uid, type EditableBlock } from "@/components/workout-blocks";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useWorkoutTimer, mmss } from "@/lib/use-workout-timer";
import { useLang } from "@/lib/i18n";

type FinishData = {
  title: string;
  sets: number;
  volume: number;
  prs: PrHit[];
  cardioPrs: CardioPrHit[];
  firstEver: boolean;
};

type Routine = { id: string; name: string; blocks: SessionBlock[] };

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;
const pill = (token: string): React.CSSProperties => {
  const c = C(token);
  return { fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, borderRadius: 999, padding: "8px 16px", cursor: "pointer" };
};

/** AURORA Logger (web) — AI prescription + routines + the WorkoutBlocks editor,
 *  reusing the exact prescribeSession engine and /api/sessions + /api/templates. */
export default function AuroraLogger({
  sessions,
  onSaved,
  initialBlocks,
}: {
  sessions: LoggedSession[];
  onSaved: () => void;
  initialBlocks?: SessionBlock[];
}) {
  const { t } = useLang();
  const [title, setTitle] = useState(() => t("w.train.logger.workout"));
  const [blocks, setBlocks] = useState<EditableBlock[]>(
    () => initialBlocks?.map((b) => ({ uid: uid(), ...b }) as EditableBlock) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineMsg, setRoutineMsg] = useState("");
  // The finish CELEBRATION — at parity with the mobile summary. Finishing is the
  // payoff, so instead of silently navigating away we land on a win screen.
  const [done, setDone] = useState<FinishData | null>(null);
  const prefs = useLoggerPrefs();
  // Live workout clock — starts the moment you enter to log (after the get-ready
  // count-in), so the saved session records real training time. Web twin of the
  // mobile live logger's timer.
  const { elapsed, countdown, startedAt, stop } = useWorkoutTimer();

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setRoutines(d.templates ?? []))
      .catch(() => {});
  }, []);

  const loadRoutine = (r: Routine) => {
    setBlocks(r.blocks.map((b) => ({ uid: uid(), ...b }) as EditableBlock));
    setTitle(r.name);
  };

  const saveAsRoutine = async () => {
    setRoutineMsg("");
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title.trim() || t("w.train.logger.defaultRoutine"), blocks: blocks.map(({ uid: _u, ...b }) => b) }),
      });
      if (!res.ok) {
        setRoutineMsg(res.status === 401 ? t("w.train.logger.signInRoutines") : t("w.train.logger.saveRoutineErr"));
        return;
      }
      const d = (await res.json()) as { template: Routine };
      setRoutines((rs) => [d.template, ...rs]);
      setRoutineMsg(t("w.train.logger.savedRoutine"));
    } catch {
      setRoutineMsg(t("w.train.logger.networkError"));
    }
  };

  const rx = useMemo(() => {
    const log = toTrainingLog(sessions);
    return prescribeSession(log, undefined, { profiles: velocityProfiles(sessions) });
  }, [sessions]);

  const loadPrescribed = () => {
    setBlocks(
      rx.blocks.map((b) => {
        if (b.kind === "strength") return { uid: uid(), kind: "strength", name: b.name, sets: b.sets };
        if (b.kind === "cardio")
          return {
            uid: uid(),
            kind: "cardio",
            name: b.name,
            ...(b.distance != null ? { distance: b.distance } : {}),
            ...(b.minutes != null ? { minutes: b.minutes } : {}),
          };
        return {
          uid: uid(),
          kind: "conditioning",
          name: b.name,
          format: b.format,
          ...(b.work != null ? { work: b.work } : {}),
          ...(b.rest != null ? { rest: b.rest } : {}),
          ...(b.rounds != null ? { rounds: b.rounds } : {}),
          minutes:
            b.minutes ??
            (b.work && b.rest && b.rounds ? Math.round((b.rounds * (b.work + b.rest)) / 60) : undefined),
        };
      }),
    );
    setTitle(t("w.train.logger.aiPrescribed"));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const payload = {
      title: title.trim() || "Workout",
      readiness: rx.readiness,
      // The clock's real start (after the count-in) → true session duration.
      startedAt: startedAt.current.toISOString(),
      completedAt: new Date().toISOString(),
      blocks: blocks.map(({ uid: _uid, ...b }) => b),
    };
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setError(t("w.train.logger.signInSessions"));
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setError(`${t("w.train.logger.saveErrorPrefix")}${res.status}${t("w.train.logger.saveErrorSuffix")}`);
        setSaving(false);
        return;
      }
      // Compute the win against everything done before this session, then land
      // on the celebration (the parent's onSaved fires when they tap Done).
      const cleanBlocks = payload.blocks as SessionBlock[];
      const finished: LoggedSession = {
        id: "new",
        title: payload.title,
        startedAt: payload.startedAt,
        completedAt: payload.completedAt,
        blocks: cleanBlocks,
      };
      setSaving(false);
      stop(); // freeze the clock — the workout's done, the celebration is next
      setDone({
        title: payload.title,
        sets: cleanBlocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0),
        volume: sessionVolume(cleanBlocks),
        prs: newPrsInSession(finished, sessions),
        cardioPrs: newCardioPrsInSession(finished, sessions),
        firstEver: sessions.length === 0,
      });
    } catch {
      setError(t("w.train.logger.networkError"));
      setSaving(false);
    }
  };

  if (done) return <Finish data={done} units={prefs.units} onDone={onSaved} />;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* Live workout clock — the gym timer running while you log (sticky so it
          stays visible as you scroll the session). */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          marginBottom: 16,
          padding: "10px 16px",
          background: "color-mix(in srgb, var(--color-ink2) 86%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${C("line")}`,
          borderRadius: 999,
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, letterSpacing: 1, color: C("chalk") }}>{mmss(elapsed)}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".18em", color: C("ash") }}>{t("workout.elapsed")}</span>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("violet") }}>
            {t("w.train.logger.aiCoach")}{sessions.length > 0 ? ` · ${t("w.train.logger.readiness")} ${rx.readiness}/100` : ""}
          </div>
          <button onClick={loadPrescribed} style={pill("violet")}>
            {sessions.length > 0 ? t("w.train.logger.usePrescribed") : t("w.train.logger.startSession")}
          </button>
        </div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.5, marginTop: 8, color: C("ash") }}>
          {sessions.length > 0
            ? rx.why
            : t("w.train.logger.coachIntro")}
        </p>
      </div>

      {routines.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>{t("w.train.logger.yourRoutines")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
            {routines.map((r) => (
              <button key={r.id} onClick={() => loadRoutine(r)} style={pill("lime")} title={r.blocks.map((b) => b.name).join(" · ")}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: space.sm }}>
        <button
          onClick={() => setLoggerPref("detailed", !prefs.detailed)}
          style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
          title={t("w.train.logger.toggleRpeVel")}
        >
          {prefs.detailed ? t("w.train.logger.detailed") : t("w.train.logger.simple")}
        </button>
        {prefs.detailed && (
          <button
            onClick={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)}
            style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
            title={t("w.train.logger.logEffortAs")}
          >
            {prefs.rpeAsRir ? "RIR" : "RPE"}
          </button>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("w.train.logger.sessionTitlePh")}
        style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", outline: "none", boxSizing: "border-box", width: "100%", marginBottom: 14 }}
      />

      <WorkoutBlocks
        blocks={blocks}
        setBlocks={setBlocks}
        emptyHint={t("w.train.logger.emptyHint")}
        reorder
        detailed={prefs.detailed}
        rirMode={prefs.rpeAsRir}
        units={prefs.units}
        plateCalc={prefs.plateCalc}
      />

      {error && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginBottom: 10, color: C("red") }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: space.ms, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={saving || blocks.length === 0}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: fs.note,
            background: C("lime"),
            color: C("ink"),
            border: "none",
            borderRadius: 999,
            padding: "14px 28px",
            cursor: saving || blocks.length === 0 ? "default" : "pointer",
            opacity: saving || blocks.length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? t("w.train.logger.saving") : t("w.train.logger.saveSession")}
        </button>
        <button
          onClick={saveAsRoutine}
          disabled={blocks.length === 0}
          style={{ ...pill("lime"), padding: "13px 22px", opacity: blocks.length === 0 ? 0.5 : 1, cursor: blocks.length === 0 ? "default" : "pointer" }}
          title={t("w.train.logger.saveRoutineTitle")}
        >
          {t("w.train.logger.saveAsRoutine")}
        </button>
        {routineMsg && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: routineMsg.startsWith("★") ? C("lime") : C("ash") }}>{routineMsg}</span>}
      </div>

      {/* Get-ready count-in — covers the screen on entry until GO, then the
          elapsed clock starts from zero (the timer "goes off"). */}
      {countdown != null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C("ink"), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, letterSpacing: ".2em", color: C("ash"), marginBottom: 12 }}>{t("workout.getReady").toUpperCase()}</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: countdown > 0 ? 132 : 96, color: C("lime"), lineHeight: 1 }}>
            {countdown > 0 ? countdown : t("workout.go")}
          </div>
        </div>
      )}
    </div>
  );
}

/** The finish CELEBRATION — the web twin of the mobile workout summary. A win
 *  should LAND: the hero + PR cards pop in (.win-pop), and on a PR/first we fire
 *  a short navigator.vibrate where the device supports it (the web analog of the
 *  native success haptic). */
function Finish({ data, units, onDone }: { data: FinishData; units: WeightUnit; onDone: () => void }) {
  const { t } = useLang();
  const { title, sets, volume, prs, cardioPrs, firstEver } = data;
  const milestone = firstEver || prs.length > 0 || cardioPrs.length > 0;
  useEffect(() => {
    if (milestone && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.([12, 40, 18]); } catch { /* unsupported */ }
    }
  }, [milestone]);
  const prLine = (p: PrHit) =>
    p.previous == null
      ? `${p.lift} ${fmtWeight(p.e1rm, units)} ${t("w.train.logger.firstTime")}`
      : `${p.lift} ${fmtWeight(p.e1rm, units)} (+${fmtWeight(p.e1rm - p.previous, units)})`;
  const cardioLine = (p: CardioPrHit) => (p.kind === "distance" ? `${p.move} ${p.value} km` : `${p.move} — ${t("w.train.logger.fasterPace")}`);
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div className="win-pop" style={{ textAlign: "center", marginTop: 8, marginBottom: 18 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", margin: "0 auto", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--color-lime) 14%, transparent)", border: `2px solid ${C("lime")}`, fontSize: 36 }}>{firstEver ? "🎉" : "✓"}</div>
        <div style={{ fontWeight: 900, fontSize: 28, marginTop: 14 }}>{firstEver ? t("w.train.logger.firstDone") : t("w.train.logger.sessionComplete")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginTop: 6 }}>{sets} {t("w.train.logger.sets")} · {fmtTonnage(volume, units)}{title ? ` · ${title}` : ""}</div>
      </div>

      {prs.length > 0 && (
        <div className="win-pop" style={{ ...card, borderColor: C("lime"), background: "color-mix(in srgb, var(--color-lime) 8%, transparent)", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: fs.subtitle, color: C("lime") }}>🏆 {prs.length} {prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}</div>
          {prs.slice(0, 5).map((p) => (
            <div key={p.lift} style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 6 }}>{prLine(p)}</div>
          ))}
        </div>
      )}

      {cardioPrs.length > 0 && (
        <div className="win-pop" style={{ ...card, borderColor: C("blue"), background: "color-mix(in srgb, var(--color-blue) 8%, transparent)", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: fs.subtitle, color: C("blue") }}>🏃 {cardioPrs.length} {cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}</div>
          {cardioPrs.slice(0, 5).map((p) => (
            <div key={`${p.move}-${p.kind}`} style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 6 }}>{cardioLine(p)}</div>
          ))}
        </div>
      )}

      <button onClick={onDone} style={{ width: "100%", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.note, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: "14px 28px", cursor: "pointer", marginTop: 6 }}>
        {t("w.train.logger.done")}
      </button>
    </div>
  );
}
