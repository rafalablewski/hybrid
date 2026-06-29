import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, prescribeForSport, reconcilePlan, buildTrainingWeek,
  trainingDaysPerWeek, weekNeedsResync, velocityProfiles, toTrainingLog,
  SPORTS, LEVELS,
  type LoggedSession, type Biometrics, type Macrocycle, type Experience, type Equipment,
} from "@hybrid/core";
import { fetchAssignments, createSelfAssignments } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ACard, RADIUS } from "./kit";

/**
 * The reconciled week (mobile) — parity with apps/web/components/reconciled-week.tsx.
 * The macrocycle phase arbitrates the daily route + sport-transfer work into ONE
 * session and (optionally) materializes it onto the week's training days as
 * self-authored assignments. The web renders this shared block on BOTH Today and
 * Periodize; mobile's Home has its own inline copy, and this component brings the
 * same block to the Periodize screen. Reuses the same core engines + the same
 * createSelfAssignments backend + the same w.home.recweek.* i18n.
 */
export default function ReconciledWeek({
  macro, currentWeek = 1, sessions, bio, readOnly = false,
}: {
  macro: Macrocycle;
  currentWeek?: number;
  sessions: LoggedSession[];
  bio?: Biometrics;
  readOnly?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();

  // Onboarding prefs that tailor the prescription (client-only), same keys as Home.
  const [sportSel, setSportSel] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [prefDays, setPrefDays] = useState<number | undefined>(undefined);
  const [prefExp, setPrefExp] = useState<Experience | undefined>(undefined);
  const [prefEquip, setPrefEquip] = useState<Equipment | undefined>(undefined);
  useEffect(() => {
    AsyncStorage.getItem("hybrid.sport").then((raw) => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw) as { sport?: string; levelIdx?: number } | null;
        if (s?.sport && SPORTS[s.sport]) {
          const lvl = typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length ? s.levelIdx : 0;
          setSportSel({ sport: s.sport, levelIdx: lvl });
        }
      } catch { /* ignore */ }
    }).catch(() => {});
    AsyncStorage.getItem("hybrid.daysPerWeek").then((raw) => { const n = Number(raw); if (Number.isFinite(n) && n > 0) setPrefDays(n); }).catch(() => {});
    AsyncStorage.getItem("hybrid.experience").then((v) => { if (v === "beginner" || v === "intermediate" || v === "advanced") setPrefExp(v); }).catch(() => {});
    AsyncStorage.getItem("hybrid.equipment").then((v) => { if (v === "full" || v === "home" || v === "minimal") setPrefEquip(v); }).catch(() => {});
  }, []);

  const effBio = readOnly ? undefined : bio;
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(
    () => prescribeSession(log, effBio, { profiles: velocityProfiles(sessions), experience: prefExp, equipment: prefEquip }),
    [log, sessions, effBio, prefExp, prefEquip],
  );
  const sportRx = useMemo(() => (sportSel ? prescribeForSport(sportSel.sport, sportSel.levelIdx, { sessions }) : undefined), [sportSel, sessions]);
  const reconciled = useMemo(() => reconcilePlan({ macro, daily: rx, sport: sportRx, currentWeek }), [macro, rx, sportRx, currentWeek]);
  const daysPerWeek = useMemo(() => trainingDaysPerWeek(sessions, { fallback: prefDays ?? 3 }), [sessions, prefDays]);

  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const doSchedule = useCallback(async (auto: boolean) => {
    if (!reconciled || scheduling) return;
    setScheduling(true);
    setScheduled(null);
    try {
      const items = buildTrainingWeek({ macro, currentWeek, log: toTrainingLog(sessions), bio, profiles: velocityProfiles(sessions), sport: sportRx, daysPerWeek, experience: prefExp, equipment: prefEquip });
      const ok = await createSelfAssignments(items, true);
      setScheduled(ok ? `${auto ? t("w.home.recweek.autoResynced") : t("w.home.recweek.scheduled")} ${items.length} ${t("w.home.recweek.sessionsOffLogs")}` : t("w.home.recweek.couldntSchedule"));
    } catch {
      setScheduled(t("w.home.recweek.couldntSchedule"));
    } finally {
      setScheduling(false);
    }
  }, [reconciled, scheduling, macro, currentWeek, sessions, bio, sportRx, daysPerWeek, prefExp, prefEquip, t]);

  // Auto re-sync: when a newer session lands and the self-scheduled week is stale,
  // regenerate the rest off that real result (fires once per new session).
  const syncedFor = useRef(0);
  useEffect(() => {
    if (!reconciled || readOnly) return;
    const latest = sessions.reduce((m, s) => Math.max(m, Date.parse(s.startedAt) || 0), 0);
    if (!latest || latest <= syncedFor.current) return;
    let cancelled = false;
    fetchAssignments().then((assignments) => {
      if (cancelled) return;
      syncedFor.current = latest;
      if (weekNeedsResync(assignments, sessions)) void doSchedule(true);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconciled, sessions]);

  if (!reconciled) return null;
  const recoveryPhase = reconciled.phase.kind === "recovery";

  return (
    <ACard style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>
          {t("w.home.recweek.thisWeek")} {reconciled.phase.label} · {t("w.home.recweek.week")} {reconciled.phase.week}
        </Text>
        <View style={{ backgroundColor: `${recoveryPhase ? C.amber : C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, recoveryPhase ? C.amber : C.lime) }}>{recoveryPhase ? t("w.home.recweek.deload") : t("w.home.recweek.load")}</Text>
        </View>
      </View>

      {readOnly ? (
        <View style={{ alignSelf: "flex-start", backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4, marginTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.home.recweek.assignedByCoach")}</Text>
        </View>
      ) : (
        <>
          <Pressable onPress={() => doSchedule(false)} disabled={scheduling} style={{ marginTop: 12, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", opacity: scheduling ? 0.6 : 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, textTransform: "uppercase", letterSpacing: 0.4, color: C.onAccent }}>
              {scheduling ? t("w.home.recweek.scheduling") : `${t("w.home.recweek.scheduleResync")} ${daysPerWeek}d →`}
            </Text>
          </Pressable>
          {scheduled ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 8 }}>{scheduled}</Text> : null}
        </>
      )}

      <View style={{ flexDirection: "row", gap: 18, marginTop: 14 }}>
        <Metric C={C} label={t("w.home.recweek.intensity")} value={`${reconciled.intensity}`} />
        <Metric C={C} label={t("w.home.recweek.volume")} value={`${reconciled.volume}`} />
        <Metric C={C} label={t("w.home.recweek.loadX")} value={reconciled.loadFactor.toFixed(2)} />
        <Metric C={C} label={t("w.home.recweek.volumeX")} value={reconciled.volumeFactor.toFixed(2)} />
      </View>

      <View style={{ marginTop: 12, gap: space.sm }}>
        {reconciled.blocks.map((b, i) => (
          <View key={`${b.name}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{b.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: b.source === "sport" ? txt(C, C.amber) : C.ash, marginTop: 2 }}>
                {b.source === "sport" ? `${t("w.home.recweek.sport")} ${b.demand ?? ""}` : b.kind === "conditioning" ? t("w.home.recweek.conditioning") : t("w.home.recweek.primaryLift")}
              </Text>
            </View>
            <View style={{ backgroundColor: `${b.source === "sport" ? C.amber : C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, b.source === "sport" ? C.amber : C.lime) }}>{b.scheme}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, lineHeight: 18, marginTop: 12 }}>{reconciled.why}</Text>
      {reconciled.dropped.length > 0 && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>
          {t("w.home.recweek.dropped")} {reconciled.dropped.map((d) => `${d.name} (${d.reason})`).join(" · ")}
        </Text>
      )}
    </ACard>
  );
}

function Metric({ C, label, value }: { C: ReturnType<typeof useTheme>["palette"]; label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash }}>{label}</Text>
    </View>
  );
}
