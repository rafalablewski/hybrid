import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
type Preview = (typeof PLAN_PREVIEWS)[number];

// AuroraScreen's 16dp side gutter (kit.tsx) — a full-bleed rail pulls itself
// back out by exactly that so its scroll clip reaches the true screen edge.
const SCREEN_PAD = 16;
const MINI_W = 182;

// Covers are "album art" — deliberately dark in BOTH themes (Aurora dark and
// Kyoto Hour light) so white text stays legible and the accent wash reads the
// same everywhere. Fixed dark base, never the theme's ink token.
const COVER_INK = "#0c0d0c";

/**
 * AURORA Explore — the discovery surface for the Explore tab: search, a coach
 * rail, the plan library, and a community-feed preview, composed from the shared
 * CoachRail + FeedPreview so it can't drift from the rest of the app. Mirrored on
 * web (app-shell "explore" screen).
 *
 * PLANS use the COVER FLOW layout (web parity — design/explore-redesign.html,
 * concept 5): the top three plans render as full-width "album-art" covers, and
 * the rest fall into a full-bleed micro-rail below, so the section stays curated
 * and browsable as the library grows.
 */
export default function AuroraExplore() {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();

  const featured = PLAN_PREVIEWS.slice(0, 3);
  const more = PLAN_PREVIEWS.slice(3);

  // Soft theme-aware card lift (web --shadow-card parity): warm sumi-wash on
  // Kyoto Hour, the usual black bloom on Aurora.
  const cardShadow = scheme === "light"
    ? ({ shadowColor: "#584934", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const)
    : ({ shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const);

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
      <CoachRail onOpen={() => router.push("/coaches")} headerless bleed />

      {/* PLANS — Cover Flow: three featured covers, then the rest as a full-bleed
          micro-rail. Tap-through to the full Plans screen. */}
      <SectionHead C={C} scheme={scheme} title={t("w.explore.plans")} onAction={() => router.push("/(tabs)/plans")} />
      <View style={{ gap: 12 }}>
        {featured.map((p) => (
          <PlanCover key={p.plan.id} p={p} scheme={scheme} shadow={cardShadow} onOpen={() => router.push("/(tabs)/plans")} />
        ))}
      </View>
      {more.length > 0 && (
        // Full-bleed rail — same idiom as CoachRail: negative horizontal margin
        // the width of the screen gutter pulls the scroll clip to the physical
        // edge, matching content padding keeps resting cards aligned with the column.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={MINI_W + 10}
          decelerationRate="fast"
          style={{ marginHorizontal: -SCREEN_PAD, marginTop: 12 }}
          contentContainerStyle={{ gap: 10, paddingHorizontal: SCREEN_PAD, paddingVertical: 6 }}
        >
          {more.map((p) => (
            <PlanMini key={p.plan.id} p={p} C={C} shadow={cardShadow} onOpen={() => router.push("/(tabs)/plans")} />
          ))}
        </ScrollView>
      )}

      {/* COMMUNITY — a left/right slider (max 6) with a trailing "See all" card,
          Threads-style, instead of an ever-growing stacked wall. */}
      <SectionHead C={C} scheme={scheme} title={t("w.explore.community")} onAction={() => router.push("/feed")} />
      <FeedPreview onOpen={() => router.push("/feed")} horizontal bleed />
    </AuroraScreen>
  );
}

// A full-width plan COVER — accent wash over a fixed-dark base (LinearGradient
// stands in for the web radial), the discipline glyph as oversized placeholder
// art, discipline + duration up top and the plan name + meta at the bottom. One
// tap target into the Plans screen.
function PlanCover({ p, scheme, shadow, onOpen }: { p: Preview; scheme: "light" | "dark"; shadow: object; onOpen: () => void }) {
  const accent = p.color;
  const weeks = `${p.plan.weeks} ${p.plan.weeks === 1 ? "WEEK" : "WEEKS"}`;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${p.plan.name}`}
      style={{ height: 196, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: COVER_INK, justifyContent: "space-between", padding: 18, ...shadow }}
    >
      {/* accent wash bleeding from the top corner, then a dark scrim so the
          title stays legible over any accent (a diagonal fade for the radial). */}
      <LinearGradient colors={[`${accent}c8`, `${accent}4d`, `${accent}0d`]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.95 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <LinearGradient colors={["#0c0d0c00", "#0c0d0ccc"]} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {/* oversized discipline glyph — placeholder cover art until real imagery */}
      <Text pointerEvents="none" style={{ position: "absolute", top: -34, right: -10, fontSize: 142, lineHeight: 150, color: "rgba(255,255,255,0.07)" }}>{p.icon}</Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", color: "#0d0e0d", backgroundColor: "#edefe8", paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, overflow: "hidden" }}>{p.goalName}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, fontWeight: "600", letterSpacing: 0.6, color: "rgba(255,255,255,0.85)", paddingTop: 3 }}>{weeks}</Text>
      </View>

      <View>
        <Text numberOfLines={2} style={{ fontFamily: serifIf(scheme, F.black), fontSize: 24, letterSpacing: -0.7, lineHeight: 26, color: "#fff", maxWidth: "86%" }}>{p.plan.name}</Text>
        <View style={{ marginTop: 8 }}>
          <MetaLine parts={[`${p.plan.sessions}×/wk`, p.plan.tag, p.plan.hot ? "★ Popular" : null]} textStyle={{ fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,0.82)", letterSpacing: 0.3 }} />
        </View>
      </View>
    </Pressable>
  );
}

// A compact plan card for the "more" rail — theme-aware surface, accent-tinted
// icon tile, name + one mono meta line.
function PlanMini({ p, C, shadow, onOpen }: { p: Preview; C: P; shadow: object; onOpen: () => void }) {
  const accent = p.color;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${p.plan.name}`}
      style={{ width: MINI_W, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 13, ...shadow }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${accent}22`, borderWidth: 1, borderColor: `${accent}55` }}>
        <Text style={{ fontSize: 17, color: accent }}>{p.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 13.5, color: C.chalk, letterSpacing: -0.1 }}>{p.plan.name}</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.4, textTransform: "uppercase", color: C.ash, marginTop: 3 }}>{p.plan.weeks} wks – {p.goalName}</Text>
      </View>
    </Pressable>
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
