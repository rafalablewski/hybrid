import { useEffect, useRef } from "react";
import { View, Text, ScrollView, Animated, Easing } from "react-native";
import { colors, fs, liveElapsedText, tracking, type LiveAthlete } from "@hybrid/core";
import { F, serifIf, PressScale as Pressable } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { Avatar } from "./social-kit";
import { GUTTER, RADIUS } from "./aurora/kit";

/**
 * NOW TRAINING (mobile) — twin of apps/web/components/feed-live-strip.tsx.
 *
 * Presence, not authored ephemera: an unfinished session IS the signal, so
 * nobody has to film themselves between sets for this rail to have something
 * in it. Renders nothing when nobody is training — a rail advertising that
 * your circle is inactive is worse than no rail.
 */
export default function FeedLiveStrip({ live, onOpen }: { live: LiveAthlete[]; onOpen: (handle: string) => void }) {
  const C = useTheme().palette;
  const scheme = useTheme().scheme;
  const { t } = useLang();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!live.length) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.78, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live.length, pulse]);

  if (!live.length) return null;

  return (
    <View style={{ marginBottom: 10 }} accessibilityLabel={t("feed.live.title")}>
      {/* SectionHead idiom: display title left, mono meta right — no marker. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 2, paddingBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.bodyLg, color: C.chalk }}>{t("feed.live.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash }}>
          {t("feed.live.count").replace("{n}", String(live.length)).toUpperCase()}
        </Text>
      </View>

      {/* FULL-BLEED per the house rule: negative margins the width of the
          screen gutter pull the scroll clip to the true screen edge, with
          matching internal padding so resting avatars still line up with the
          content column. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -GUTTER }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14, paddingBottom: 4 }}
      >
        {live.map((l) => {
          const ring = txt(C, l.accent === "blue" ? colors.blue : colors.lime);
          const elapsed = liveElapsedText(l.elapsedMin);
          return (
            <Pressable
              key={l.sessionId}
              onPress={() => onOpen(l.author.handle)}
              accessibilityRole="button"
              accessibilityLabel={t("feed.live.aria").replace("{name}", l.author.displayName || l.author.handle).replace("{time}", elapsed)}
            >
              <View style={{ width: 62, alignItems: "center", gap: 6 }}>
                <View style={{ padding: 3, borderRadius: RADIUS.pill, borderWidth: 2, borderColor: ring }}>
                  <Avatar url={l.author.avatarUrl} name={l.author.displayName} handle={l.author.handle} size={44} />
                  {/* A LIVE dot is semantic state, not decoration. */}
                  <Animated.View
                    style={{
                      position: "absolute",
                      right: 0,
                      bottom: 0,
                      width: 12,
                      height: 12,
                      borderRadius: RADIUS.pill,
                      backgroundColor: txt(C, colors.red),
                      borderWidth: 2.5,
                      borderColor: C.ink,
                      transform: [{ scale: pulse }],
                    }}
                  />
                </View>
                <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.nano, color: C.ash, maxWidth: 62 }}>
                  {(l.author.displayName || l.author.handle || "").split(" ")[0]}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: txt(C, colors.red) }}>{elapsed}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
