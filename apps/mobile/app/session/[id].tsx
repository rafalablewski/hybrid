import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Animated, Easing, type TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  sessionClockTime,
  sessionVolume,
  blockTopLoad,
  formatStrengthPr,
  prsForSession,
  e1rmSeries,
  e1rmPointReading,
  conditioningSummary,
  cardioSummary,
  supersetLabels,
  setType,
  setTypeBadge,
  fmtWeight,
  fmtTonnage,
  kgToUnit,
  type WeightUnit,
  paceSeries,
  pacePointReading,
  paceClock,
  formatCardioPr,
  cardioPrsForSession,
  sessionShape,
  sessionCardioSummary,
  deviceTrueSession,
  formatSportDistance,
  headlineRunMove,
  mmss,
  sessionCelebration,
  statCountUp,
  type PrHit,
  type CardioPrHit,
  type E1rmPoint,
  type PacePoint,

  setLoadText,
  ALPHA, FEEDBACK } from "@hybrid/core";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSessionsQuery } from "../../lib/queries";
import { useSessionActions } from "../../lib/session-actions";
import { fs, space, Kicker, Mono, Loading, F, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useChartScrub } from "../../components/aurora/chart-scrub";
import { AuroraScreen, ACard, cardStack } from "../../components/aurora/kit";
import { HeroNav } from "../../components/aurora/hero";
import { WorkoutWrapped } from "../../components/workout-wrapped";
import { SessionEditSheet } from "../../components/session-edit";
import PrAttestationPanel from "../../components/pr-attestation";
import { withAlpha } from "../../components/aurora/field";
import { Glyph } from "../../components/aurora/icons";

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
  // The shared react-query sessions cache — coming from History this renders
  // instantly with zero network I/O instead of re-downloading every session.
  const q = useSessionsQuery();
  const all = q.data ?? null;
  const manage = useSessionActions();
  const busy = manage.busyId !== null;
  // The "Wrapped" recap + story-share overlay (premium panels + story picker).
  const [wrappedOpen, setWrappedOpen] = useState(false);
  // "Edit session" — correcting the figures this session was logged with.
  const [editOpen, setEditOpen] = useState(false);
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
  // The review is wrapped in the airy AuroraScreen (blob field + nav
  // clearance). This used to read the template flag and never use it: the
  // ternary that once chose a glass Screen had already collapsed to one arm,
  // and the flag was left behind reading a union of one.
  const wrap = (node: ReactNode) => <AuroraScreen>{node}</AuroraScreen>;

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
        <HeroNav onPress={() => router.back()} />
        <ACard style={[cardStack, { marginTop: 12, alignItems: "center", paddingVertical: 28 }]}>
          <Mono>{t("session.notFound")}</Mono>
        </ACard>
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
  // Sport-adaptive headline: a run/match has no "volume", so the discipline
  // decides WHICH figures the Wrapped tiles carry (a lift gets tonnage, sets
  // and time; a run gets time, distance and pace; a mixed session shows both).
  // WHAT ORDER they then read in is not decided here or there — it is core's
  // one figure order (figure-order.ts). (#4 — per-session, sport-specific stats.)
  const shape = sessionShape(session);
  const cardio = sessionCardioSummary(session);
  const cardioMin = cardio.minutes || minutes || 0;

  // Manage this workout — lives on the breakdown since the classic History
  // list (and its swipe actions) was retired for live sessions. The flow
  // itself (busy, confirm, invalidation, errors) is the shared useSessionActions.
  const doArchive = async () => {
    if (await manage.archive(session.id, true)) router.back();
  };
  const doDelete = () => manage.confirmDelete(session, () => router.back());


  // The workout's set breakdown + manage row — shown as the trailing "details"
  // section beneath the Wrapped panels (the reveal → premium recap → share IS
  // the screen now; see WorkoutWrapped).
  const details = (
    <>
      <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("session.theSession")}</Text>
      <Mono style={{ marginTop: 4 }}>
        {fmtDate(session.startedAt)} – {sessionClockTime(session.startedAt)}
        {session.readiness != null ? ` – ${t("home.readiness")} ${session.readiness}` : ""}
      </Mono>

      {prs.length + cardioPrs.length > 1 && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginTop: 16 }}>
          {prs.map((p) => (
            <View key={p.lift} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}><Glyph name="trophy" size={fs.caption} color={C.amber} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{prLine(p, t, units)}</Text></View>
          ))}
          {cardioPrs.map((p) => (
            <View key={`${p.move}-${p.kind}`} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}><Glyph name="trophy" size={fs.caption} color={C.amber} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{cardioPrLineDetail(p, t)}</Text></View>
          ))}
        </View>
      )}

      {/* The Verified Strength Record's read on this session's PRs — tier
          badges + the ask-a-witness flow. See core/attestation.ts. */}
      {prs.length > 0 && (
        <PrAttestationPanel
          sessionId={session.id}
          lifts={prs.map((p) => ({ lift: p.lift, topLoad: p.topLoad }))}
          hasDevice={!!session.device}
          units={units}
        />
      )}

      <View style={{ marginTop: 16 }}>
        {/* The breakdown reads the session as the DEVICE measured it — the typed
            figures live on the summary's comparison panel and nowhere else. */}
        {deviceTrueSession(session).blocks.map((b, i) => (
          <View key={i} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, paddingBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: b.kind === "strength" ? txt(C, C.lime) : b.kind === "cardio" ? txt(C, C.blue) : txt(C, C.amber) }}>{b.kind.toUpperCase()}</Text>
                {prSet.has(b.name) || (b.kind === "cardio" && cardioPrMoves.has(b.name)) ? <Glyph name="trophy" size={fs.body} color={C.amber} label={t("w.train.logger.newPr")} /> : null}
                {b.kind === "conditioning" ? (
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>
                    {b.name}
                  </Text>
                ) : (
                  <Pressable onPress={() => router.push({ pathname: "/exercise", params: { name: b.name } })}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>
                      {b.name} <Text style={{ color: C.ash, fontSize: fs.body }}>›</Text>
                    </Text>
                  </Pressable>
                )}
                {ssLabels[i] && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Glyph name="link" size={fs.nano} color={txt(C, C.lime) as string} /><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>{ssLabels[i]}</Text></View>
                )}
              </View>
              {/* The heaviest weight actually moved — an athlete reads this as
                  "what I lifted", so it can't be an estimate (#231). */}
              {b.kind === "strength" && blockTopLoad(b, bwHere) > 0 && (
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>
                  {fmtWeight(blockTopLoad(b, bwHere), units)}
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
                    {/* THE LOAD A SET ACTUALLY MOVED, bodyweight included. A
                        raw `s.load` is empty for a pull-up, so five sets of a
                        75 kg PR printed "– × 7" directly under a header reading
                        75 kg — the athlete's own weight is known here (bwHere)
                        and already spent on the header two lines up. Assisted
                        and weighted variants resolve through the same core
                        helper the tonnage does, so the rows and the totals can
                        never disagree about what was lifted. */}
                    <Mono color={C.chalk} style={{ flex: 1 }}>{setLoadText(b.name, s.load, bwHere, units) ?? "–"} × {s.reps || "–"}{stTag}</Mono>
                    {s.rest != null ? <Mono color={C.ash}>{mmss(s.rest)} {t("w.train.blocks.rest")}</Mono> : null}
                    {s.rpe ? <Mono color={C.ash}>RPE {s.rpe}</Mono> : null}
                    {s.vel ? <Mono color={C.blue}>{s.vel} m/s</Mono> : null}
                  </View>
                  );
                })}
                <Trend
                  points={e1rmSeries(all, b.name, bw)}
                  series={e1rmSeries(all, b.name, bw).map((p) => Math.round(kgToUnit(p.e1rm, units)))}
                  units={units}
                  t={t}
                />
              </View>
            ) : b.kind === "cardio" ? (
              <>
                <Mono style={{ marginTop: 8 }}>{cardioSummary(b, { rpe: true })}</Mono>
                <PaceTrend points={paceSeries(all, b.name)} series={paceSeries(all, b.name).map((p) => p.secPerKm)} t={t} />
              </>
            ) : (
              <Mono style={{ marginTop: 8 }}>{conditioningSummary(b, { rpe: true })}</Mono>
            )}
          </View>
        ))}
      </View>

      {/* MAINTENANCE, NOT CONTENT. Three outline pills gave correcting a typo
          the same visual weight as the session it corrects; on a screen whose
          panels carry no chrome at all, they were the loudest thing on it.
          They read as one quiet row now, on the same hairline as everything
          else, with delete in the error tone and its confirm still in front of
          it. Correcting a wrong number leads: it is far more common than a
          workout you want gone (see components/session-edit.tsx). */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: 22, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
        <Pressable onPress={() => setEditOpen(true)} disabled={busy} accessibilityRole="button">
          <Mono color={C.chalk}>{t("session.edit.cta")}</Mono>
        </Pressable>
        <Pressable onPress={doArchive} disabled={busy} accessibilityRole="button">
          <Mono color={C.ash}>{t("w.analyze.hist.archive")}</Mono>
        </Pressable>
        <Pressable onPress={doDelete} disabled={busy} accessibilityRole="button">
          <Mono color={FEEDBACK.error.text}>{t("common.delete")}</Mono>
        </Pressable>
      </View>

      <SessionEditSheet
        session={session}
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => void q.refetch()}
      />
    </>
  );

  // The individual session IS the experience: reveal (if a PR) → premium Wrapped
  // panels → story share, with the breakdown/manage riding along as `details`.
  return (
    <WorkoutWrapped session={session} all={all} units={units} bw={bw} onBack={() => router.back()} details={details} />
  );
}

