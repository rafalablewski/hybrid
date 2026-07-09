/**
 * Canonical navigation map — the single source of truth for nav item ids,
 * icons and grouping, shared by the web sidebar + ⌘K command hub and the mobile
 * command sheet so the two can't drift. Labels are localized per client via
 * i18n (`nav.<id>`); `label` here is the English fallback.
 *
 * Each client maps an item `id` to its own destination (web: an app-shell
 * screen id — the id IS the screen; mobile: an expo-router href) and may show a
 * subset (filtered by feature flags on web, by available routes on mobile).
 */
export type NavGroup = "home" | "train" | "analyze" | "recovery" | "social" | "teams" | "account";

/**
 * Who the app is shaping itself for. Derived from the auth role plus, for a
 * client, the "how do you train?" choice made at onboarding:
 *   • casual  — Average Joe: a frictionless logger + share loop (the lean set).
 *   • athlete — data/technique athlete: casual PLUS the depth (analytics, sport,
 *               periodization, velocity, etc.).
 *   • coach   — athlete PLUS the coaching console (roster, squad, org).
 *   • admin   — everything (the operator god view).
 * The personas NEST: casual ⊂ athlete ⊂ coach ⊂ admin, so a higher persona sees
 * everything the lower ones do plus its own surface.
 */
export type Persona = "casual" | "athlete" | "coach" | "admin";

/** The client-only sub-choice. A client picks the lean tracker (casual, free)
 *  or the full athlete toolkit (athlete, a PAID upgrade — see Entitlement).
 *  Coach is NOT a self-serve choice: the coach surface comes only from a
 *  verified COACH role (granted after an admin approves a coach application). */
export type ClientPersona = "casual" | "athlete";

/** Billing entitlement on the account. "paid" unlocks the athlete (Full)
 *  experience; "free" is the default (casual/Simple only). Read from the auth
 *  session on both clients; the real purchase flow is still pending (billing). */
export type Entitlement = "free" | "paid";

/** The account's auth role, lowercased. Mirrors the Prisma Role enum
 *  (CLIENT|COACH|ADMIN). This is access-control input, so both clients MUST
 *  derive it the same way — hence these shared normalizers (a drift between web
 *  and mobile here would mean the two clients disagree on who is admin/paid). */
export type AuthRole = "client" | "coach" | "admin";

/** Coerce any raw role value (DB uppercase, metadata, unknown) to an AuthRole.
 *  (Distinct from security.normalizeRole, which yields the server-side uppercase
 *  SecurityRole|null; this is the lowercase client-facing role both apps use.) */
export function normalizeAuthRole(raw: unknown): AuthRole {
  const s = String(raw ?? "client").toLowerCase();
  return s === "coach" || s === "admin" ? s : "client";
}

/** Coerce any raw entitlement value to an Entitlement (default "free"). */
export function normalizeEntitlement(raw: unknown): Entitlement {
  return String(raw ?? "free").toLowerCase() === "paid" ? "paid" : "free";
}

export interface NavItem {
  /** stable id — also the web screen id, and the i18n key suffix (nav.<id>) */
  id: string;
  /** English fallback label (clients prefer the localized nav.<id>) */
  label: string;
  /** glyph icon */
  icon: string;
  group: NavGroup;
  /**
   * The lowest persona that sees this item (nested — see `Persona`). Omitted =
   * `casual` (everyone sees it). So an `athlete` item is hidden from a casual
   * retail user but shown to athlete/coach/admin.
   */
  minPersona?: Persona;
}

/** Render order of the groups. */
export const NAV_GROUP_ORDER: NavGroup[] = ["home", "train", "analyze", "recovery", "social", "teams", "account"];

