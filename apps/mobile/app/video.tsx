import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { fetchVideoAnalyses, type VideoAnalysis } from "../lib/api";
import { Screen, Card, Kicker, Mono, H1, Chip, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraVideo from "../components/aurora/video";

type Palette = ReturnType<typeof useTheme>["palette"];
const scoreColor = (s: number, C: Palette) => (s >= 80 ? C.lime : s >= 60 ? C.blue : s >= 40 ? C.amber : C.red);

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
          Joint angles, rep counts, left/right asymmetry and a technique score from pose frames — feeding the Twin&apos;s injury risk. On-device capture lands here.
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
                  <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{a.movement}</Text>
                  <Mono color={C.ash} style={{ fontSize: 10, marginTop: 2 }}>{new Date(a.createdAt).toLocaleDateString()}</Mono>
                </View>
                <Text style={{ fontFamily: F.black, fontSize: 34, color: txt(C, scoreColor(m.techniqueScore, C)) }}>{m.techniqueScore}</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
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
