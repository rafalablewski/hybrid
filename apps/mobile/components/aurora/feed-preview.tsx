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

  // X / Twitter-style post — avatar left, name ✓ @handle · time inline, prose,
  // an optional attached-content card, and a reply/repost/like/share row.
  const postStyle = horizontal
    ? ({ flexDirection: "row", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 14, width: cardW } as const)
    : ({ flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line } as const);
  return (
    <Wrap>
      {feed.map((it: any) => {
        const v = feedCardView(it);
        const handle = it.author?.handle;
        return (
          <Pressable key={it.id} onPress={onOpen} style={postStyle}>
            <Avatar url={it.author?.avatarUrl} name={it.author?.displayName} handle={handle} size={42} />
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* header line — name · verified · @handle · time */}
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 14 }}>{v.name}</Text>
                {it.author?.coachVerified ? <Text style={{ color: C.lime, fontSize: 12 }}>✓</Text> : null}
                <Text numberOfLines={1} style={{ color: C.ash, fontFamily: F.mono, fontSize: 12, flexShrink: 1 }}>{handle ? `@${handle} · ` : ""}{v.meta}</Text>
              </View>

              {/* body prose */}
              {!!v.body && <Text style={{ color: C.chalk, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{it.kind === "pr" ? "🏆 " : ""}{v.body}</Text>}

              {/* attached content — the session/PR stats as one quiet card */}
              {v.chips.length > 0 && (
                <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginTop: 10 }}>
                  <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 11.5 }}>{v.chips.join("  ·  ")}</Text>
                </View>
              )}

              {/* action row */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", maxWidth: 288, marginTop: 11 }}>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>💬 {it.comments ?? 0}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>🔁 {it.reposts ?? 0}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>♡ {it.kudos ?? 0}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>↗</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </Wrap>
  );
}
