import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView, Animated, Easing, useWindowDimensions } from "react-native";
import { feedCardView } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { F, serifIf } from "../../lib/ui";
import { useLang } from "../../lib/i18n";
import { getFeed } from "../../lib/social-api";
import { Avatar } from "../social-kit";
import { MetaLine } from "./meta";

// The CONNECT feed — post cards (avatar header, prose body, stat pills ·
// kudos/comments/share), the latest few of your circle's activity. `horizontal`
// lays them in a left/right slider (fixed-width cards); otherwise full-width
// stacked. Renders nothing when the feed is empty. Mirrors the web feed-preview.
// AuroraScreen's 16dp side gutter (kit.tsx) — a full-bleed rail pulls itself
// back out by exactly that so its scroll clip reaches the true screen edge.
const SCREEN_PAD = 16;

// `bleed` (horizontal only): run the slider FULL-BLEED — negative margins the
// width of the Screen padding pull the scroll clip out to the physical edge
// (matching internal padding keeps resting cards on the column), so cards
// slide under the bezel instead of vanishing at the content column.
export default function FeedPreview({ onOpen, horizontal = false, bleed = false }: { onOpen: () => void; horizontal?: boolean; bleed?: boolean }) {
  const { palette: C, scheme } = useTheme();
  // Soft theme-aware card lift (web --shadow-card parity): warm sumi-wash on
  // Kyoto Hour, the usual black bloom on Aurora — never black on washi.
  const cardShadow = scheme === "light"
    ? ({ shadowColor: "#584934", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const)
    : ({ shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const);
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

  const cardStyle = { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 16, ...(horizontal ? { width: cardW } : {}) } as const;
  // Vertical stacks full-width; horizontal is a left/right scroll-snap slider.
  const Wrap = ({ children }: { children: ReactNode }) =>
    horizontal
      ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: -10, marginHorizontal: bleed ? -SCREEN_PAD : 0 }} contentContainerStyle={{ gap: 12, paddingHorizontal: bleed ? SCREEN_PAD : 2, paddingVertical: 10 }}>{children}</ScrollView>
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
                <Animated.View style={{ width: "55%", height: 9, borderRadius: 6, backgroundColor: C.line, opacity: pulse, marginTop: 8 }} />
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
    ? ({ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 16, width: cardW, ...cardShadow } as const)
    : ({ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line } as const);
  return (
    <Wrap>
      {feed.map((it: any) => {
        const v = feedCardView(it);
        const handle = it.author?.handle;
        return (
          <Pressable key={it.id} onPress={onOpen} style={postStyle}>
            {/* header — avatar inline; everything below spans the full width */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
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
                  {/* Three voices, not one: the lead (workout name / "PR") is
                      the card's TITLE in the display face — Mincho under Kyoto
                      Hour — prose stays sans, mono is reserved for the fact
                      line + counts. All-mono flattened every card into the
                      same texture. */}
                  {!!v.lead && <Text style={{ color: C.chalk, fontFamily: serifIf(scheme, F.bold), fontSize: 16.5, lineHeight: 21 }}>{v.lead}</Text>}
                  {v.chips.length > 0 && <View style={{ marginTop: v.lead ? 6 : 0 }}><MetaLine parts={v.chips} textStyle={{ fontFamily: F.mono, fontSize: 12.5, color: C.ash }} /></View>}
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
      {/* Threads-style trailing "See more" button — the slider caps at 6, so
          this nudges people into the full feed instead of scrolling an endless
          rail (unified with the coach rail's end-of-rail affordance). */}
      {horizontal && (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={t("w.explore.seeMore")}
          style={{ width: 132, borderWidth: 1, borderColor: C.line, borderRadius: 28, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, ...cardShadow }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 16 }}>→</Text>
          </View>
          <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>{t("w.explore.seeMore")}</Text>
        </Pressable>
      )}
    </Wrap>
  );
}
