import { Redirect } from "expo-router";

/**
 * Trends is now a SECTION of the unified Performance page, not a screen of its
 * own (see the `performance-unified` capability). The route stays so saved
 * links, the More hub's map and anything already pointing here still land
 * somewhere real — it just lands on the page that now holds the content.
 */
export default function Trends() {
  return <Redirect href="/performance" />;
}
