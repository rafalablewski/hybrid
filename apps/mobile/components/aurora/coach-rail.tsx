import { useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { coachRailItems, type DiscoverCoach } from "@hybrid/core";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE } from "../../lib/ui";
import { useLang } from "../../lib/i18n";
import { getCoaches } from "../../lib/social-api";
import RailTail from "./rail-tail";
import { GUTTER , RADIUS} from "./kit";
import { withAlpha } from "./field";

// "Follow a coach" — a horizontally swipeable rail on the mobile Today. Mirrors
// the web rail: live marketplace (/api/coaches) with the shared placeholder
// people as the fallback until coaches publish storefronts.
//
// MARQUEE card (web parity — see design/follow-coach-redesign-ideas.html,
// concept 5, applied to every card): accent-washed card led by the person
// (accent-ringed avatar, name, one mono specialty line), an athlete pull-quote
// doing the selling (coach headline as the fallback), and a proof strip
// (rating / reviews / years) pinned to the bottom so every card shares one
// geometry — no wrapping chips, no ragged bottoms.

const CARD_W = 290;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "C";
}

// One cell of the proof strip: mono value over a tiny mono label.
function Stat({ C, value, label, first, star }: { C: Palette; value: string; label: string; first?: boolean; star?: boolean }) {
  return (
    <View style={{ flex: 1, paddingTop: 10, borderLeftWidth: first ? 0 : 1, borderLeftColor: C.line, paddingLeft: first ? 0 : 12 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>
        {star ? <Text style={{ color: C.amber }}>★ </Text> : null}{value}
      </Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: withAlpha(C.ash, 0.702), marginTop: 4 }}>{label}</Text>
    </View>
  );
}

// `headerless` drops the built-in "Follow a coach" title so a parent can supply
// its own section head instead — which is how Today mounts it. The built-in
// header is kept for any caller that has no head of its own.
// AuroraScreen's side gutter (GUTTER, kit.tsx) — a full-bleed rail pulls
// itself back out by exactly that so its scroll clip reaches the true edge.
const SCREEN_PAD = GUTTER;

// `bleed` lets the slider run FULL-BLEED: negative margins the width of the
// Screen padding pull the scroll clip out to the physical edge (with matching
// internal padding so resting cards still align with the column), so cards
// slide under the bezel instead of vanishing at the content column. Only for
// rails sitting directly on a Screen (Today) — inside a sheet the rail must
// respect the sheet's own padding.
// The built-in header NAMES the rail and nothing else: the marketplace is
// reached from the tail card at the end of the scroller (aurora/rail-tail.tsx),
// which always renders, so the header's old "Browse all →" link was a second
// door to the same room sitting at the wrong end of the swipe. `seeMore` went
// with it — a rail always ends in its exit, so there was nothing left for the
// flag to switch off. Mirrors web coach-rail.tsx.
export default function CoachRail({ onOpen, headerless = false, bleed = false }: { onOpen: () => void; headerless?: boolean; bleed?: boolean }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Soft card lift (web --shadow-card parity) — the black bloom.
  const cardShadow = { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } as const;
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
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: C.chalk, fontFamily: F.black, fontSize: fs.subtitle }}>{t("w.explore.coaches")}</Text>
          <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: fs.caption }}>{t("w.explore.coachSwipe")}</Text>
        </View>
      )}

      {/* Vertical padding inside the scroller (pulled back by the margins) so
          card shadows render instead of clipping at the scroll bounds. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_W + 12} decelerationRate="fast" style={{ marginVertical: -10, marginHorizontal: bleed ? -SCREEN_PAD : 0 }} contentContainerStyle={{ gap: 12, paddingLeft: bleed ? SCREEN_PAD : 0, paddingRight: bleed ? SCREEN_PAD : 8, paddingVertical: 10 }}>
        {items.map((c, i) => {
          const accent = C[c.accent];
          const accentText = txt(C, accent);
          const stats: Array<{ value: string; label: string; star?: boolean }> = [
            { value: c.rating != null ? c.rating.toFixed(1) : t("w.explore.coachNew"), label: t("w.explore.coachRating"), star: c.rating != null },
            ...(c.reviews ? [{ value: String(c.reviews), label: t("w.explore.coachReviews") }] : []),
            ...(c.years ? [{ value: `${c.years}y`, label: t("w.explore.coachCoaching") }] : []),
          ];
          return (
            <Pressable key={c.userId ?? c.handle ?? String(i)} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${t("w.explore.coachOpen")} ${c.name}`} style={{ position: "relative", width: CARD_W, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16, overflow: "hidden", ...cardShadow }}>
              {/* accent wash — the coach's colour bleeding in from the top corner
                  (a diagonal fade stands in for the web's radial gradient). */}
              <LinearGradient colors={[withAlpha(accent, 0.14), withAlpha(accent, 0.0)]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.9 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none" />
              <Text style={{ position: "absolute", top: 14, right: 14, color: withAlpha(C.ash, 0.55), fontFamily: F.mono, fontSize: fs.subtitle }}>›</Text>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 16 }}>
                <View style={{ width: 46, height: 46, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: accent, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: accentText, fontFamily: F.monoBold, fontSize: fs.body }}>{initials(c.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {/* Name in the display face, so the person leads the card
                      the way a byline leads an article. */}
                  {/* Name + check as row siblings: nested inside one truncating
                      Text the ✓ would be the first thing ellipsized away. */}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ color: C.chalk, fontFamily: F.black, fontSize: fs.subtitle, flexShrink: 1 }}>{c.name}</Text>
                    {c.verified ? <Text style={{ color: accentText, fontSize: fs.caption, marginLeft: 4 }}>✓</Text> : null}
                  </View>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ marginTop: 5, fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: C.ash }}>{c.specialties.slice(0, 2).join(" – ")}</Text>
                </View>
              </View>

              {/* the sell: an athlete's words, or the coach's own headline as fallback */}
              <View style={{ marginTop: 12, minHeight: 58 }}>
                {c.quote ? (
                  <>
                    <Text numberOfLines={2} style={{ fontSize: fs.body, lineHeight: 19.5, color: C.chalk }}>“{c.quote}”</Text>
                    <Text style={{ marginTop: 5, fontFamily: F.mono, fontSize: fs.nano, color: withAlpha(C.ash, 0.702) }}>— {t("w.explore.coachReview")}</Text>
                  </>
                ) : (
                  <Text numberOfLines={3} style={{ fontSize: fs.body, lineHeight: 19.5, color: C.ash }}>{c.headline}</Text>
                )}
              </View>

              <View style={{ flexDirection: "row", marginTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                {stats.map((s, si) => <Stat key={s.label} C={C} value={s.value} label={s.label} star={s.star} first={si === 0} />)}
              </View>
            </Pressable>
          );
        })}
        {/* THE EXIT — the SHARED RailTail, so every rail in the app draws its
            door from one implementation, and always at the end of the scroll. */}
        <RailTail onOpen={onOpen} label={t("w.explore.seeMore")} />
      </ScrollView>
    </View>
  );
}
