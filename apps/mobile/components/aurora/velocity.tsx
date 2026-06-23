import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  fitLoadVelocityProfile, lvPointsFromSessions, liftsWithVelocity, bestPointPerLoad, velocityAtLoad,
  velocityZone, suggestLoad, mvtFor, VELOCITY_ZONES,
  type LoggedSession, type LoadVelocityProfile, type LVPoint,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
const zoneColor = (id: string, C: Palette) =>
  id === "absolute-strength" ? C.red : id === "strength-speed" ? C.amber : id === "speed-strength" ? C.lime : id === "accelerative" ? C.blue : C.violet;

/** AURORA Velocity (VBT) — load-velocity profile, velocity-estimated 1RM, AI
 *  load recommender + zones, reusing the exact velocity engine. */
export default function AuroraVelocity() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [lift, setLift] = useState<string>("");
  const [targetVel, setTargetVel] = useState(0.5);

  const load = () => refetch();
  useRefreshOnFocus(refetch);

  const lifts = useMemo(() => liftsWithVelocity(sessions), [sessions]);
  const noData = lifts.length === 0;
  const active = lifts.includes(lift) ? lift : (lifts[0] ?? "");
  const mvt = mvtFor(active);
  const points = useMemo(() => bestPointPerLoad(lvPointsFromSessions(sessions, active)), [sessions, active]);
  const profile = useMemo(() => fitLoadVelocityProfile(points, mvt), [points, mvt]);
  const rec = useMemo(() => suggestLoad(profile, { targetVelocity: targetVel }), [profile, targetVel]);
  const resolved = profile.estimated1rm > 0;

  const recentSets = useMemo(() => sessions
    .flatMap((s) => s.blocks.filter((b): b is Extract<typeof b, { kind: "strength" }> => b.kind === "strength" && b.name === active).flatMap((b) => b.sets))
    .map((set) => ({ load: parseFloat(set.load), reps: parseInt(set.reps, 10) || 0, vel: parseFloat(set.vel ?? "") }))
    .filter((r) => Number.isFinite(r.load) && Number.isFinite(r.vel)).slice(-6).reverse(), [sessions, active]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
      <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        <AuroraIcon name="back" size={20} color={C.chalk} />
      </Pressable>
      <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.vel.title")}</AHeading>
    </View>
  );
  const chip = (color: string, label: string) => (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color) }}>{label}</Text>
    </View>
  );

  if (noData) {
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {header}
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 32 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.vel.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: 19 }}>{t("w.analyze.vel.emptyBody")}</Text>
        </ACard>
      </AuroraScreen>
    );
  }

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {header}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
        {lifts.map((l) => {
          const on = active === l;
          return (
            <Pressable key={l} onPress={() => setLift(l)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent" }}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? C.onAccent : C.ash }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.vel.est1rm")}</Text>
        <Text style={{ fontFamily: F.black, fontSize: 40, color: C.chalk, marginTop: 6 }}>{resolved ? profile.estimated1rm.toFixed(1) : "—"}<Text style={{ fontSize: fs.title, color: C.ash }}> kg</Text></Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{resolved ? `${t("w.analyze.vel.mvtPrefix")} ${mvt} m/s · v₀ ${profile.v0.toFixed(2)} · r² ${profile.r2.toFixed(2)} · ${profile.n} ${t("w.analyze.vel.loads")}` : t("w.analyze.vel.needLoads")}</Text>
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.vel.profile")} · {active}</Text>
        <View style={{ marginTop: 10 }}><Plot points={points} profile={profile} /></View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}><Text style={{ color: txt(C, C.lime) }}>●</Text> {t("w.analyze.vel.measured")} · <Text style={{ color: txt(C, C.violet) }}>—</Text> {t("w.analyze.vel.fit")}</Text>
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.violet) }}>{t("w.analyze.vel.aiLoad")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 12 }}>
          <Stepper label="−" onPress={() => setTargetVel((v) => Math.max(0.2, +(v - 0.05).toFixed(2)))} />
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>{targetVel.toFixed(2)} m/s</Text>
          <Stepper label="+" onPress={() => setTargetVel((v) => Math.min(1.3, +(v + 0.05).toFixed(2)))} />
        </View>
        {rec ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: F.black, fontSize: 30, color: txt(C, C.violet) }}>{rec.load} <Text style={{ fontSize: fs.bodyLg, color: C.ash }}>kg</Text></Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>≈ {rec.percent1rm.toFixed(0)}% 1RM</Text>
            {chip(zoneColor(rec.zone.id, C), rec.zone.label)}
          </View>
        ) : <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.analyze.vel.buildProfile")}</Text>}
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>{t("w.analyze.vel.zones")}</Text>
        <View style={{ marginTop: 8 }}>
          {VELOCITY_ZONES.slice().reverse().map((z) => (
            <View key={z.id} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: zoneColor(z.id, C) }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{z.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{z.focus}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{z.max === Infinity ? `≥${z.min}` : `${z.min}–${z.max}`} m/s</Text>
            </View>
          ))}
        </View>
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.vel.recentSets")}</Text>
        <View style={{ marginTop: 8 }}>
          {recentSets.length === 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.analyze.vel.noVelSetsPre")} {active} {t("w.analyze.vel.noVelSetsTail")}</Text> : recentSets.map((r, i) => {
            const z = velocityZone(r.vel);
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, width: 64 }}>{r.load} kg</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, width: 36 }}>{r.reps}×</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, width: 52 }}>{r.vel.toFixed(2)}</Text>
                {chip(zoneColor(z.id, C), z.label)}
              </View>
            );
          })}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 10, lineHeight: 15 }}>
          {t("w.analyze.vel.perRepNote")}
        </Text>
      </ACard>
    </AuroraScreen>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: 48, height: 44, borderRadius: RADIUS.field, borderWidth: 1, borderColor: `${C.violet}66`, backgroundColor: `${C.violet}1f`, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: txt(C, C.violet) }}>{label}</Text>
    </Pressable>
  );
}

function Plot({ points, profile }: { points: LVPoint[]; profile: LoadVelocityProfile }) {
  const { palette: C } = useTheme();
  const [w, setW] = useState(0);
  const H = 190, pad = 10;
  const maxLoad = Math.max(...points.map((p) => p.load), profile.estimated1rm, 1) * 1.05;
  const maxVel = Math.max(...points.map((p) => p.velocity), profile.v0, 0.1) * 1.1;
  const X = (l: number) => pad + (l / maxLoad) * (w - 2 * pad);
  const Y = (v: number) => pad + (1 - v / maxVel) * (H - 2 * pad);
  const line: LVPoint[] = [];
  if (profile.n >= 2 && profile.estimated1rm > 0) {
    const minL = Math.min(...points.map((p) => p.load));
    for (let i = 0; i <= 28; i++) { const l = minL + ((profile.estimated1rm - minL) * i) / 28; line.push({ load: l, velocity: velocityAtLoad(profile, l) }); }
  }
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.ink, overflow: "hidden" }}>
      {w > 0 && line.map((p, i) => <View key={`l${i}`} style={{ position: "absolute", left: X(p.load) - 1.5, top: Y(p.velocity) - 1.5, width: 3, height: 3, borderRadius: 2, backgroundColor: C.violet }} />)}
      {w > 0 && points.map((p, i) => <View key={`p${i}`} style={{ position: "absolute", left: X(p.load) - 4, top: Y(p.velocity) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime }} />)}
    </View>
  );
}
