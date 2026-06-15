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
export type NavGroup = "home" | "train" | "analyze" | "recovery" | "teams" | "account";

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

/** The client-only sub-choice. A client can opt into the coach experience
 *  (self-serve) — coaching others is relationship-gated, not a privileged role,
 *  so no role change is needed. */
export type ClientPersona = "casual" | "athlete" | "coach";

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
export const NAV_GROUP_ORDER: NavGroup[] = ["home", "train", "analyze", "recovery", "teams", "account"];

export const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", icon: "➤", group: "home" },
  { id: "cockpit", label: "Cockpit", icon: "◈", group: "home", minPersona: "athlete" },
  { id: "dashboard", label: "Dashboard", icon: "◆", group: "home" },
  { id: "onboarding", label: "Get started", icon: "✦", group: "home" },

  { id: "log", label: "Log session", icon: "✎", group: "train" },
  { id: "calendar", label: "Calendar", icon: "▦", group: "train" },
  { id: "builder", label: "Builder", icon: "⊕", group: "train", minPersona: "athlete" },
  { id: "plans", label: "Plans", icon: "▤", group: "train", minPersona: "athlete" },
  { id: "periodize", label: "Periodize", icon: "◰", group: "train", minPersona: "athlete" },
  { id: "sport", label: "Sport", icon: "◎", group: "train", minPersona: "athlete" },
  { id: "competition", label: "Competition", icon: "▲", group: "train", minPersona: "athlete" },

  { id: "performance", label: "Performance", icon: "◈", group: "analyze", minPersona: "athlete" },
  { id: "analytics", label: "Analytics", icon: "◷", group: "analyze", minPersona: "athlete" },
  { id: "velocity", label: "Velocity (VBT)", icon: "⚡", group: "analyze", minPersona: "athlete" },
  { id: "running", label: "Running", icon: "🏃", group: "analyze", minPersona: "athlete" },
  { id: "forceplate", label: "Force plate", icon: "◇", group: "analyze", minPersona: "athlete" },
  { id: "video", label: "Video", icon: "▷", group: "analyze", minPersona: "athlete" },
  { id: "history", label: "History", icon: "≣", group: "analyze" },

  { id: "checkin", label: "Check-in", icon: "✓", group: "recovery" },
  { id: "nutrition", label: "Nutrition", icon: "🍎", group: "recovery" },
  { id: "progress", label: "Progress photos", icon: "📸", group: "recovery" },
  { id: "longevity", label: "Longevity", icon: "❤", group: "recovery", minPersona: "athlete" },

  { id: "coach", label: "Coach", icon: "✦", group: "teams", minPersona: "coach" },
  { id: "squad", label: "Squad monitor", icon: "◫", group: "teams", minPersona: "coach" },
  { id: "teamcompare", label: "Team compare", icon: "⚖", group: "teams", minPersona: "coach" },
  { id: "org", label: "Organization", icon: "⬡", group: "teams", minPersona: "coach" },
  { id: "talent", label: "Talent", icon: "✸", group: "teams", minPersona: "athlete" },
  { id: "tactical", label: "Tactical", icon: "▰", group: "teams", minPersona: "coach" },

  { id: "connections", label: "Connections", icon: "⌁", group: "account", minPersona: "athlete" },
  { id: "roles", label: "Roles & access", icon: "⚿", group: "account" },
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

/** Resolve the active persona from the auth role + a client's onboarding choice. */
export function resolvePersona(
  role: "client" | "coach" | "admin",
  clientChoice?: ClientPersona,
): Persona {
  if (role === "admin") return "admin";
  if (role === "coach") return "coach";
  return clientChoice ?? "casual";
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
