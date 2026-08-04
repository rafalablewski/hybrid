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
  // NOTE: nav icons are NOT stored here — they come from the single design-kit
  // vocabulary in theme/icons.ts (AURORA_NAV_ICONS: id → AuroraIconName), so every
  // surface renders the same line-icon set. There is no per-item glyph string.
  group: NavGroup;
  /**
   * The lowest persona that sees this item (nested — see `Persona`). Omitted =
   * `casual` (everyone sees it). So an `athlete` item is hidden from a casual
   * retail user but shown to athlete/coach/admin.
   */
  minPersona?: Persona;
  /**
   * The screen this destination has been PROMOTED onto — set when its content
   * now renders inline somewhere else (Endurance → the sport lanes at the bottom
   * of Today). Menus drop these items so the same thing isn't offered twice.
   *
   * Deliberately NOT a delete: on web the nav id is also the screen id, so
   * removing the entry would strand the screen. The route, icon, i18n label and
   * persona gate all stay live, and `navVisibleTo` / `sanitizePersonaAccess`
   * keep honouring it — only the menu listing goes.
   */
  promotedTo?: string;
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
// The home group is Today (the live daily home — "what do I do?"). Performance
// (the athlete depth hub — "how am I doing?"; the former Cockpit merged with
// the old standalone Performance screen, so the state, trajectory, injury
// depth and return-to-play all live on one page) lives in the ANALYZE group —
// it's the analysis front door. The old Dashboard is retired — its unique
// surfaces (the season phase timeline + injury-risk-by-tissue) live on Today
// now. Onboarding ("Get started") is no longer a standalone tab either: it's a
// reachable flow (first run, and Performance's "Set up / change plan"), not a
// persistent nav item.
export const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", group: "home" },
  { id: "notifications", label: "Notifications", group: "home" },

  { id: "log", label: "Log session", group: "train" },
  { id: "timer", label: "Interval timer", group: "train" },
  { id: "runtrack", label: "Run tracking", group: "train" },
  { id: "calendar", label: "Calendar", group: "train" },
  { id: "builder", label: "Builder", group: "train" },
  { id: "plans", label: "Plans", group: "train" },
  { id: "periodize", label: "Periodize", group: "train", minPersona: "athlete" },
  { id: "sport", label: "Sport", group: "train", minPersona: "athlete" },
  { id: "competition", label: "Competition", group: "train", minPersona: "athlete" },

  // Statistics is folded into HISTORY as its "trend" view — History already
  // owned everything past this week, and a second destination charting the same
  // sessions at a coarser grain was the same screen twice. Analytics is merged
  // onto Today as the "This week" verdict card. Promoted, not deleted — the
  // routes, icons, labels and gates all stay live.
  { id: "statistics", label: "Statistics", group: "analyze", promotedTo: "history" },
  { id: "performance", label: "Performance", group: "analyze", minPersona: "athlete" },
  { id: "analytics", label: "Analytics", group: "analyze", minPersona: "athlete", promotedTo: "today" },
  // Volume and Trends are DESTINATIONS again. They were promoted onto the
  // Performance page in the merge, which appended two whole screens to its
  // scroll — roughly two thirds of the tab's height — behind a page that opens
  // with a single number. Performance keeps Volume's hero week-shape and a
  // Trends door; everything behind those two doors lives here.
  { id: "volume", label: "Volume", group: "analyze", minPersona: "athlete" },
  // The model behind the volume bands — the landmark fields, the profile form
  // and the two model switches. They were ~50 controls hidden inside the Volume
  // SCREEN behind an edit toggle, where a mistyped number silently rewrote
  // every band and verdict above it. Promoted to Volume so the menus don't
  // offer a settings surface beside the screen it configures; reached from
  // Volume's own header and its provenance card.
  { id: "volume-model", label: "Volume model", group: "analyze", minPersona: "athlete", promotedTo: "volume" },
  { id: "exercises", label: "Exercises", group: "analyze" }, // free for ALL — per-exercise progress is a universal hook, not paid depth
  { id: "trends", label: "Trends", group: "analyze", minPersona: "athlete" },
  { id: "velocity", label: "Velocity (VBT)", group: "analyze", minPersona: "athlete" },
  // Promoted onto Today as the sport lanes (endurance-lanes.ts) — still routable
  // from a lane's "See all", just no longer its own entry in More.
  { id: "endurance", label: "Endurance", group: "analyze", minPersona: "athlete", promotedTo: "today" },
  { id: "forceplate", label: "Force plate", group: "analyze", minPersona: "athlete" },
  { id: "video", label: "Video", group: "analyze", minPersona: "athlete" },
  { id: "history", label: "History", group: "analyze" },

  { id: "checkin", label: "Check-in", group: "recovery" },
  { id: "nutrition", label: "Nutrition", group: "recovery" },
  { id: "progress", label: "Progress photos", group: "recovery" },
  { id: "longevity", label: "Longevity", group: "recovery", minPersona: "athlete" },

  // ---- Social (everyone) — follow friends, browse results, find a coach ----
  { id: "feed", label: "Feed", group: "social" },
  { id: "discover", label: "Find friends", group: "social" },
  { id: "leaderboard", label: "Leaderboard", group: "social" },
  { id: "coaches", label: "Coaches", group: "social" },

  { id: "coach", label: "Coach", group: "teams", minPersona: "coach" },
  { id: "squad", label: "Squad monitor", group: "teams", minPersona: "coach" },
  { id: "teamcompare", label: "Team compare", group: "teams", minPersona: "coach" },
  { id: "org", label: "Organization", group: "teams", minPersona: "coach" },
  { id: "talent", label: "Talent", group: "teams", minPersona: "athlete" },
  { id: "tactical", label: "Tactical", group: "teams", minPersona: "coach" },

  { id: "profile", label: "Profile", group: "account" },
  { id: "connections", label: "Connections", group: "account", minPersona: "athlete" },
  { id: "settings", label: "Settings", group: "account" },
];

