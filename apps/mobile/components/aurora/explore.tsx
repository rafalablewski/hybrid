import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";
import { AuroraScreen, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import CoachRail from "./coach-rail";
import FeedPreview from "./feed-preview";

type P = ReturnType<typeof useTheme>["palette"];

// The shipped plan library, previewed on Explore (all free to follow; tapping a
// card opens the full Plans screen). Names are proper nouns (not translated).
const PLANS_PREVIEW: { emoji: string; name: string; meta: string; tint: "lime" | "blue" | "violet" | "amber" }[] = [
  { emoji: "🏋️", name: "Soviet 8-Week Peaking", meta: "Olympic weightlifting · 8 wk", tint: "lime" },
  { emoji: "🏃", name: "Hansons 5K", meta: "Running · 9 wk", tint: "blue" },
  { emoji: "💪", name: "6-Day PPL", meta: "Bodybuilding · hypertrophy", tint: "violet" },
  { emoji: "🔔", name: "12-Week Kettlebell", meta: "Kettlebell · strength", tint: "amber" },
];

/**
 * AURORA Explore — the discovery surface for the Explore tab: search, a coach
 * rail, the plan library, and a community-feed preview, composed from the shared
 * CoachRail + FeedPreview so it can't drift from the rest of the app. Mirrored on
 * web (app-shell "explore" screen).
 */
export default function AuroraExplore() {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();

  return (
    <AuroraScreen>
      {/* HERO */}
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 30, letterSpacing: -0.6, color: C.chalk }}>{t("w.explore.title")}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 4 }}>{t("w.explore.sub")}</Text>

      {/* SEARCH — opens the people/discovery search */}
      <Pressable
        onPress={() => router.push("/discover")}
        accessibilityRole="button"
        accessibilityLabel={t("w.explore.search")}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 15, paddingVertical: 13 }}
      >
        <AuroraIcon name="search" size={17} color={C.ash} />
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.explore.search")}</Text>
      </Pressable>

      {/* COACHES — CoachRail renders its OWN "Follow a coach" header + Browse all */}
      <View style={{ marginTop: 20 }}>
        <CoachRail onOpen={() => router.push("/coaches")} />
      </View>

      {/* PLANS — the shipped library, tap through to the full Plans screen */}
      <SectionHead C={C} scheme={scheme} title={t("w.explore.plans")} action={t("w.explore.all")} onAction={() => router.push("/(tabs)/plans")} />
      <View style={{ gap: 10 }}>
        {PLANS_PREVIEW.map((p) => (
          <Pressable
            key={p.name}
            onPress={() => router.push("/(tabs)/plans")}
            style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${C[p.tint]}22`, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{p.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{p.meta}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>›</Text>
          </Pressable>
        ))}
      </View>

      {/* COMMUNITY */}
      <SectionHead C={C} scheme={scheme} title={t("w.explore.community")} action={t("w.explore.feed")} onAction={() => router.push("/feed")} />
      <FeedPreview onOpen={() => router.push("/feed")} />
    </AuroraScreen>
  );
}

function SectionHead({ C, scheme, title, action, onAction }: { C: P; scheme: "light" | "dark"; title: string; action: string; onAction: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{title}</Text>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{action} →</Text>
      </Pressable>
    </View>
  );
}
