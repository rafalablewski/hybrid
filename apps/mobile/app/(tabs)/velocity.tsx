import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  fitLoadVelocityProfile,
  lvPointsFromSessions,
  liftsWithVelocity,
  bestPointPerLoad,
  velocityAtLoad,
  velocityZone,
  suggestLoad,
  mvtFor,
  VELOCITY_ZONES,
  type LoggedSession,
  type LVPoint,
  type LoadVelocityProfile,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, Chip, C, F } from "../../lib/ui";

// Sample back-squat ramp so the screen is meaningful before any velocity is
// logged (mirrors the web Velocity screen): 1RM at MVT 0.30 ≈ 128 kg.
const SAMPLE_LIFT = "Back Squat";
const SAMPLE_POINTS: LVPoint[] = [
  { load: 50, velocity: 0.85 },
  { load: 70, velocity: 0.71 },
  { load: 90, velocity: 0.57 },
  { load: 100, velocity: 0.5 },
  { load: 108, velocity: 0.45 },
];

const zoneColor = (id: string) =>
  id === "absolute-strength" ? C.red
  : id === "strength-speed" ? C.amber
  : id === "speed-strength" ? C.lime
  : id === "accelerative" ? C.blue
  : C.violet;

export default function Velocity() {
  const { t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lift, setLift] = useState<string>(SAMPLE_LIFT);
  const [targetVel, setTargetVel] = useState(0.5);

  const load = () => {
    setRefreshing(true);
    fetchSessions()
      .then(setSessions)
      .finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  const lifts = useMemo(() => liftsWithVelocity(sessions), [sessions]);
  const isDemo = lifts.length === 0;
  const active = isDemo ? SAMPLE_LIFT : lifts.includes(lift) ? lift : lifts[0]!;
  const mvt = mvtFor(active);

  const points = useMemo(
    () => (isDemo ? SAMPLE_POINTS : bestPointPerLoad(lvPointsFromSessions(sessions, active))),
    [sessions, active, isDemo],
  );
  const profile = useMemo(() => fitLoadVelocityProfile(points, mvt), [points, mvt]);
  const rec = useMemo(() => suggestLoad(profile, { targetVelocity: targetVel }), [profile, targetVel]);
  const resolved = profile.estimated1rm > 0;

  const recentSets = useMemo(() => {
    if (isDemo)
      return [
        { load: 90, reps: 5, vel: 0.57 },
        { load: 100, reps: 5, vel: 0.5 },
        { load: 108, reps: 3, vel: 0.45 },
      ];
    return sessions
      .flatMap((s) =>
        s.blocks
          .filter((b): b is Extract<typeof b, { kind: "strength" }> => b.kind === "strength" && b.name === active)
          .flatMap((b) => b.sets),
      )
      .map((set) => ({ load: parseFloat(set.load), reps: parseInt(set.reps, 10) || 0, vel: parseFloat(set.vel ?? "") }))
      .filter((r) => Number.isFinite(r.load) && Number.isFinite(r.vel))
      .slice(-6)
      .reverse();
  }, [sessions, active, isDemo]);

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>{t("nav.velocity")} · VBT</Kicker>

      {isDemo && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.amber, marginTop: 8 }}>
          <Mono color={C.amber} style={{ lineHeight: 19 }}>
            Sample profile. Log a strength set with a bar speed (m/s) in the Log tab across a few
            loads and this rebuilds from your real velocity.
          </Mono>
        </Card>
      )}

      {/* lift selector */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 4 }}>
        {(isDemo ? [SAMPLE_LIFT] : lifts).map((l) => (
          <Pressable key={l} onPress={() => setLift(l)} style={pill(active === l, C.lime)}>
            <Text style={{ fontFamily: F.semi, fontSize: 12, color: active === l ? C.lime : C.ash }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {/* estimated 1RM */}
      <Card>
        <Kicker color={C.lime}>Estimated 1RM · from velocity</Kicker>
        <Text style={{ fontFamily: F.black, fontSize: 40, color: C.chalk, marginTop: 6 }}>
          {resolved ? profile.estimated1rm.toFixed(1) : "—"}
          <Text style={{ fontSize: 18, color: C.ash }}> kg</Text>
        </Text>
        <Mono style={{ marginTop: 2 }}>
          {resolved
            ? `MVT ${mvt} m/s · v₀ ${profile.v0.toFixed(2)} · r² ${profile.r2.toFixed(2)} · ${profile.n} loads`
            : "Need ≥2 loads with velocity to resolve a 1RM."}
        </Mono>
      </Card>

      {/* load–velocity profile plot */}
      <Card>
        <Kicker color={C.lime}>Load–velocity profile · {active}</Kicker>
        <View style={{ marginTop: 10 }}>
          <Plot points={points} profile={profile} />
        </View>
        <Mono style={{ marginTop: 8, fontSize: 11 }}>
          <Text style={{ color: C.lime }}>●</Text> measured  ·  <Text style={{ color: C.violet }}>—</Text> fit → 1RM at MVT
        </Mono>
      </Card>

      {/* AI load recommender */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
        <Kicker color={C.violet}>AI load · target a bar speed</Kicker>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 12 }}>
          <Stepper label="−" onPress={() => setTargetVel((v) => Math.max(0.2, +(v - 0.05).toFixed(2)))} />
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>{targetVel.toFixed(2)} m/s</Text>
          <Stepper label="+" onPress={() => setTargetVel((v) => Math.min(1.3, +(v + 0.05).toFixed(2)))} />
        </View>
        {rec ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: F.black, fontSize: 30, color: C.violet }}>
              {rec.load} <Text style={{ fontSize: 14, color: C.ash }}>kg</Text>
            </Text>
            <Mono>≈ {rec.percent1rm.toFixed(0)}% 1RM</Mono>
            <Chip color={zoneColor(rec.zone.id)}>{rec.zone.label}</Chip>
          </View>
        ) : (
          <Mono>Build a profile first to get a recommendation.</Mono>
        )}
      </Card>

      {/* velocity zones */}
      <Card>
        <Kicker color={C.blue}>Velocity zones · training quality</Kicker>
        <View style={{ marginTop: 8 }}>
          {VELOCITY_ZONES.slice().reverse().map((z) => (
            <View key={z.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: zoneColor(z.id) }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.chalk }}>{z.label}</Text>
                <Mono style={{ fontSize: 11 }}>{z.focus}</Mono>
              </View>
              <Mono color={C.chalk} style={{ fontSize: 11 }}>
                {z.max === Infinity ? `≥${z.min}` : `${z.min}–${z.max}`} m/s
              </Mono>
            </View>
          ))}
        </View>
      </Card>

      {/* recent sets */}
      <Card>
        <Kicker color={C.lime}>Recent sets · bar speed</Kicker>
        <View style={{ marginTop: 8 }}>
          {recentSets.length === 0 ? (
            <Mono>No velocity-tagged sets for {active} yet.</Mono>
          ) : (
            recentSets.map((r, i) => {
              const z = velocityZone(r.vel);
              return (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                  <Mono color={C.chalk} style={{ width: 64 }}>{r.load} kg</Mono>
                  <Mono style={{ width: 36 }}>{r.reps}×</Mono>
                  <Mono color={C.chalk} style={{ width: 52 }}>{r.vel.toFixed(2)}</Mono>
                  <Chip color={zoneColor(z.id)}>{z.label}</Chip>
                </View>
              );
            })
          )}
        </View>
        <Mono style={{ marginTop: 10, fontSize: 11 }}>
          Per-rep trajectory &amp; bar path need the bar sensor / camera capture (see Capabilities).
        </Mono>
      </Card>
    </Screen>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ width: 48, height: 40, borderRadius: 10, borderWidth: 1, borderColor: `${C.violet}66`, backgroundColor: `${C.violet}1f`, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontFamily: F.black, fontSize: 22, color: C.violet }}>{label}</Text>
    </Pressable>
  );
}

