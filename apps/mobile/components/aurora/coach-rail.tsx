import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { coachRailItems, type DiscoverCoach } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { F, serifIf } from "../../lib/ui";
import { getCoaches } from "../../lib/social-api";

// "Follow a coach" — a horizontally swipeable rail on the mobile Today. Mirrors
// the web rail: live marketplace (/api/coaches) with the shared placeholder
// people as the fallback until coaches publish storefronts.

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "C";
}

// `headerless` drops the built-in "Follow a coach" title + Browse-all link so a
// parent (Explore) can supply the shared, unified SectionHead instead. Today
// keeps the default header.
// AuroraScreen's 16dp side gutter (kit.tsx) — a full-bleed rail pulls itself
// back out by exactly that so its scroll clip reaches the true screen edge.
const SCREEN_PAD = 16;

// `bleed` lets the slider run FULL-BLEED: negative margins the width of the
// Screen padding pull the scroll clip out to the physical edge (with matching
// internal padding so resting cards still align with the column), so cards
// slide under the bezel instead of vanishing at the content column. Only for
// rails sitting directly on a Screen (Explore) — inside a sheet the rail must
// respect the sheet's own padding.
export default function CoachRail({ onOpen, headerless = false, bleed = false }: { onOpen: () => void; headerless?: boolean; bleed?: boolean }) {
  const { palette: C, scheme } = useTheme();
  // Soft theme-aware card lift (web --shadow-card parity): warm sumi-wash on
  // Kyoto Hour, the usual black bloom on Aurora — never black on washi.
  const cardShadow = scheme === "light"
    ? ({ shadowColor: "#584934", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const)
    : ({ shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const);
  const [coaches, setCoaches] = useState<DiscoverCoach[] | null>(null);

  useEffect(() => {
    let alive = true;
    getCoaches().then((d: any) => { if (alive) setCoaches(coachRailItems(d?.coaches)); }).catch(() => { if (alive) setCoaches(coachRailItems(null)); });
    return () => { alive = false; };
  }, []);

  const items = coaches ?? coachRailItems(null);

  return (
    <View style={{ marginTop: headerless ? 0 : 18 }}>
      {!headerless && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View>
            <Text style={{ color: C.chalk, fontFamily: serifIf(scheme, F.black), fontSize: 17 }}>Follow a coach</Text>
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>Swipe to find a coach for your goal</Text>
          </View>
          <Pressable onPress={onOpen}><Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>Browse all →</Text></Pressable>
        </View>
      )}

      {/* Vertical padding inside the scroller (pulled back by the margins) so
          card shadows render instead of clipping at the scroll bounds. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={232} decelerationRate="fast" style={{ marginVertical: -10, marginHorizontal: bleed ? -SCREEN_PAD : 0 }} contentContainerStyle={{ gap: 12, paddingLeft: bleed ? SCREEN_PAD : 0, paddingRight: bleed ? SCREEN_PAD : 8, paddingVertical: 10 }}>
        {items.map((c, i) => (
          <Pressable key={c.userId ?? c.handle ?? String(i)} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${c.name}`} style={{ position: "relative", width: 220, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, ...cardShadow }}>
            <Text style={{ position: "absolute", top: 14, right: 14, color: `${C.ash}8c`, fontFamily: F.mono, fontSize: 16 }}>›</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 16 }}>
              <View style={{ width: 46, height: 46, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontWeight: "700", fontSize: 13 }}>{initials(c.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                {/* Name in the display face — Mincho under Kyoto Hour — so the
                    person leads the card the way a byline leads an article. */}
                <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: serifIf(scheme, F.bold), fontSize: 15 }}>{c.name}{c.verified ? <Text style={{ color: txt(C, C.blue) }}> ✓</Text> : null}</Text>
                {c.rating == null ? (
                  <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 11, marginTop: 4 }}>New</Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <Text style={{ color: C.gold, fontSize: 12 }}>★</Text>
                    <Text style={{ color: C.chalk, fontFamily: F.mono, fontSize: 12 }}>{c.rating.toFixed(1)}</Text>
                    {c.reviews ? <Text style={{ color: `${C.ash}b3`, fontFamily: F.mono, fontSize: 12 }}>{c.reviews} reviews</Text> : null}
                  </View>
                )}
              </View>
            </View>
            <Text numberOfLines={2} style={{ color: C.ash, fontSize: 12.5, marginTop: 12, lineHeight: 17, minHeight: 34 }}>{c.headline}</Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 12, minHeight: 24 }}>
              {c.specialties.slice(0, 2).map((s) => (
                <View key={s} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>{s}</Text></View>
              ))}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
