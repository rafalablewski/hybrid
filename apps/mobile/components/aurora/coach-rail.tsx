import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { coachRailItems, type DiscoverCoach } from "@hybrid/core";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { F, serifIf } from "../../lib/ui";
import { useLang } from "../../lib/i18n";
import { getCoaches } from "../../lib/social-api";
import { ArrowGlyph, CtaLabel } from "./cta-label";

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
      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontWeight: "700", fontSize: 13, color: C.chalk }}>
        {star ? <Text style={{ color: C.gold }}>★ </Text> : null}{value}
      </Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: `${C.ash}b3`, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

// `headerless` drops the built-in "Follow a coach" title + Browse-all link so a
// parent can supply its own section head instead — which is how Today mounts it.
// The built-in header is kept for any caller that has no head of its own.
// AuroraScreen's 16dp side gutter (kit.tsx) — a full-bleed rail pulls itself
// back out by exactly that so its scroll clip reaches the true screen edge.
const SCREEN_PAD = 16;

// `bleed` lets the slider run FULL-BLEED: negative margins the width of the
// Screen padding pull the scroll clip out to the physical edge (with matching
// internal padding so resting cards still align with the column), so cards
// slide under the bezel instead of vanishing at the content column. Only for
// rails sitting directly on a Screen (Today) — inside a sheet the rail must
// respect the sheet's own padding.
// `seeMore` appends a trailing "See more" button at the end of the rail (the
// unified rail affordance — the community rail carries the twin), so the rest of
// the marketplace is one tap away without an "All →" link up in the header.
export default function CoachRail({ onOpen, headerless = false, bleed = false, seeMore = false }: { onOpen: () => void; headerless?: boolean; bleed?: boolean; seeMore?: boolean }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
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
            <Text style={{ color: C.chalk, fontFamily: serifIf(scheme, F.black), fontSize: 17 }}>{t("w.explore.coaches")}</Text>
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 12 }}>{t("w.explore.coachSwipe")}</Text>
          </View>
          <Pressable onPress={onOpen}><CtaLabel label={`${t("w.explore.browseAll")} →`} color={C.ash} fontSize={11} font={F.mono} style={{ letterSpacing: 0.9, textTransform: "uppercase" }} /></Pressable>
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
            <Pressable key={c.userId ?? c.handle ?? String(i)} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${t("w.explore.coachOpen")} ${c.name}`} style={{ position: "relative", width: CARD_W, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16, overflow: "hidden", ...cardShadow }}>
              {/* accent wash — the coach's colour bleeding in from the top corner
                  (a diagonal fade stands in for the web's radial gradient). */}
              <LinearGradient colors={[`${accent}24`, `${accent}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.9 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none" />
              <Text style={{ position: "absolute", top: 14, right: 14, color: `${C.ash}8c`, fontFamily: F.mono, fontSize: 16 }}>›</Text>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 16 }}>
                <View style={{ width: 46, height: 46, borderRadius: 999, borderWidth: 1.5, borderColor: accent, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: accentText, fontFamily: F.mono, fontWeight: "700", fontSize: 13 }}>{initials(c.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {/* Name in the display face — Mincho under Kyoto Hour — so the
                      person leads the card the way a byline leads an article. */}
                  {/* Name + check as row siblings: nested inside one truncating
                      Text the ✓ would be the first thing ellipsized away. */}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: serifIf(scheme, F.black), fontSize: 16, flexShrink: 1 }}>{c.name}</Text>
                    {c.verified ? <Text style={{ color: accentText, fontSize: 12, marginLeft: 4 }}>✓</Text> : null}
                  </View>
                  <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: F.mono, fontSize: 10, fontWeight: "600", letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{c.specialties.slice(0, 2).join(" – ")}</Text>
                </View>
              </View>

              {/* the sell: an athlete's words, or the coach's own headline as fallback */}
              <View style={{ marginTop: 12, minHeight: 58 }}>
                {c.quote ? (
                  <>
                    <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 19.5, color: C.chalk }}>“{c.quote}”</Text>
                    <Text style={{ marginTop: 5, fontFamily: F.mono, fontSize: 10, color: `${C.ash}b3` }}>— {t("w.explore.coachReview")}</Text>
                  </>
                ) : (
                  <Text numberOfLines={3} style={{ fontSize: 13, lineHeight: 19.5, color: C.ash }}>{c.headline}</Text>
                )}
              </View>

              <View style={{ flexDirection: "row", marginTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                {stats.map((s, si) => <Stat key={s.label} C={C} value={s.value} label={s.label} star={s.star} first={si === 0} />)}
              </View>
            </Pressable>
          );
        })}
        {/* Trailing "See more" button — the same treatment as the community
            rail, so the two rails share one end-of-rail affordance. */}
        {seeMore && (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t("w.explore.seeMore")}
            style={{ width: 132, borderWidth: 1, borderColor: C.line, borderRadius: 28, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, ...cardShadow }}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
              <ArrowGlyph size={15} color={C.ash} />
            </View>
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", textAlign: "center" }}>{t("w.explore.seeMore")}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
