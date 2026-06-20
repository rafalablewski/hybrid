import AuroraProfile from "../../components/aurora/profile";

/**
 * "You" — the account / profile tab. Renders AuroraProfile; it's built on the
 * shared theme + engines, so it reads correctly under either template and the
 * route stays reachable (and the app keeps compiling) on both skins.
 */
export default function You() {
  return <AuroraProfile />;
}
