import { Redirect } from "expo-router";

/** The standalone Performance screen merged into the Performance tab (the
 *  ex-Cockpit) — this stub keeps stale "/performance" deep links working. */
export default function Performance() {
  return <Redirect href="/(tabs)/performance" />;
}
