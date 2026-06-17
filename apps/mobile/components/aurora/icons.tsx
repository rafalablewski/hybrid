import { Image, type ImageStyle, type StyleProp } from "react-native";
import type { AuroraIconName } from "@hybrid/core";

/**
 * Aurora line icons (mobile). Renders the uploaded design-kit PNGs (black on
 * transparent) recoloured via `tintColor` — no SVG dependency. Icon names are
 * kept in lockstep with @hybrid/core AuroraIconName + the web SVG renderer.
 *
 * Metro needs static require() literals, so the map is spelled out.
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
};

export function AuroraIcon({
  name,
  size = 22,
  color,
  style,
}: {
  name: AuroraIconName;
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SOURCES[name]}
      style={[{ width: size, height: size, tintColor: color, resizeMode: "contain" }, style]}
    />
  );
}
