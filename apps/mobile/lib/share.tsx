import { forwardRef } from "react";
import { View, Text, Share } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { brand, type WeeklyRecap } from "@hybrid/core";
import { C, F, Kicker } from "./ui";

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

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

// Branded "this week" recap card — also captured to a PNG for social.
export const RecapShareCard = forwardRef<View, { recap: WeeklyRecap; t: (k: string) => string }>(
  ({ recap, t }, ref) => {
    const hasPrev = recap.prevSessions > 0 || recap.prevVolume > 0;
    return (
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
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.lime, letterSpacing: 2 }}>{t("recap.title").toUpperCase()}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 18 }}>
          <Stat label={t("recap.sessions")} value={String(recap.sessions)} />
          <Stat label={t("summary.kgMoved")} value={recap.volume.toLocaleString()} />
          <Stat label={t("recap.prs")} value={String(recap.prs.length)} />
        </View>
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
            {recap.activeDays} {t("recap.activeDays")}
          </Text>
          {recap.distanceKm > 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
              {recap.distanceKm} km
            </Text>
          )}
          {recap.topMuscle && (
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
              {t("recap.top")} {MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle}
            </Text>
          )}
        </View>
        {hasPrev && (
          <Text style={{ fontFamily: F.bold, fontSize: 12, color: recap.volumeDelta >= 0 ? C.lime : C.amber, marginTop: 10 }}>
            {signed(recap.sessionsDelta)} {t("recap.sessions")} · {signed(recap.volumeDelta)} kg {t("recap.vsLastWeek")}
          </Text>
        )}
      </View>
    );
  },
);
RecapShareCard.displayName = "RecapShareCard";

export function recapShareText(recap: WeeklyRecap, t: (k: string) => string): string {
  return [
    `\u{1F4C8} ${t("recap.title")} — HYBRID`,
    `${recap.sessions} ${t("recap.sessions")} · ${recap.volume.toLocaleString()} kg · ${recap.prs.length} ${t("recap.prs")}`,
    recap.prs[0] ? `\u{1F3C6} ${recap.prs[0].lift} ${recap.prs[0].e1rm}kg` : null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");
}

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
