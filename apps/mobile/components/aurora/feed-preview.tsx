import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView, Animated, Easing, useWindowDimensions } from "react-native";
import { feedCardView } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { useLang } from "../../lib/i18n";
import { getFeed } from "../../lib/social-api";
import { Avatar } from "../social-kit";
import { MetaLine } from "./meta";

// The CONNECT feed — post cards (avatar header, prose body, stat pills ·
// kudos/comments/share), the latest few of your circle's activity. `horizontal`
// lays them in a left/right slider (fixed-width cards); otherwise full-width
// stacked. Renders nothing when the feed is empty. Mirrors the web feed-preview.
export default function FeedPreview({ onOpen, horizontal = false }: { onOpen: () => void; horizontal?: boolean }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const { width } = useWindowDimensions();
  const cardW = Math.min(320, width * 0.82);
  const [feed, setFeed] = useState<any[] | null>(null);
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    let alive = true;
    getFeed().then((r: any) => { if (alive) setFeed((r.feed ?? []).slice(0, horizontal ? 6 : 4)); }).catch(() => { if (alive) setFeed([]); });
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

  // X / Twitter-style post — avatar left, name ✓ @handle, time inline, prose,
  // an optional attached-content card, and a reply/repost/like/share row.
  const postStyle = horizontal
    ? ({ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, width: cardW } as const)
    : ({ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line } as const);
  return (
    <Wrap>
      {feed.map((it: any) => {
        const v = feedCardView(it);
        const handle = it.author?.handle;
        return (
          <Pressable key={it.id} onPress={onOpen} style={postStyle}>
            {/* header — avatar inline; everything below spans the full width */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
              <Avatar url={it.author?.avatarUrl} name={it.author?.displayName} handle={handle} size={36} />
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 14 }}>{v.name}</Text>
                {it.author?.coachVerified ? <Text style={{ color: txt(C, C.blue), fontSize: 12 }}>✓</Text> : null}
                <Text numberOfLines={1} style={{ color: C.ash, fontFamily: F.mono, fontSize: 12, flexShrink: 1 }}>{handle ? `@${handle}  ` : ""}{v.when}</Text>
              </View>
            </View>

            {/* body prose — full width */}
            {!!v.body && <Text style={{ color: C.chalk, fontSize: 14.5, lineHeight: 20, marginTop: 12 }}>{v.body}</Text>}

              {/* attached content — the session/PR summary: a lead line + stat
                  pills (each chip its own element, never a ·-joined string) */}
              {(v.lead || v.chips.length > 0) && (
                <View style={{ marginTop: v.body ? 8 : 12 }}>
                  {!!v.lead && <Text style={{ color: C.chalk, fontFamily: F.mono, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 }}>{v.lead}</Text>}
                  {v.chips.length > 0 && <View style={{ marginTop: v.lead ? 5 : 0 }}><MetaLine parts={v.chips} textStyle={{ fontFamily: F.mono, fontSize: 12.5, color: C.ash }} /></View>}
                </View>
              )}

              {/* action row — monochrome glyphs, full width */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", maxWidth: 300, marginTop: 14 }}>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>↩  {it.comments ?? 0}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>⇄  {it.reposts ?? 0}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>♡  {it.kudos ?? 0}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 13 }}>↗</Text>
              </View>
          </Pressable>
        );
      })}
      {/* Threads-style trailing "See all" card — the slider caps at 6, so this
          nudges people into the full feed instead of scrolling an endless rail. */}
      {horizontal && (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={t("w.explore.seeAll")}
          style={{ width: 132, borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12 }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 16 }}>→</Text>
          </View>
          <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>{t("w.explore.seeAll")}</Text>
        </Pressable>
      )}
    </Wrap>
  );
}
