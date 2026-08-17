import { type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  AURORA_ICON_PATHS,
  auroraIconStroke,
  glyphPaths,
  sportMarkPaths,
  type AuroraIconName,
  type GlyphName,
} from "@hybrid/core";

/**
 * Aurora line icons (mobile) — TRUE VECTORS via react-native-svg, stroked from
 * the shared @hybrid/core path data at the shared `auroraIconStroke(size)`
 * weight, so the same glyph carries the same optical weight as web at every
 * size. (The old renderer tinted 216px PNGs baked at a heavier stroke, which
 * made mobile icons up to ~43% bolder than web's.)
 *
 * The PNG map below survives ONLY for the native tab bar's Android fallback
 * (app/(tabs)/_layout.tsx) — nothing else should consume PNGs.
 */
export const SOURCES: Partial<Record<AuroraIconName, ReturnType<typeof require>>> = {
  back: require("../../assets/icons/back.png"),
  mail: require("../../assets/icons/mail.png"),
  lock: require("../../assets/icons/lock.png"),
  eye: require("../../assets/icons/eye.png"),
  user: require("../../assets/icons/user.png"),
  search: require("../../assets/icons/search.png"),
  bell: require("../../assets/icons/bell.png"),
  calendar: require("../../assets/icons/calendar.png"),
  check: require("../../assets/icons/check.png"),
  verified: require("../../assets/icons/verified.png"),
  "chevron-down": require("../../assets/icons/chevron-down.png"),
  "arrow-up": require("../../assets/icons/arrow-up.png"),
  location: require("../../assets/icons/location.png"),
  navigation: require("../../assets/icons/navigation.png"),
  play: require("../../assets/icons/play.png"),
  heart: require("../../assets/icons/heart.png"),
  add: require("../../assets/icons/add.png"),
  logout: require("../../assets/icons/logout.png"),
  settings: require("../../assets/icons/settings.png"),
  share: require("../../assets/icons/share.png"),
  bookmark: require("../../assets/icons/bookmark.png"),
  "list-check": require("../../assets/icons/list-check.png"),
  "list-play": require("../../assets/icons/list-play.png"),
  "list-add": require("../../assets/icons/list-add.png"),
  "calendar-event": require("../../assets/icons/calendar-event.png"),
  "user-circle": require("../../assets/icons/user-circle.png"),
  "user-add": require("../../assets/icons/user-add.png"),
  store: require("../../assets/icons/store.png"),
  globe: require("../../assets/icons/globe.png"),
  swap: require("../../assets/icons/swap.png"),
  village: require("../../assets/icons/village.png"),
  gps: require("../../assets/icons/gps.png"),
  info: require("../../assets/icons/info.png"),
  offer: require("../../assets/icons/offer.png"),
  "add-square": require("../../assets/icons/add-square.png"),
  "check-circle": require("../../assets/icons/check-circle.png"),
  "user-square": require("../../assets/icons/user-square.png"),
  download: require("../../assets/icons/download.png"),
  copy: require("../../assets/icons/copy.png"),
  edit: require("../../assets/icons/edit.png"),
  grid: require("../../assets/icons/grid.png"),
  "fork-knife": require("../../assets/icons/fork-knife.png"),
};

/**
 * THE RENDERER. One stroked 72-box, used by every mark the app draws.
 *
 * `Glyph` takes any name in the one vocabulary (core `GlyphName` — the design
 * kit, the nutrition extension, the Today hub's three, the product marks) and
 * `SportMark` takes a SPORT and resolves its drawing. Between them there is no
 * third way to put a picture on the glass, which is the whole finding: this
 * component and the emoji ban in design-tokens.test.ts are two halves of one
 * rule.
 *
 * `color` has no default on purpose. The old nutrition renderer defaulted to
 * "#fff" — a colour the palette does not contain — so every call site that
 * forgot to pass one drew pure white on near-black, off-palette, and nothing
 * failed. A required colour is how that stops happening.
 *
 * ── `label`, AND WHY A DRAWN MARK NEEDS ONE WHERE AN EMOJI DID NOT ─────────
 *
 * This is the cost of the emoji sweep, and it was nearly missed. An emoji is
 * TEXT: VoiceOver reads 🥇 as "1st place medal" and 🏆 as "trophy" with no
 * effort from the caller. A stroked <Svg> is silent. So every place a
 * pictograph was carrying meaning ON ITS OWN — the leaderboard's podium ranks,
 * the PR marker beside a lift — swapping it for a drawn mark did not just
 * change the drawing, it deleted the information for anyone not looking at the
 * screen.
 *
 * The contract, matching `AMarkTile`'s: pass `label` when the mark SAYS
 * something its surroundings do not. With no label the mark is declared
 * DECORATIVE and hidden from the accessibility tree — silent by default rather
 * than silent by accident, so a screen reader never announces "image" at a
 * shape that means nothing.
 */
function Stroked({ paths, size, color, label, style }: { paths: string[]; size: number; color: ColorValue; label?: string; style?: StyleProp<ViewStyle> }) {
  const a11y = label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
    : { accessibilityElementsHidden: true, importantForAccessibility: "no" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none" style={style} {...a11y}>
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={auroraIconStroke(size)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

export function Glyph({
  name,
  size = 22,
  color,
  label,
  style,
}: {
  name: GlyphName;
  size?: number;
  color: ColorValue;
  /** An accessible name — give one only where the mark says something its
   *  surroundings do not. Omitted = decorative, and hidden from VoiceOver. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <Stroked paths={glyphPaths(name)} size={size} color={color} label={label} style={style} />;
}

/**
 * A SPORT's own drawing, resolved from its name through core's `sportMark()`.
 *
 * The marks shipped in Aug 2026 and were drawn at exactly TWO sites — the sport
 * page's hero and its collapsed bar — while every other surface that names a
 * sport (the quick picker, the other-sports lanes, an activity row, a session
 * row, the endurance lanes) drew the catalog EMOJI. This component is what a
 * row calls; `fallback` is the mark for a sport with no drawing of its own,
 * and it is a GLYPH, never a picture from the platform.
 */
export function SportMark({
  sport,
  size = 22,
  color,
  fallback = "target",
  label,
  style,
}: {
  sport: string;
  size?: number;
  color: ColorValue;
  fallback?: GlyphName;
  /** See `Glyph.label`. A sport row usually names the sport in text beside the
   *  mark, so this is normally left off. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const paths = sportMarkPaths(sport);
  return <Stroked paths={paths.length ? paths : glyphPaths(fallback)} size={size} color={color} label={label} style={style} />;
}

export function AuroraIcon({
  name,
  size = 22,
  color,
  style,
}: {
  name: AuroraIconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  return <Stroked paths={AURORA_ICON_PATHS[name]} size={size} color={color ?? "#000"} style={style} />;
}
