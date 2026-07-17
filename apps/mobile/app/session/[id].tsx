import { useEffect, useRef, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  sessionClockTime,
  sessionVolume,
  blockBestE1rm,
  prsForSession,
  e1rmSeries,
  volumeByMuscle,
  conditioningSummary,
  cardioSummary,
  supersetLabels,
  setType,
  setTypeBadge,
  fmtWeight,
  fmtTonnage,
  displayLoad,
  kgToUnit,
  type WeightUnit,
  paceSeries,
  paceClock,
  formatCardioPr,
  cardioPrsForSession,
  sessionShape,
  sessionCardioTotals,
  formatSportDistance,
  headlineRunMove,
  mmss,
  type LoggedSession,
  type PrHit,
  type CardioPrHit,
} from "@hybrid/core";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { WorkoutShareCard, shareWorkout, type ShareBest } from "../../lib/share";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSessionsQuery } from "../../lib/queries";
import { useSessionActions } from "../../lib/session-actions";
import { fs, space, Screen, Card, Kicker, Mono, Loading, Button, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useTemplate } from "../../lib/template";
import { AuroraScreen, ABack } from "../../components/aurora/kit";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export default function SessionDetail() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  // Bodyweight-aware tonnage/e1RM — the athlete's weight AT this session's date.
  const bw = useBodyweightLookup();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardRef = useRef<View>(null);
  // The shared react-query sessions cache — coming from History this renders
  // instantly with zero network I/O instead of re-downloading every session.
  const q = useSessionsQuery();
  const all = q.data ?? null;
  const manage = useSessionActions();
  const busy = manage.busyId !== null;
  // A session logged seconds ago may not be in a still-fresh cache yet —
  // refetch ONCE when the id is missing before declaring it not found.
  const retriedRef = useRef(false);
  // Depend on q.data/q.refetch (stable), not the whole q object — its identity
  // changes every render, which would re-run the effect each time.
  useEffect(() => {
    if (!retriedRef.current && q.data && !q.data.some((s) => s.id === id)) {
      retriedRef.current = true;
      void q.refetch();
    }
  }, [id, q.data, q.refetch]);
  // Aurora wraps the review in the airy AuroraScreen (blob field + nav
  // clearance); classic keeps the glass Screen. Same content either way — the
  // shared Card/Mono primitives already round up on Aurora.
  const aurora = useTemplate().template === "aurora";
  const wrap = (node: ReactNode) =>
    aurora ? <AuroraScreen>{node}</AuroraScreen> : <Screen>{node}</Screen>;

  if (all === null) {
    return wrap(<Loading />);
  }

  const session = all.find((s) => s.id === id);
  const bwHere = session ? bw(session.startedAt) : null;
  if (!session) {
    // Still loading (or the one-shot cache-miss refetch is in flight) — don't
    // flash "not found" for a session that's about to arrive.
    if (q.isFetching || !retriedRef.current) return wrap(<Loading />);
    return wrap(
      <>
        <ABack />
        <Card style={{ marginTop: 12, alignItems: "center", paddingVertical: 28 }}>
          <Mono>{t("session.notFound")}</Mono>
        </Card>
      </>,
    );
  }

  const prs = prsForSession(all, session.id, bw);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const prSet = new Set(prs.map((p) => p.lift));
  const cardioPrMoves = new Set(cardioPrs.map((p) => p.move));
  const ssLabels = supersetLabels(session.blocks);
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
  const minutes =
    session.completedAt
      ? Math.max(1, Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
      : null;
  // Sport-adaptive headline: a run/match has no "volume", so cardio sessions read
  // as Duration · Distance · Pace; a lift keeps Minutes · Sets · Volume; a mixed
  // session shows both. (#4 — per-session, sport-specific stats.)
  const shape = sessionShape(session);
  const cardio = sessionCardioTotals(session.blocks);
  const cardioMin = cardio.minutes || minutes || 0;

  const bestMap = new Map<string, number>();
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const e = Math.round(blockBestE1rm(b, bwHere));
      if (e > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, e));
    }
  const bests: ShareBest[] = [...bestMap.entries()]
    .map(([name, e1rm]) => ({ name, e1rm, pr: prSet.has(name) }))
    .sort((a, b) => b.e1rm - a.e1rm);

  // Manage this workout — lives on the breakdown since the classic History
  // list (and its swipe actions) was retired for live sessions. The flow
  // itself (busy, confirm, invalidation, errors) is the shared useSessionActions.
  const doArchive = async () => {
    if (await manage.archive(session.id, true)) router.back();
  };
  const doDelete = () => manage.confirmDelete(session, () => router.back());

  const shareText = [
    `\u{1F4AA} ${session.title || "Workout"} — ${t("share.done")}`,
    `${minutes ? `${minutes} min – ` : ""}${sets} ${t("summary.sets").toLowerCase()} – ${fmtTonnage(sessionVolume(session.blocks, false, bwHere), units)}`,
    prs[0] ? `\u{1F3C6} ${prLine(prs[0], t, units)}` : bests[0] ? `${t("share.topLift")}: ${bests[0].name} ${fmtWeight(bests[0].e1rm, units)}` : null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");

  return wrap(
    <>
      <ABack />

      <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, marginTop: 10 }}>{session.title}</Text>
      <Mono style={{ marginTop: 4 }}>
        {fmtDate(session.startedAt)} – {sessionClockTime(session.startedAt)}
        {session.readiness != null ? ` – ${t("home.readiness")} ${session.readiness}` : ""}
      </Mono>

      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 16 }}>
        {shape === "cardio" ? (
          <>
            <Metric label={t("session.duration")} value={cardioMin ? `${cardioMin}` : "—"} />
            <Metric label={t("session.distance")} value={cardio.distanceKm > 0 ? formatSportDistance(cardio.distanceKm, headlineRunMove(session.blocks) ?? "") : "—"} />
            <Metric label={t("session.pace")} value={cardio.secPerKm ? `${paceClock(cardio.secPerKm)}` : "—"} />
          </>
        ) : (
          <>
            <Metric label={t("summary.minutes")} value={minutes != null ? String(minutes) : "—"} />
            <Metric label={t("summary.sets")} value={String(sets)} />
            <Metric label={t("summary.volumeMoved")} value={fmtTonnage(sessionVolume(session.blocks, false, bwHere), units)} />
          </>
        )}
      </View>

      {prs.length > 0 && (
        <View style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: C.lime, borderRadius: aurora ? 20 : 16, padding: 16, marginTop: 16 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>🏆 {prs.length} {t("summary.newPrs")}</Text>
          {prs.slice(0, 6).map((p) => (
            <Text key={p.lift} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, marginTop: 6 }}>{prLine(p, t, units)}</Text>
          ))}
        </View>
      )}

      {cardioPrs.length > 0 && (
        <View style={{ backgroundColor: `${C.blue}14`, borderWidth: 1, borderColor: C.blue, borderRadius: aurora ? 20 : 16, padding: 16, marginTop: 16 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.blue) }}>🏃 {cardioPrs.length} {t("summary.newCardioPrs")}</Text>
          {cardioPrs.slice(0, 6).map((p) => (
            <Text key={`${p.move}-${p.kind}`} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, marginTop: 6 }}>{cardioPrLineDetail(p, t)}</Text>
          ))}
        </View>
      )}

      {/* Muscle focus — what this session actually trained */}
      <MuscleFocus blocks={session.blocks} t={t} />

      {/* Per-exercise breakdown */}
      <View style={{ marginTop: 16 }}>
        {session.blocks.map((b, i) => (
          <Card key={i}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: b.kind === "strength" ? txt(C, C.lime) : b.kind === "cardio" ? txt(C, C.blue) : txt(C, C.violet) }}>{b.kind.toUpperCase()}</Text>
                {b.kind === "conditioning" ? (
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>
                    {prSet.has(b.name) ? "🏆 " : ""}{b.name}
                  </Text>
                ) : (
                  <Pressable onPress={() => router.push({ pathname: "/exercise", params: { name: b.name } })}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>
                      {prSet.has(b.name) ? "🏆 " : ""}{b.kind === "cardio" && cardioPrMoves.has(b.name) ? "🏃 " : ""}{b.name} <Text style={{ color: C.ash, fontSize: fs.body }}>›</Text>
                    </Text>
                  </Pressable>
                )}
                {ssLabels[i] && (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>⛓ {ssLabels[i]}</Text>
                )}
              </View>
              {b.kind === "strength" && blockBestE1rm(b, bwHere) > 0 && (
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>
                  {fmtWeight(blockBestE1rm(b, bwHere), units)} e1RM
                </Text>
              )}
            </View>

            {b.kind === "strength" ? (
              <View style={{ marginTop: 8 }}>
                {b.sets.map((s, j) => {
                  const st = setType(s);
                  const stAccent = st === "warmup" ? C.amber : st === "cooldown" ? C.blue : st === "drop" ? C.lime : C.ash;
                  const stTag = st === "warmup" ? " – warm-up" : st === "cooldown" ? " – cool-down" : st === "drop" ? " – drop" : "";
                  return (
                  <View key={j} style={{ flexDirection: "row", gap: space.md, paddingVertical: 4, borderTopWidth: j ? 1 : 0, borderTopColor: C.line }}>
                    <Mono color={stAccent} style={{ width: 22 }}>{setTypeBadge(s, j)}</Mono>
                    <Mono color={C.chalk} style={{ flex: 1 }}>{s.load ? `${displayLoad(s.load, units)} ${units}` : "–"} × {s.reps || "–"}{stTag}</Mono>
                    {s.rest != null ? <Mono color={C.ash}>{mmss(s.rest)} {t("workout.restShort")}</Mono> : null}
                    {s.rpe ? <Mono color={C.ash}>RPE {s.rpe}</Mono> : null}
                    {s.vel ? <Mono color={C.blue}>{s.vel} m/s</Mono> : null}
                  </View>
                  );
                })}
                <Trend series={e1rmSeries(all, b.name, bw).map((p) => Math.round(kgToUnit(p.e1rm, units)))} t={t} />
              </View>
            ) : b.kind === "cardio" ? (
              <>
                <Mono style={{ marginTop: 8 }}>{cardioSummary(b, { rpe: true })}</Mono>
                <PaceTrend series={paceSeries(all, b.name).map((p) => p.secPerKm)} t={t} />
              </>
            ) : (
              <Mono style={{ marginTop: 8 }}>{conditioningSummary(b, { rpe: true })}</Mono>
            )}
          </Card>
        ))}
      </View>

      {/* Shareable card — relive (and re-share) ANY session, like the finished
          workout (P5), not just strength ones. */}
      <>
        <View style={{ marginTop: 6 }}>
          <WorkoutShareCard ref={cardRef} t={t} units={units} stats={{ title: session.title, minutes: minutes ?? cardioMin ?? 0, sets, volume: sessionVolume(session.blocks, false, bwHere), bests }} />
        </View>
        <Pressable
          onPress={() => shareWorkout(cardRef, shareText, t("summary.share"))}
          style={{ backgroundColor: C.lime, borderRadius: aurora ? 999 : 14, paddingVertical: 15, alignItems: "center", marginTop: 14 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>{t("summary.share")}</Text>
        </Pressable>
      </>

      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 14 }}>
        <Button label={t("common.archive")} variant="outline" onPress={doArchive} disabled={busy} style={{ flex: 1 }} />
        <Button label={t("common.delete")} variant="outline" color={C.red} onPress={doDelete} disabled={busy} style={{ flex: 1 }} />
      </View>
    </>,
  );
}

