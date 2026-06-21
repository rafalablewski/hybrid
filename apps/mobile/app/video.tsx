import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { readinessRole } from "@hybrid/core";
import { fetchVideoAnalyses, type VideoAnalysis } from "../lib/api";
import { fs, space, Screen, Card, Kicker, Mono, H1, Chip, F } from "../lib/ui";
import { useTheme, txt, roleColor } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraVideo from "../components/aurora/video";

type Palette = ReturnType<typeof useTheme>["palette"];
// Technique score (0–100) on the shared good-score scale (green→amber→red).
const scoreColor = (s: number, C: Palette) => roleColor(C, readinessRole(s));

/** Video — markerless motion-analysis results (joint angles, asymmetry,
 *  technique score). Capture is phone-side; this lists real recordings. Mobile port. */
export default function Video() {
  if (useTemplate().template === "aurora") return <AuroraVideo />;
  return <ClassicVideo />;
}

function ClassicVideo() {
  const C = useTheme().palette;
  const [analyses, setAnalyses] = useState<VideoAnalysis[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    fetchVideoAnalyses().then((a) => { setAnalyses(a); setLoaded(true); }).finally(() => setRefreshing(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>Video intelligence</Kicker>
      <H1>Technique analysis</H1>
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 14 }}>
        <Mono color={C.chalk} style={{ lineHeight: 18 }}>
          Joint angles, rep counts, left/right asymmetry and a technique score from pose frames — feeding the Performance State injury-risk engine. On-device capture lands here.
        </Mono>
      </Card>

      {analyses.length === 0 ? (
        <Card style={{ marginTop: 14 }}>
          <Mono color={C.chalk} style={{ lineHeight: 18 }}>
            {loaded ? "No analyses yet — record a clip from the phone to see your technique broken down here." : "Loading…"}
          </Mono>
        </Card>
      ) : (
        analyses.map((a) => {
          const m = a.metrics;
          return (
            <Card key={a.id} style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{a.movement}</Text>
                  <Mono color={C.ash} style={{ fontSize: fs.nano, marginTop: 2 }}>{new Date(a.createdAt).toLocaleDateString()}</Mono>
                </View>
                <Text style={{ fontFamily: F.black, fontSize: 34, color: txt(C, scoreColor(m.techniqueScore, C)) }}>{m.techniqueScore}</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
                <Chip color={C.chalk}>{m.reps} reps</Chip>
                {m.minKneeAngle != null && <Chip color={C.blue}>depth {Math.round(m.minKneeAngle)}°</Chip>}
                {m.kneeAsymmetryPct != null && <Chip color={m.kneeAsymmetryPct > 10 ? C.amber : C.lime}>L/R {Math.round(m.kneeAsymmetryPct)}%</Chip>}
              </View>
              {m.flags.length > 0 && <Mono color={C.amber} style={{ marginTop: 8, lineHeight: 18 }}>{m.flags.join(" · ")}</Mono>}
            </Card>
          );
        })
      )}
      <View style={{ height: 16 }} />
    </Screen>
  );
}
