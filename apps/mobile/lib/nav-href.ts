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
 * Every canonical nav id must appear here, and apps/web/__tests__/parity.test.ts
 * fails the build if one does not. There is no longer a fallback: this used to
 * say an absent id "opens the web app instead", which stopped being true when
 * the web client was retired in Aug 2026 — an absent id now opens nothing.
 * Adding a screen means adding it here; removing one means removing its nav id
 * too, not leaving the id pointing at a route that no longer exists.
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
  // No `volume` route: Volume is a card on Performance, not a screen. What the
  // athlete told us ABOUT THEMSELVES is a real screen, and the one the volume
  // bands are built from.
  questionnaire: "/questionnaire",
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
