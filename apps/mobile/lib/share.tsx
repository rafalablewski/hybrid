import { forwardRef } from "react";
import { View, Text, Share } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { brand } from "@hybrid/core";
import { C, F, Kicker } from "./ui";

export type ShareBest = { name: string; e1rm: number; pr?: boolean };
export type ShareStats = {
  title: string;
  minutes: number;
  sets: number;
  volume: number;
  bests: ShareBest[];
};

// The branded card that gets captured to a PNG for social. Rendered visibly in
// the summary + session-detail screens; `ref` points at the exact node to grab.
export const WorkoutShareCard = forwardRef<View, { stats: ShareStats; t: (k: string) => string }>(
  ({ stats, t }, ref) => (
    <View
      ref={ref}
      collapsable={false}
      style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: `${C.lime}55`, borderRadius: 18, padding: 20 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, letterSpacing: -1 }}>
          {brand.name}
          <Text style={{ color: C.lime }}>.</Text>
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.lime, letterSpacing: 2 }}>{t("welcome.tagline")}</Text>
      </View>
      <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk, marginTop: 14 }}>{stats.title || "Workout"}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        <Stat label={t("summary.minutes")} value={String(stats.minutes)} />
        <Stat label={t("summary.sets")} value={String(stats.sets)} />
        <Stat label={t("summary.kgMoved")} value={stats.volume.toLocaleString()} />
      </View>
      {stats.bests.length > 0 && (
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
          <Kicker>{t("summary.todaysBests")}</Kicker>
          {stats.bests.slice(0, 4).map((b) => (
            <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk }}>
                {b.pr ? "🏆 " : ""}{b.name}
              </Text>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: b.pr ? C.lime : C.chalk }}>{b.e1rm} kg</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  ),
);
WorkoutShareCard.displayName = "WorkoutShareCard";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** Capture the card to an image and open the share sheet; fall back to text. */
export async function shareWorkout(ref: React.RefObject<View | null>, text: string, title: string) {
  try {
    if (ref.current) {
      const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title });
        return;
      }
    }
  } catch {
    /* fall through to text share */
  }
  try {
    await Share.share({ message: text });
  } catch {
    /* user dismissed */
  }
}
