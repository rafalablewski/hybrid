import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing } from "react-native";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import { getFeed } from "../../lib/social-api";
import { Avatar } from "../social-kit";

// A compact activity-feed strip for the BOTTOM of the mobile Home — like the
// Instagram-Threads strip under the feed. Renders nothing when the feed is empty.
export default function FeedPreview({ onOpen }: { onOpen: () => void }) {
  const C = useTheme().palette;
  const [feed, setFeed] = useState<any[] | null>(null);
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    let alive = true;
    getFeed().then((r: any) => { if (alive) setFeed((r.feed ?? []).slice(0, 4)); }).catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, []);
  // Gentle breathing pulse for the loading skeleton.
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

  // Still in flight → a skeleton that reserves the Feed's space and gently
  // pulses, so the strip fills in instead of popping in late from nothing.
  if (feed === null) {
    return (
      <View style={{ marginTop: 22 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, paddingBottom: 10 }}>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 17 }}>Feed</Text>
          <Text style={{ color: C.lime, fontFamily: F.bold, fontWeight: "700", fontSize: 13 }}>View all →</Text>
        </View>
        <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, overflow: "hidden" }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <Animated.View style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: C.line, opacity: pulse }} />
              <View style={{ flex: 1 }}>
                <Animated.View style={{ width: "60%", height: 11, borderRadius: 6, backgroundColor: C.line, opacity: pulse }} />
                <Animated.View style={{ width: "40%", height: 9, borderRadius: 6, backgroundColor: C.line, opacity: pulse, marginTop: 7 }} />
              </View>
              <Animated.View style={{ width: 28, height: 9, borderRadius: 6, backgroundColor: C.line, opacity: pulse }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Loaded + genuinely empty → render nothing so Home stays uncluttered.
  if (feed.length === 0) return null;

  return (
    <View style={{ marginTop: 22 }}>
      <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, paddingBottom: 10 }}>
        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 17 }}>Feed</Text>
        <Text style={{ color: C.lime, fontFamily: F.bold, fontWeight: "700", fontSize: 13 }}>View all →</Text>
      </Pressable>
      <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, overflow: "hidden" }}>
        {feed.map((it: any, i: number) => (
          <Pressable key={it.id} onPress={onOpen} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
            <Avatar url={it.author?.avatarUrl} name={it.author?.displayName} handle={it.author?.handle} size={34} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: C.chalk, fontSize: 13.5, fontFamily: F.bold, fontWeight: "600" }}>{it.kind === "pr" ? "🏆 " : ""}{it.title}</Text>
              <Text numberOfLines={1} style={{ color: C.ash, fontSize: 12 }}>{it.detail}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 11 }}>{it.when}</Text>
              {it.kudos > 0 ? <Text style={{ color: C.ash, fontSize: 11, marginTop: 2 }}>👏 {it.kudos}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
