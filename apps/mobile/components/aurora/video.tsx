import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { readinessRole } from "@hybrid/core";
import { fetchVideoAnalyses, type VideoAnalysis } from "../../lib/api";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
// Technique score (0–100) on the shared good-score scale (green→amber→red).
const scoreColor = (s: number, C: Palette) => roleColor(C, readinessRole(s));

/** AURORA Video — markerless technique-analysis results, reusing the exact
 *  fetchVideoAnalyses feed. */
export default function AuroraVideo() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [analyses, setAnalyses] = useState<VideoAnalysis[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => { setRefreshing(true); fetchVideoAnalyses().then((a) => { setAnalyses(a); setLoaded(true); }).finally(() => setRefreshing(false)); };
  useEffect(() => { load(); }, []);

  const chip = (color: string, label: string) => <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}><Text style={{ fontFamily: F.mono, fontSize: 10, color: txt(C, color) }}>{label}</Text></View>;

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: 26 }}>Technique</AHeading>
      </View>
      <ASub style={{ marginTop: 10 }}>Joint angles, rep counts, left/right asymmetry and a technique score from pose frames — feeding the Twin&apos;s injury risk. On-device capture lands here.</ASub>

      {analyses.length === 0 ? (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, lineHeight: 19 }}>{loaded ? "No analyses yet — record a clip from the phone to see your technique broken down here." : "Loading…"}</Text>
        </ACard>
      ) : analyses.map((a) => {
        const m = a.metrics;
        return (
          <ACard key={a.id} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{a.movement}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, marginTop: 2 }}>{new Date(a.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={{ fontFamily: F.black, fontSize: 34, color: txt(C, scoreColor(m.techniqueScore, C)) }}>{m.techniqueScore}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {chip(C.chalk, `${m.reps} reps`)}
              {m.minKneeAngle != null && chip(C.blue, `depth ${Math.round(m.minKneeAngle)}°`)}
              {m.kneeAsymmetryPct != null && chip(m.kneeAsymmetryPct > 10 ? C.amber : C.lime, `L/R ${Math.round(m.kneeAsymmetryPct)}%`)}
            </View>
            {m.flags.length > 0 && <Text style={{ fontFamily: F.reg, fontSize: 13, color: txt(C, C.amber), marginTop: 8, lineHeight: 18 }}>{m.flags.join(" · ")}</Text>}
          </ACard>
        );
      })}
    </AuroraScreen>
  );
}
