import { Image, type ColorValue, type ImageStyle, type StyleProp } from "react-native";
import Svg, { Path } from "react-native-svg";
import { AURORA_ICON_PATHS, type AuroraIconName } from "@hybrid/core";

/**
 * Aurora line icons (mobile). Two renderers over the SAME icon names:
 * - AuroraIcon — the design-kit PNGs (black on transparent) recoloured via
 *   `tintColor`. Regenerated at 216px so they stay sharp at app sizes.
 * - AuroraSvgIcon — true vectors via react-native-svg, drawn from the shared
 *   @hybrid/core AURORA_ICON_PATHS (the exact path data the web renderer
 *   strokes), so it is pixel-perfect at ANY size/scale. Used where crispness
 *   is most visible (the bottom-nav pill glyphs).
 * Names are kept in lockstep with @hybrid/core AuroraIconName + the web SVG
 * renderer. Metro needs static require() literals, so the PNG map is spelled
 * out.
 */
const SOURCES: Record<AuroraIconName, ReturnType<typeof require>> = {
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

export function AuroraIcon({
  name,
  size = 22,
  color,
  style,
}: {
  name: AuroraIconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SOURCES[name]}
      style={[{ width: size, height: size, tintColor: color, resizeMode: "contain" }, style]}
    />
  );
}

/**
 * Vector twin of AuroraIcon (react-native-svg over the shared 72×72 path
 * data). strokeWidth is in viewBox units — 6 matches the design-kit rasters'
 * weight, so swapping a PNG for this is visually identical, just crisp.
 */
export function AuroraSvgIcon({
  name,
  size = 22,
  color = "#fff",
  strokeWidth = 6,
}: {
  name: AuroraIconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {AURORA_ICON_PATHS[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
