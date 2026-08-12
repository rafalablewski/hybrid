import type { Href } from "expo-router";

/**
 * NAV ID → MOBILE ROUTE.
 *
 * The canonical nav ids live in @hybrid/core (nav.ts); this is the one place
 * that says where each of them goes on this client. It used to live inside the
 * More tab's springboard, which meant the map died with that screen — it is a
 * routing table, not a screen's private detail, so it lives in lib/ now and is
 * read by the side menu (components/aurora/side-menu.tsx) and by the web ↔
 * mobile parity guard (apps/web/__tests__/parity.test.ts).
 *
 * An id ABSENT from this map has no mobile surface; the side menu marks those
 * and opens the web app instead, so access granted to a user is never silently
 * invisible. Adding a screen means adding it here.
 */
export const NAV_HREF: Record<string, Href> = {
  today: "/(tabs)",
  performance: "/performance",
  notifications: "/notifications",
  log: "/workout?source=empty",
  timer: "/interval-timer",
  runtrack: "/run-track",
  calendar: "/calendar",
  builder: "/builder",
  plans: "/plans",
  periodize: "/periodize",
  sport: "/sport",
  analytics: "/analytics",
  statistics: "/statistics",
  volume: "/volume",
  // The one hyphenated nav id. Its route has existed since Volume gained its
  // own model screen; the springboard entry was missed because the parity
  // guard's scan couldn't see a hyphen (see apps/web/__tests__/parity.test.ts).
  "volume-model": "/volume-model",
  exercises: "/exercises",
  trends: "/trends",
  velocity: "/velocity",
  endurance: "/endurance",
  history: "/history",
  checkin: "/checkin",
  nutrition: "/nutrition",
  progress: "/progress",
  feed: "/feed",
  messages: "/(tabs)/messages",
  discover: "/discover",
  saved: "/saved",
  leaderboard: "/leaderboard",
  coaches: "/coaches",
  coach: "/coach",
  squad: "/squad",
  teamcompare: "/team-compare",
  profile: "/(tabs)/you",
  connections: "/connections",
  settings: "/settings",
  help: "/help",
  // Onboarding is a re-runnable setup FLOW rather than a nav item, but it has a
  // route and the side menu injects it into Train, so it is listed here too.
  onboarding: "/onboarding",
};