// DEFAULT ACCESS POLICY (the "done deal" — an admin can override any of this in
// Access control). The guiding rule: don't overload retail.
//   • CASUAL (Average Joe) — the lean loop only: train, review, share, basic
//     health (today/log/history/calendar/nutrition/progress/check-in) + setup,
//     PLUS the routine Builder (composing your own workout is free).
//   • ATHLETE — adds the depth + analytics (cockpit/plans/periodize/
//     sport/competition/performance/velocity/running/force-plate/video/longevity/
//     talent/connections).
//   • COACH — adds the coaching console (coach/squad/team-compare/org/tactical),
//     on top of all the athlete depth (a coach trains too).
//   • ADMIN — everything.
//
// The home group is two tabs: Today (the live daily home) + Cockpit (the athlete
// depth hub). The old Dashboard is retired — its unique surfaces (the season
// phase timeline + injury-risk-by-tissue) live on Today now. Onboarding ("Get
// started") is no longer a standalone tab either: it's a reachable flow (first
// run, and Cockpit's "Set up / change plan"), not a persistent nav item.
export const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", icon: "➤", group: "home" },
  { id: "cockpit", label: "Cockpit", icon: "◈", group: "home", minPersona: "athlete" },
  { id: "notifications", label: "Notifications", icon: "🔔", group: "home" },

  { id: "log", label: "Log session", icon: "✎", group: "train" },
  { id: "timer", label: "Interval timer", icon: "⏱", group: "train" },
  { id: "runtrack", label: "Run tracking", icon: "📍", group: "train" },
  { id: "calendar", label: "Calendar", icon: "▦", group: "train" },
  { id: "builder", label: "Builder", icon: "⊕", group: "train" },
  { id: "plans", label: "Plans", icon: "▤", group: "train" },
  { id: "periodize", label: "Periodize", icon: "◰", group: "train", minPersona: "athlete" },
  { id: "sport", label: "Sport", icon: "◎", group: "train", minPersona: "athlete" },
  { id: "competition", label: "Competition", icon: "▲", group: "train", minPersona: "athlete" },

  { id: "statistics", label: "Statistics", icon: "📊", group: "analyze" },
  { id: "performance", label: "Performance", icon: "◈", group: "analyze", minPersona: "athlete" },
  { id: "analytics", label: "Analytics", icon: "◷", group: "analyze", minPersona: "athlete" },
  { id: "volume", label: "Volume", icon: "▦", group: "analyze", minPersona: "athlete" },
  { id: "exercises", label: "Exercises", icon: "≡", group: "analyze", minPersona: "athlete" },
  { id: "trends", label: "Trends", icon: "↗", group: "analyze", minPersona: "athlete" },
  { id: "velocity", label: "Velocity (VBT)", icon: "⚡", group: "analyze", minPersona: "athlete" },
  { id: "running", label: "Running", icon: "🏃", group: "analyze", minPersona: "athlete" },
  { id: "forceplate", label: "Force plate", icon: "◇", group: "analyze", minPersona: "athlete" },
  { id: "video", label: "Video", icon: "▷", group: "analyze", minPersona: "athlete" },
  { id: "history", label: "History", icon: "≣", group: "analyze" },

  { id: "checkin", label: "Check-in", icon: "✓", group: "recovery" },
  { id: "nutrition", label: "Nutrition", icon: "🍎", group: "recovery" },
  { id: "progress", label: "Progress photos", icon: "📸", group: "recovery" },
  { id: "longevity", label: "Longevity", icon: "❤", group: "recovery", minPersona: "athlete" },

  // ---- Social (everyone) — follow friends, browse results, find a coach ----
  { id: "feed", label: "Feed", icon: "📣", group: "social" },
  { id: "discover", label: "Find friends", icon: "🧭", group: "social" },
  { id: "leaderboard", label: "Leaderboard", icon: "🏆", group: "social" },
  { id: "coaches", label: "Coaches", icon: "✦", group: "social" },

  { id: "coach", label: "Coach", icon: "✦", group: "teams", minPersona: "coach" },
  { id: "squad", label: "Squad monitor", icon: "◫", group: "teams", minPersona: "coach" },
  { id: "teamcompare", label: "Team compare", icon: "⚖", group: "teams", minPersona: "coach" },
  { id: "org", label: "Organization", icon: "⬡", group: "teams", minPersona: "coach" },
  { id: "talent", label: "Talent", icon: "✸", group: "teams", minPersona: "athlete" },
  { id: "tactical", label: "Tactical", icon: "▰", group: "teams", minPersona: "coach" },

  { id: "profile", label: "Profile", icon: "◐", group: "account" },
  { id: "connections", label: "Connections", icon: "⌁", group: "account", minPersona: "athlete" },
  { id: "settings", label: "Settings", icon: "⚙", group: "account" },
];