const prLine = (p: PrHit, t: (k: string) => string, units: WeightUnit = "kg") =>
  p.previous == null
    ? `${p.lift} ${fmtWeight(p.e1rm, units)} (${t("summary.firstTime")})`
    : `${p.lift} ${fmtWeight(p.e1rm, units)} (+${fmtWeight(p.e1rm - p.previous, units)})`;

// Renders in the sport's natural unit (metres for swimming/rowing, km
// otherwise) — one shared core formatter, see formatCardioPr.
const cardioPrLineDetail = (p: CardioPrHit, t: (k: string) => string) =>
  formatCardioPr(p, t("summary.firstTime"));

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};

function MuscleFocus({ blocks, t }: { blocks: LoggedSession["blocks"]; t: (k: string) => string }) {
  const C = useTheme().palette;
  const vol = volumeByMuscle(blocks);
  if (vol.length === 0) return null;
  const max = vol[0]!.volume || 1;
  return (
    <Card style={{ marginTop: 16 }}>
      <Kicker>{t("session.muscleFocus")}</Kicker>
      <View style={{ marginTop: 10, gap: space.sm }}>
        {vol.map((m) => (
          <View key={m.muscle}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Mono color={C.chalk}>{MUSCLE_LABEL[m.muscle] ?? m.muscle}</Mono>
              <Mono color={C.ash}>{m.volume.toLocaleString()} kg</Mono>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: C.ink2, overflow: "hidden" }}>
              <View style={{ width: `${Math.max(6, (m.volume / max) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: C.lime }} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

// Dependency-free e1RM trend: scaled bars, latest highlighted.
function Trend({ series, t }: { series: number[]; t: (k: string) => string }) {
  const C = useTheme().palette;
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const delta = series[series.length - 1]! - series[0]!;
  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Kicker>{t("session.trend")}</Kicker>
        <Mono color={delta >= 0 ? C.lime : C.amber}>
          {delta >= 0 ? "+" : ""}{delta} kg – {series.length}×
        </Mono>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 30, gap: 3 }}>
        {series.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6 + ((v - min) / range) * 22,
              borderRadius: 2,
              backgroundColor: i === series.length - 1 ? C.lime : `${C.lime}55`,
            }}
          />
        ))}
      </View>
    </View>
  );
}

// Dependency-free pace trend (sec/km). Lower is faster, so a faster bar is
// TALLER; latest highlighted, delta shown as time saved (lime) or lost (amber).
function PaceTrend({ series, t }: { series: number[]; t: (k: string) => string }) {
  const C = useTheme().palette;
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const delta = series[series.length - 1]! - series[0]!; // negative = got faster
  const sign = delta <= 0 ? "−" : "+";
  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Kicker>{t("session.paceTrend")}</Kicker>
        <Mono color={delta <= 0 ? C.lime : C.amber}>
          {sign}{paceClock(Math.abs(delta))} /km – {series.length}×
        </Mono>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 30, gap: 3 }}>
        {series.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6 + ((max - v) / range) * 22,
              borderRadius: 2,
              backgroundColor: i === series.length - 1 ? C.blue : `${C.blue}55`,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const C = useTheme().palette;
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