const prLine = (p: PrHit, t: (k: string) => string, units: WeightUnit = "kg") =>
  formatStrengthPr(p, { first: t("summary.firstTime"), moreReps: t("summary.morePrReps") }, units);

// Renders in the sport's natural unit (metres for swimming/rowing, km
// otherwise) — one shared core formatter, see formatCardioPr.
const cardioPrLineDetail = (p: CardioPrHit, t: (k: string) => string) =>
  formatCardioPr(p, t("summary.firstTime"));

/** A trend point's date, as the strip prints it. */
const fmtPointDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

/**
 * Dependency-free e1RM trend: scaled bars, latest highlighted.
 *
 * The strip is 30dp tall and carries no axis, so holding it is the only way to
 * ask which session a bar was. Held, the row above answers — the DELTA line
 * becomes that point's e1RM and its date, which is the same swap the Trends
 * bands and the lane tiles make, in the one slot this strip already has.
 */
function Trend({ points, series, t, units }: { points: E1rmPoint[]; series: number[]; t: (k: string) => string; units: WeightUnit }) {
  const C = useTheme().palette;
  const scrub = useChartScrub(series.length, "band");
  const read = scrub.index >= 0 ? e1rmPointReading(points, scrub.index, units) : null;
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const delta = series[series.length - 1]! - series[0]!;
  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Kicker>{t("session.trend")}</Kicker>
        {read ? (
          <Mono color={read.best ? C.lime : C.chalk}>
            {read.value} {read.unit} – {fmtPointDate(read.weekStart)}
          </Mono>
        ) : (
          <Mono color={delta >= 0 ? C.lime : C.amber}>
            {delta >= 0 ? "+" : ""}{delta} kg – {series.length}×
          </Mono>
        )}
      </View>
      <View {...scrub.bind} style={{ flexDirection: "row", alignItems: "flex-end", height: 30, gap: 3 }}>
        {series.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6 + ((v - min) / range) * 22,
              borderRadius: 2,
              backgroundColor: (scrub.index >= 0 ? i === scrub.index : i === series.length - 1) ? C.lime : withAlpha(C.lime, ALPHA.line),
            }}
          />
        ))}
      </View>
    </View>
  );
}

// Dependency-free pace trend (sec/km). Lower is faster, so a faster bar is
// TALLER; latest highlighted, delta shown as time saved (lime) or lost (amber).
function PaceTrend({ points, series, t }: { points: PacePoint[]; series: number[]; t: (k: string) => string }) {
  const C = useTheme().palette;
  const scrub = useChartScrub(series.length, "band");
  const read = scrub.index >= 0 ? pacePointReading(points, scrub.index) : null;
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
        {read ? (
          <Mono color={read.best ? C.lime : C.chalk}>
            {read.value} {read.unit} – {fmtPointDate(read.weekStart)}
          </Mono>
        ) : (
          <Mono color={delta <= 0 ? C.lime : C.amber}>
            {sign}{paceClock(Math.abs(delta))} /km – {series.length}×
          </Mono>
        )}
      </View>
      <View {...scrub.bind} style={{ flexDirection: "row", alignItems: "flex-end", height: 30, gap: 3 }}>
        {series.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6 + ((max - v) / range) * 22,
              borderRadius: 2,
              backgroundColor: (scrub.index >= 0 ? i === scrub.index : i === series.length - 1) ? C.blue : withAlpha(C.blue, ALPHA.line),
            }}
          />
        ))}
      </View>
    </View>
  );
}