const PERSONA_RANK: Record<Persona, number> = { casual: 0, athlete: 1, coach: 2, admin: 3 };
const ALL_PERSONAS: Persona[] = ["casual", "athlete", "coach", "admin"];

/**
 * Admin override of which persona each nav item is visible from — a sparse
 * `{ navId: minPersona }` map layered over the code `minPersona` defaults, so an
 * admin can (e.g.) drop Velocity/Analytics to `casual` to give a retail user the
 * stats, or raise an item to hide it. Persisted as the `access.personaNav` flag
 * value (see flags.ts). Empty = pure code defaults.
 */
export type PersonaAccess = Record<string, Persona>;

/** The effective minimum persona for an item — admin override else code default. */
function effectiveMinPersona(item: NavItem, access?: PersonaAccess): Persona {
  return access?.[item.id] ?? item.minPersona ?? "casual";
}

/** Resolve the active persona from the auth role, a client's mode choice, and
 *  the account's billing entitlement. A coach/admin role outranks everything; a
 *  client gets the athlete (Full) surface only when they've both chosen it AND
 *  carry a paid entitlement — otherwise they stay casual (Simple, free).
 *
 *  Being COACHED does NOT grant Full. A client linked to a coach stays casual
 *  and gets a READ-ONLY view of what the coach assigned (plans, programs, diet)
 *  — surfaced via the separate `useHasActiveCoach` flag on each client. Editing,
 *  adding and the adaptive engine stay a paid (athlete) upgrade, so a coach link
 *  can never be used to obtain Pro for free. */
export function resolvePersona(
  role: "client" | "coach" | "admin",
  clientChoice?: ClientPersona,
  entitlement: Entitlement = "free",
): Persona {
  if (role === "admin") return "admin";
  if (role === "coach") return "coach";
  // A paid client gets the Full (athlete) surface by DEFAULT — paying for Full
  // shouldn't require flipping a separate mode toggle (that Simple/Full switch is
  // retired). They only fall back to casual if they've EXPLICITLY chosen Simple.
  if (entitlement === "paid" && clientChoice !== "casual") return "athlete";
  return "casual";
}

/** The nav items a persona should see (nested — a higher persona sees more),
 *  honouring any admin `PersonaAccess` override. */
export function navForPersona(persona: Persona, items: NavItem[] = NAV_ITEMS, access?: PersonaAccess): NavItem[] {
  const rank = PERSONA_RANK[persona];
  return items.filter((i) => PERSONA_RANK[effectiveMinPersona(i, access)] <= rank);
}

/** Whether a single nav id is visible to a persona (admin override aware). */
export function navVisibleTo(persona: Persona, id: string, access?: PersonaAccess): boolean {
  const item = NAV_ITEMS.find((i) => i.id === id);
  if (!item) return false;
  return PERSONA_RANK[persona] >= PERSONA_RANK[effectiveMinPersona(item, access)];
}

/** Validate raw JSON (e.g. a flag value) into a clean PersonaAccess — only known
 *  nav ids mapped to valid personas survive, so a bad payload can't break nav. */
export function sanitizePersonaAccess(raw: unknown): PersonaAccess {
  const out: PersonaAccess = {};
  if (!raw || typeof raw !== "object") return out;
  const ids = new Set(NAV_ITEMS.map((i) => i.id));
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ids.has(k) && typeof v === "string" && (ALL_PERSONAS as string[]).includes(v)) {
      out[k] = v as Persona;
    }
  }
  return out;
}

/** Group the items (optionally a filtered subset) in canonical group order. */
export function groupedNav(items: NavItem[] = NAV_ITEMS): { group: NavGroup; items: NavItem[] }[] {
  return NAV_GROUP_ORDER.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}
