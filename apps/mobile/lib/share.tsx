import { forwardRef } from "react";
import { View, Text, Share } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { brand, fmtWeight, fmtTonnage, kgToUnit, type WeeklyRecap, type WeightUnit } from "@hybrid/core";
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
export const WorkoutShareCard = forwardRef<View, { stats: ShareStats; t: (k: string) => string; units?: WeightUnit }>(
  ({ stats, t, units = "kg" }, ref) => (
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
        <Stat label={t("summary.volumeMoved")} value={fmtTonnage(stats.volume, units)} />
      </View>
      {stats.bests.length > 0 && (
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
          <Kicker>{t("summary.todaysBests")}</Kicker>
          {stats.bests.slice(0, 4).map((b) => (
            <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk }}>
                {b.pr ? "🏆 " : ""}{b.name}
              </Text>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: b.pr ? C.lime : C.chalk }}>{fmtWeight(b.e1rm, units)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  ),
);
WorkoutShareCard.displayName = "WorkoutShareCard";

// Branded 9:16 STORY card — sized for an Instagram/TikTok story. Rendered
// off-screen in the summary and captured to a tall PNG via the same shareWorkout
// path. `width` is the on-screen capture width (device pixel ratio scales the
// output up, so a phone-width card exports near 1080px wide).
export const WorkoutStoryCard = forwardRef<View, { stats: ShareStats; t: (k: string) => string; units?: WeightUnit; width: number; firstEver?: boolean }>(
  ({ stats, t, units = "kg", width, firstEver }, ref) => (
    <View
      ref={ref}
      collapsable={false}
      style={{ width, height: Math.round((width * 16) / 9), backgroundColor: C.ink, padding: width * 0.09, justifyContent: "space-between" }}
    >
      {/* Lime glow disc — the Aurora membrane look on the dark backdrop. */}
      <View pointerEvents="none" style={{ position: "absolute", top: -width * 0.2, right: -width * 0.25, width: width * 0.9, height: width * 0.9, borderRadius: width * 0.45, backgroundColor: `${C.lime}22` }} />
      <View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: width * 0.072, color: C.chalk, letterSpacing: -1 }}>
            {brand.name}
            <Text style={{ color: C.lime }}>.</Text>
          </Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: width * 0.03, color: C.lime, letterSpacing: 2, marginTop: 6 }}>{t("welcome.tagline").toUpperCase()}</Text>
        <Text style={{ fontFamily: F.black, fontSize: width * 0.092, color: C.chalk, marginTop: width * 0.12, lineHeight: width * 0.1 }}>
          {firstEver ? "First workout 🎉" : stats.title || "Workout"}
        </Text>
      </View>

      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: width * 0.06 }}>
          <Stat label={t("summary.minutes")} value={String(stats.minutes)} />
          <Stat label={t("summary.sets")} value={String(stats.sets)} />
          <Stat label={t("summary.volumeMoved")} value={fmtTonnage(stats.volume, units)} />
        </View>
        {stats.bests.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: width * 0.05 }}>
            <Kicker>{t("summary.todaysBests")}</Kicker>
            {stats.bests.slice(0, 5).map((b) => (
              <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: width * 0.035 }}>
                <Text style={{ fontFamily: F.semi, fontSize: width * 0.042, color: C.chalk }}>{b.pr ? "🏆 " : ""}{b.name}</Text>
                <Text style={{ fontFamily: F.bold, fontSize: width * 0.042, color: b.pr ? C.lime : C.chalk }}>{fmtWeight(b.e1rm, units)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={{ fontFamily: F.mono, fontSize: width * 0.03, color: C.ash }}>{t("share.tracked")}</Text>
    </View>
  ),
);
WorkoutStoryCard.displayName = "WorkoutStoryCard";

// Branded "this week" recap card — also captured to a PNG for social.
export const RecapShareCard = forwardRef<View, { recap: WeeklyRecap; t: (k: string) => string; units?: WeightUnit }>(
  ({ recap, t, units = "kg" }, ref) => {
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
          <Stat label={t("summary.volumeMoved")} value={fmtTonnage(recap.volume, units)} />
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
            {signed(recap.sessionsDelta)} {t("recap.sessions")} · {signed(Math.round(kgToUnit(recap.volumeDelta, units)))} {units} {t("recap.vsLastWeek")}
          </Text>
        )}
      </View>
    );
  },
);
RecapShareCard.displayName = "RecapShareCard";

export function recapShareText(recap: WeeklyRecap, t: (k: string) => string, units: WeightUnit = "kg"): string {
  return [
    `\u{1F4C8} ${t("recap.title")} — HYBRID`,
    `${recap.sessions} ${t("recap.sessions")} · ${fmtTonnage(recap.volume, units)} · ${recap.prs.length} ${t("recap.prs")}`,
    recap.prs[0] ? `\u{1F3C6} ${recap.prs[0].lift} ${fmtWeight(recap.prs[0].e1rm, units)}` : null,
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