const PERSONA_RANK: Record<Persona, number> = { casual: 0, athlete: 1, coach: 2, admin: 3 };
const ALL_PERSONAS: Persona[] = ["casual", "athlete", "coach", "admin"];

/**
 * The three scopes of the Analytics dashboard. Both clients render all three —
 * web↔mobile parity is absolute, so neither client owns a surface the other
 * lacks.
 */
export type AnalyticsScope = "athlete" | "coach" | "operator";

/**
 * Which Analytics scopes an auth ROLE may view. Derived from the role, never
 * from the self-serve persona — choosing "athlete" mode must not hand anyone a
 * coach roster or the platform aggregates.
 *
 * The scopes NEST the same way personas do (see {@link Persona}): a coach keeps
 * their own athlete dashboard because a coach trains too, and an admin sees
 * everything. Shared so web and mobile can't disagree on who sees whose data.
 */
export function analyticsScopesFor(role: AuthRole): AnalyticsScope[] {
  if (role === "admin") return ["athlete", "coach", "operator"];
  if (role === "coach") return ["athlete", "coach"];
  return ["athlete"];
}

/** Coerce a stored/held scope to one the role may actually view (else the
 *  athlete scope) — so a demotion can never leave someone on a scope they've
 *  lost access to. */
export function resolveAnalyticsScope(role: AuthRole, wanted: AnalyticsScope): AnalyticsScope {
  return analyticsScopesFor(role).includes(wanted) ? wanted : "athlete";
}

/** The i18n key for a scope's tab label. */
export function analyticsScopeLabelKey(scope: AnalyticsScope): string {
  return `analytics.scope.${scope}`;
}

/** The i18n key for a scope's PRIVACY note — the "what this scope can and
 *  cannot see" line both clients show above the charts. */
export function analyticsScopePrivacyKey(scope: AnalyticsScope): string {
  return `analytics.privacy.${scope}`;
}

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

