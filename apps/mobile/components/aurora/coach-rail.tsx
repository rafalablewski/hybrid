import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { coachRailItems, type DiscoverCoach } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { getCoaches, follow } from "../../lib/social-api";

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
export default function CoachRail({ onOpen, headerless = false }: { onOpen: () => void; headerless?: boolean }) {
  const C = useTheme().palette;
  const [coaches, setCoaches] = useState<DiscoverCoach[] | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    getCoaches().then((d: any) => { if (alive) setCoaches(coachRailItems(d?.coaches)); }).catch(() => { if (alive) setCoaches(coachRailItems(null)); });
    return () => { alive = false; };
  }, []);

  const items = coaches ?? coachRailItems(null);
  const accent = (a: string) => (a === "blue" ? C.blue : a === "violet" ? C.violet : a === "amber" ? C.amber : C.lime);

  const doFollow = async (c: DiscoverCoach) => {
    if (!c.userId) { onOpen(); return; }
    setFollowed((f) => ({ ...f, [c.userId!]: true }));
    try { await follow({ followeeId: c.userId }); } catch { /* best-effort */ }
  };

  return (
    <View style={{ marginTop: headerless ? 0 : 18 }}>
      {!headerless && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View>
            <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 17 }}>Follow a coach</Text>
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>Swipe to find a coach for your goal</Text>
          </View>
          <Pressable onPress={onOpen}><Text style={{ color: txt(C, C.lime), fontFamily: F.bold, fontWeight: "700", fontSize: 13 }}>Browse all →</Text></Pressable>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={228} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
        {items.map((c, i) => {
          const isFollowing = c.userId ? followed[c.userId] : false;
          return (
            <View key={c.userId ?? c.handle ?? String(i)} style={{ width: 216, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, padding: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Pressable onPress={onOpen} style={{ width: 48, height: 48, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: `${accent(c.accent)}33`, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 16 }}>{initials(c.name)}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", fontSize: 14 }}>{c.name}{c.verified ? <Text style={{ color: txt(C, C.lime) }}> ✓</Text> : null}</Text>
                  <Text style={{ fontSize: 11, marginTop: 2 }}>
                    {c.rating == null ? <Text style={{ color: C.ash, fontFamily: F.mono }}>New</Text> : (
                      <Text><Text style={{ color: C.gold }}>{"★".repeat(Math.round(c.rating))}</Text><Text style={{ color: C.line }}>{"★".repeat(5 - Math.round(c.rating))}</Text><Text style={{ color: C.ash, fontFamily: F.mono }}> {c.rating.toFixed(1)}</Text></Text>
                    )}
                  </Text>
                </View>
              </View>
              <Text numberOfLines={2} style={{ color: C.ash, fontSize: 12.5, marginTop: 10, lineHeight: 17, minHeight: 34 }}>{c.headline}</Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8, minHeight: 26 }}>
                {c.specialties.slice(0, 2).map((s) => (
                  <View key={s} style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.chalk, fontSize: 11 }}>{s}</Text></View>
                ))}
              </View>
              <Pressable onPress={() => doFollow(c)} style={{ marginTop: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: isFollowing ? C.line : C.lime, backgroundColor: isFollowing ? "transparent" : C.lime, alignItems: "center" }}>
                <Text style={{ color: isFollowing ? C.chalk : C.onAccent, fontFamily: F.bold, fontWeight: "700", fontSize: 13 }}>{isFollowing ? "Following" : c.placeholder ? "View" : "Follow"}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
