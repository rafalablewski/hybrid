import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView, Animated, Easing, useWindowDimensions } from "react-native";
import { feedCardView } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import { getFeed } from "../../lib/social-api";
import { Avatar } from "../social-kit";

// The CONNECT feed — post cards (avatar header · prose body · stat pills ·
// kudos/comments/share), the latest few of your circle's activity. `horizontal`
// lays them in a left/right slider (fixed-width cards); otherwise full-width
// stacked. Renders nothing when the feed is empty. Mirrors the web feed-preview.
export default function FeedPreview({ onOpen, horizontal = false }: { onOpen: () => void; horizontal?: boolean }) {
  const C = useTheme().palette;
  const { width } = useWindowDimensions();
  const cardW = Math.min(320, width * 0.82);
  const [feed, setFeed] = useState<any[] | null>(null);
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    let alive = true;
    getFeed().then((r: any) => { if (alive) setFeed((r.feed ?? []).slice(0, horizontal ? 8 : 4)); }).catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, [horizontal]);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const cardStyle = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 26, padding: 16, ...(horizontal ? { width: cardW } : {}) } as const;
  // Vertical stacks full-width; horizontal is a left/right scroll-snap slider.
  const Wrap = ({ children }: { children: ReactNode }) =>
    horizontal
      ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 2, paddingBottom: 4 }}>{children}</ScrollView>
      : <View style={{ gap: 16 }}>{children}</View>;

  // Loading → pulsing card skeletons that reserve the feed's space.
  if (feed === null) {
    return (
      <Wrap>
        {[0, 1].map((i) => (
          <View key={i} style={cardStyle}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Animated.View style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: C.line, opacity: pulse }} />
              <View style={{ flex: 1 }}>
                <Animated.View style={{ width: "40%", height: 11, borderRadius: 6, backgroundColor: C.line, opacity: pulse }} />
                <Animated.View style={{ width: "55%", height: 9, borderRadius: 6, backgroundColor: C.line, opacity: pulse, marginTop: 7 }} />
              </View>
            </View>
            <Animated.View style={{ width: "90%", height: 12, borderRadius: 6, backgroundColor: C.line, opacity: pulse, marginTop: 14 }} />
          </View>
        ))}
      </Wrap>
    );
  }

  // Loaded + genuinely empty → render nothing so Home stays uncluttered.
  if (feed.length === 0) return null;

  return (
    <Wrap>
      {feed.map((it: any) => {
        const v = feedCardView(it);
        return (
          <Pressable key={it.id} onPress={onOpen} style={cardStyle}>
            {/* header — avatar · name · when·context · ··· */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar url={it.author?.avatarUrl} name={it.author?.displayName} handle={it.author?.handle} size={34} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.chalk, fontSize: 14, fontFamily: F.bold }}>{it.kind === "pr" ? "🏆 " : ""}{v.name}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 11 }}>{v.meta}</Text>
              </View>
              <Text style={{ color: C.ash, fontSize: 18 }}>···</Text>
            </View>

            {/* body — the post's prose (when there is one) */}
            {!!v.body && <Text style={{ color: C.chalk, fontSize: 14, lineHeight: 20, marginTop: 12 }}>{v.body}</Text>}

            {/* stat pills */}
            {v.chips.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {v.chips.map((c, i) => (
                  <View key={i} style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: C.chalk, fontSize: 12, fontFamily: F.semi }}>{c}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* actions */}
            <View style={{ flexDirection: "row", gap: 20, marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
              <Text style={{ color: C.ash, fontSize: 13 }}>♡ {it.kudos ?? 0}</Text>
              <Text style={{ color: C.ash, fontSize: 13 }}>💬 {it.comments ?? 0}</Text>
              <Text style={{ color: C.ash, fontSize: 13 }}>↗ Share</Text>
            </View>
          </Pressable>
        );
      })}
    </Wrap>
  );
}
