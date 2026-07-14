import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { PLAN_PREVIEWS } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";
import { AuroraScreen, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
import CoachRail from "./coach-rail";
import FeedPreview from "./feed-preview";

type P = ReturnType<typeof useTheme>["palette"];

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

      {/* COACHES — headerless rail under the SHARED SectionHead, so all three
          sections share one title + one "See all" CTA (no bespoke "Browse all"). */}
      <SectionHead C={C} scheme={scheme} title={t("w.explore.coaches")} onAction={() => router.push("/coaches")} />
      <CoachRail onOpen={() => router.push("/coaches")} headerless />

      {/* PLANS — the shipped library, tap through to the full Plans screen */}
      <SectionHead C={C} scheme={scheme} title={t("w.explore.plans")} onAction={() => router.push("/(tabs)/plans")} />
      <View style={{ gap: 10 }}>
        {PLAN_PREVIEWS.map((p) => (
          <Pressable
            key={p.plan.id}
            onPress={() => router.push("/(tabs)/plans")}
            style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16 }}
          >
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, color: C.ash }}>{p.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{p.plan.name}</Text>
              <View style={{ marginTop: 4 }}><MetaLine parts={[p.goalName, p.plan.tag]} textStyle={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, textTransform: "uppercase", letterSpacing: 0.5 }} /></View>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: `${C.ash}8c` }}>›</Text>
          </Pressable>
        ))}
      </View>

      {/* COMMUNITY — a left/right slider (max 6) with a trailing "See all" card,
          Threads-style, instead of an ever-growing stacked wall. */}
      <SectionHead C={C} scheme={scheme} title={t("w.explore.community")} onAction={() => router.push("/feed")} />
      <FeedPreview onOpen={() => router.push("/feed")} horizontal />
    </AuroraScreen>
  );
}

// ONE section header for every Explore section — a title + a single unified
// "See all →" CTA. Kills the old mix of "Browse all" / "All plans" / "Feed".
function SectionHead({ C, scheme, title, onAction }: { C: P; scheme: "light" | "dark"; title: string; onAction: () => void }) {
  const { t } = useLang();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{title}</Text>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{t("w.explore.seeAll")} →</Text>
      </Pressable>
    </View>
  );
}