// Dependency-free plot: measured points as dots, the fitted line as sampled dots.
function Plot({ points, profile }: { points: LVPoint[]; profile: LoadVelocityProfile }) {
  const [w, setW] = useState(0);
  const H = 190;
  const pad = 10;
  const maxLoad = Math.max(...points.map((p) => p.load), profile.estimated1rm, 1) * 1.05;
  const maxVel = Math.max(...points.map((p) => p.velocity), profile.v0, 0.1) * 1.1;
  const X = (l: number) => pad + (l / maxLoad) * (w - 2 * pad);
  const Y = (v: number) => pad + (1 - v / maxVel) * (H - 2 * pad);

  const line: LVPoint[] = [];
  if (profile.n >= 2 && profile.estimated1rm > 0) {
    const minL = Math.min(...points.map((p) => p.load));
    for (let i = 0; i <= 28; i++) {
      const l = minL + ((profile.estimated1rm - minL) * i) / 28;
      line.push({ load: l, velocity: velocityAtLoad(profile, l) });
    }
  }

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height: H, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.ink2, overflow: "hidden" }}
    >
      {w > 0 &&
        line.map((p, i) => (
          <View key={`l${i}`} style={{ position: "absolute", left: X(p.load) - 1.5, top: Y(p.velocity) - 1.5, width: 3, height: 3, borderRadius: 2, backgroundColor: C.violet }} />
        ))}
      {w > 0 &&
        points.map((p, i) => (
          <View key={`p${i}`} style={{ position: "absolute", left: X(p.load) - 4, top: Y(p.velocity) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime }} />
        ))}
    </View>
  );
}

const pill = (active: boolean, c: string) => ({
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: active ? c : C.line,
  backgroundColor: active ? `${c}1a` : "transparent",
});