/**
 * The client's EFFECTIVE Simple/Full choice — the stored choice read in the
 * light of WHEN it was made. Both clients pipe their persisted choice through
 * this before {@link resolvePersona}.
 *
 * The choice lives on the DEVICE (localStorage / AsyncStorage); the entitlement
 * lives on the ACCOUNT. A "casual" recorded while the account was still FREE is
 * just the onboarding answer of someone who had no other option — it is NOT a
 * decision to decline Full, and it must not survive the upgrade. Without this,
 * a user who becomes paid any way OTHER than tapping upgrade in that very app
 * instance (paid on the web and opened the phone, restored an IAP, or was
 * granted Full by an admin) keeps the free surface on every device still
 * holding that old answer — Cockpit/Performance, HPI and Recipes stay locked
 * with a "Switch to Full" button as the only escape, and no server-side signal
 * can clear it. So a stale free-era "casual" is dropped once the account is
 * paid.
 *
 * A "casual" chosen DELIBERATELY while already paid (Settings → Mode → Simple)
 * is a real preference and is honoured — that's what `storedWhilePaid` records.
 *
 * @param stored the persisted choice (null/undefined = never chosen).
 * @param storedWhilePaid whether the account was already paid when it was
 *   stored. Legacy values written before this was tracked read as `false`,
 *   which is exactly right: they predate the upgrade.
 */
export function effectiveClientChoice(
  stored: ClientPersona | null | undefined,
  storedWhilePaid: boolean,
  entitlement: Entitlement = "free",
): ClientPersona | undefined {
  if (stored === "casual" && !storedWhilePaid && entitlement === "paid") return undefined;
  return stored ?? undefined;
}

/** The nav items a persona should see (nested — a higher persona sees more),
 *  honouring any admin `PersonaAccess` override. */
export function navForPersona(persona: Persona, items: NavItem[] = NAV_ITEMS, access?: PersonaAccess): NavItem[] {
  const rank = PERSONA_RANK[persona];
  return items.filter((i) => PERSONA_RANK[effectiveMinPersona(i, access)] <= rank);
}

/** A nav item paired with whether the current persona has it LOCKED (visible as a
 *  Full upsell) vs unlocked (accessible). */
export interface NavItemLocked {
  item: NavItem;
  locked: boolean;
}

/**
 * The nav items a persona should SEE, but with premium (Full/athlete-tier) items
 * the persona hasn't unlocked marked `locked` instead of hidden — so a FREE user
 * sees the whole toolkit with a 🔒 and can tap through to upgrade (rather than the
 * old "clean nav" that hid them entirely). Coach/admin-only tools stay HIDDEN for
 * lower personas — they're role-gated, not purchasable with a Full upgrade.
 */
export function navForPersonaWithLocks(
  persona: Persona,
  items: NavItem[] = NAV_ITEMS,
  access?: PersonaAccess,
): NavItemLocked[] {
  const rank = PERSONA_RANK[persona];
  const athleteRank = PERSONA_RANK.athlete;
  return items.flatMap((it): NavItemLocked[] => {
    const minRank = PERSONA_RANK[effectiveMinPersona(it, access)];
    if (minRank <= rank) return [{ item: it, locked: false }]; // accessible
    // Above the persona's rank: show it LOCKED only if it's a Full (athlete-tier)
    // item AND the user is a casual who could buy Full to unlock it. Coach/admin
    // items (higher rank) stay hidden.
    if (persona === "casual" && minRank <= athleteRank) return [{ item: it, locked: true }];
    return [];
  });
}

/** Grouped variant of {@link navForPersonaWithLocks}, in canonical group order. */
export function groupedNavWithLocks(
  persona: Persona,
  access?: PersonaAccess,
): { group: NavGroup; items: NavItemLocked[] }[] {
  // Promoted destinations render inline on another screen, so listing them here
  // too would offer the same thing twice. They stay routable — see NavItem.
  const withLocks = navForPersonaWithLocks(persona, NAV_ITEMS, access).filter((x) => !x.item.promotedTo);
  return NAV_GROUP_ORDER.map((group) => ({ group, items: withLocks.filter((x) => x.item.group === group) })).filter(
    (g) => g.items.length > 0,
  );
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
